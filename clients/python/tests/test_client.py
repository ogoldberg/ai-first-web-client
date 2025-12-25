"""Tests for the Unbrowser client."""

import pytest
import responses
from responses import matchers

from unbrowser import (
    UnbrowserClient,
    UnbrowserError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    BrowseOptions,
    SessionData,
    Cookie,
)
from unbrowser.types import ContentType, CostTier


class TestClientInitialization:
    """Tests for client initialization."""

    def test_requires_api_key(self) -> None:
        """Client requires an API key."""
        with pytest.raises(ValidationError, match="api_key is required"):
            UnbrowserClient(api_key="")

    def test_validates_api_key_format(self) -> None:
        """Client validates API key format."""
        with pytest.raises(ValidationError, match="Invalid API key format"):
            UnbrowserClient(api_key="invalid_key")

    def test_accepts_valid_live_key(self) -> None:
        """Client accepts valid live API key."""
        client = UnbrowserClient(api_key="ub_live_test123")
        assert client.api_key == "ub_live_test123"

    def test_accepts_valid_test_key(self) -> None:
        """Client accepts valid test API key."""
        client = UnbrowserClient(api_key="ub_test_test123")
        assert client.api_key == "ub_test_test123"

    def test_default_base_url(self) -> None:
        """Client uses default base URL."""
        client = UnbrowserClient(api_key="ub_live_test123")
        assert client.base_url == "https://api.unbrowser.ai"

    def test_custom_base_url(self) -> None:
        """Client accepts custom base URL."""
        client = UnbrowserClient(
            api_key="ub_live_test123",
            base_url="https://custom.api.com/",
        )
        assert client.base_url == "https://custom.api.com"

    def test_default_timeout(self) -> None:
        """Client uses default timeout."""
        client = UnbrowserClient(api_key="ub_live_test123")
        assert client.timeout == 60

    def test_custom_timeout(self) -> None:
        """Client accepts custom timeout."""
        client = UnbrowserClient(api_key="ub_live_test123", timeout=30)
        assert client.timeout == 30


class TestBrowse:
    """Tests for the browse method."""

    @responses.activate
    def test_browse_success(self) -> None:
        """Browse returns result on success."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse",
            json={
                "success": True,
                "data": {
                    "url": "https://example.com",
                    "finalUrl": "https://example.com/",
                    "title": "Example Domain",
                    "content": {
                        "markdown": "# Example\n\nThis is example content.",
                        "text": "Example\n\nThis is example content.",
                    },
                    "metadata": {
                        "loadTime": 150,
                        "tier": "intelligence",
                        "tiersAttempted": ["intelligence"],
                    },
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.browse("https://example.com")

        assert result.url == "https://example.com"
        assert result.final_url == "https://example.com/"
        assert result.title == "Example Domain"
        assert "Example" in result.content.markdown
        assert result.metadata.load_time == 150
        assert result.metadata.tier == "intelligence"

    @responses.activate
    def test_browse_with_options(self) -> None:
        """Browse sends options correctly."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse",
            json={
                "success": True,
                "data": {
                    "url": "https://example.com",
                    "finalUrl": "https://example.com/",
                    "title": "Example",
                    "content": {"markdown": "content", "text": "content"},
                    "metadata": {
                        "loadTime": 100,
                        "tier": "intelligence",
                        "tiersAttempted": ["intelligence"],
                    },
                },
            },
            match=[
                matchers.json_params_matcher({
                    "url": "https://example.com",
                    "options": {
                        "contentType": "markdown",
                        "maxChars": 5000,
                        "maxCostTier": "lightweight",
                    },
                })
            ],
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        options = BrowseOptions(
            content_type=ContentType.MARKDOWN,
            max_chars=5000,
            max_cost_tier=CostTier.LIGHTWEIGHT,
        )
        result = client.browse("https://example.com", options=options)

        assert result.url == "https://example.com"

    @responses.activate
    def test_browse_with_session(self) -> None:
        """Browse sends session data correctly."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse",
            json={
                "success": True,
                "data": {
                    "url": "https://example.com",
                    "finalUrl": "https://example.com/",
                    "title": "Example",
                    "content": {"markdown": "content", "text": "content"},
                    "metadata": {
                        "loadTime": 100,
                        "tier": "intelligence",
                        "tiersAttempted": ["intelligence"],
                    },
                },
            },
            match=[
                matchers.json_params_matcher({
                    "url": "https://example.com",
                    "session": {
                        "cookies": [
                            {
                                "name": "session_id",
                                "value": "abc123",
                                "domain": "example.com",
                                "path": "/",
                            }
                        ],
                    },
                })
            ],
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        session = SessionData(
            cookies=[
                Cookie(name="session_id", value="abc123", domain="example.com")
            ]
        )
        result = client.browse("https://example.com", session=session)

        assert result.url == "https://example.com"


class TestErrorHandling:
    """Tests for error handling."""

    @responses.activate
    def test_authentication_error(self) -> None:
        """Returns AuthenticationError on 401."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse",
            json={
                "success": False,
                "error": {"code": "UNAUTHORIZED", "message": "Invalid API key"},
            },
            status=401,
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        with pytest.raises(AuthenticationError):
            client.browse("https://example.com")

    @responses.activate
    def test_rate_limit_error(self) -> None:
        """Returns RateLimitError on 429."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse",
            json={
                "success": False,
                "error": {"code": "RATE_LIMITED", "message": "Limit exceeded"},
            },
            status=429,
            headers={"Retry-After": "60"},
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        with pytest.raises(RateLimitError) as exc_info:
            client.browse("https://example.com")

        assert exc_info.value.retry_after == 60

    @responses.activate
    def test_validation_error(self) -> None:
        """Returns UnbrowserError on invalid request."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse",
            json={
                "success": False,
                "error": {"code": "INVALID_URL", "message": "Invalid URL"},
            },
            status=400,
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        with pytest.raises(UnbrowserError) as exc_info:
            client.browse("invalid-url")

        assert exc_info.value.code == "INVALID_URL"


class TestBatch:
    """Tests for the batch method."""

    @responses.activate
    def test_batch_success(self) -> None:
        """Batch returns results for all URLs."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/batch",
            json={
                "success": True,
                "data": {
                    "results": [
                        {
                            "url": "https://example.com/1",
                            "success": True,
                            "data": {
                                "url": "https://example.com/1",
                                "finalUrl": "https://example.com/1",
                                "title": "Page 1",
                                "content": {"markdown": "# Page 1", "text": "Page 1"},
                                "metadata": {
                                    "loadTime": 100,
                                    "tier": "intelligence",
                                    "tiersAttempted": ["intelligence"],
                                },
                            },
                        },
                        {
                            "url": "https://example.com/2",
                            "success": False,
                            "error": {"code": "FETCH_FAILED", "message": "Failed"},
                        },
                    ],
                    "totalTime": 250,
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.batch([
            "https://example.com/1",
            "https://example.com/2",
        ])

        assert len(result.results) == 2
        assert result.results[0].success is True
        assert result.results[0].data is not None
        assert result.results[0].data.title == "Page 1"
        assert result.results[1].success is False
        assert result.results[1].error is not None
        assert result.total_time == 250


class TestFetch:
    """Tests for the fetch method."""

    @responses.activate
    def test_fetch_success(self) -> None:
        """Fetch returns result on success."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/fetch",
            json={
                "success": True,
                "data": {
                    "url": "https://example.com",
                    "finalUrl": "https://example.com/",
                    "title": "Example",
                    "content": {"markdown": "# Example", "text": "Example"},
                    "metadata": {
                        "loadTime": 50,
                        "tier": "intelligence",
                        "tiersAttempted": ["intelligence"],
                    },
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.fetch("https://example.com")

        assert result.url == "https://example.com"
        assert result.metadata.load_time == 50


class TestHealth:
    """Tests for the health method."""

    @responses.activate
    def test_health_success(self) -> None:
        """Health returns status."""
        responses.add(
            responses.GET,
            "https://api.unbrowser.ai/health",
            json={
                "status": "healthy",
                "version": "0.1.0",
                "uptime": 86400,
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.health()

        assert result["status"] == "healthy"
        assert result["version"] == "0.1.0"


class TestUsage:
    """Tests for the usage method."""

    @responses.activate
    def test_get_usage(self) -> None:
        """Get usage returns stats."""
        responses.add(
            responses.GET,
            "https://api.unbrowser.ai/v1/usage",
            json={
                "success": True,
                "data": {
                    "period": {
                        "start": "2024-01-01T00:00:00Z",
                        "end": "2024-01-31T23:59:59Z",
                    },
                    "requests": {
                        "total": 500,
                        "byTier": {"intelligence": 400, "lightweight": 100},
                    },
                    "limits": {"daily": 1000, "remaining": 500},
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.get_usage()

        assert result["requests"]["total"] == 500
        assert result["limits"]["remaining"] == 500


class TestDomainIntelligence:
    """Tests for domain intelligence."""

    @responses.activate
    def test_get_domain_intelligence(self) -> None:
        """Get domain intelligence returns patterns."""
        responses.add(
            responses.GET,
            "https://api.unbrowser.ai/v1/domains/example.com/intelligence",
            json={
                "success": True,
                "data": {
                    "domain": "example.com",
                    "knownPatterns": 12,
                    "selectorChains": 5,
                    "validators": 3,
                    "paginationPatterns": 2,
                    "recentFailures": 0,
                    "successRate": 0.95,
                    "domainGroup": None,
                    "recommendedWaitStrategy": "networkidle",
                    "shouldUseSession": False,
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.get_domain_intelligence("example.com")

        assert result.domain == "example.com"
        assert result.known_patterns == 12
        assert result.success_rate == 0.95


class TestPreviewBrowse:
    """Tests for preview_browse."""

    @responses.activate
    def test_preview_browse(self) -> None:
        """Preview browse returns execution plan."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/browse/preview",
            json={
                "success": True,
                "data": {
                    "schemaVersion": "1.0",
                    "plan": {
                        "steps": [
                            {
                                "order": 1,
                                "action": "fetch",
                                "description": "Fetch URL using intelligence tier",
                                "tier": "intelligence",
                                "expectedDuration": 100,
                                "confidence": "high",
                            }
                        ],
                        "tier": "intelligence",
                        "reasoning": "Known domain with cached patterns",
                    },
                    "estimatedTime": {
                        "min": 50,
                        "max": 200,
                        "expected": 100,
                        "breakdown": {"intelligence": 100},
                    },
                    "confidence": {
                        "overall": "high",
                        "factors": {
                            "hasLearnedPatterns": True,
                            "domainFamiliarity": "high",
                            "apiDiscovered": True,
                            "requiresAuth": False,
                            "botDetectionLikely": False,
                            "skillsAvailable": True,
                            "patternCount": 5,
                            "patternSuccessRate": 0.95,
                        },
                    },
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.preview_browse("https://example.com")

        assert result.schema_version == "1.0"
        assert len(result.plan.steps) == 1
        assert result.estimated_time.expected == 100
        assert result.confidence.overall.value == "high"


class TestWorkflows:
    """Tests for workflow methods."""

    @responses.activate
    def test_start_recording(self) -> None:
        """Start recording returns session info."""
        responses.add(
            responses.POST,
            "https://api.unbrowser.ai/v1/workflows/record/start",
            json={
                "success": True,
                "data": {
                    "recordingId": "rec_123",
                    "status": "recording",
                    "startedAt": "2024-01-01T00:00:00Z",
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.start_recording(
            name="Test workflow",
            description="Test description",
            domain="example.com",
        )

        assert result["recordingId"] == "rec_123"
        assert result["status"] == "recording"

    @responses.activate
    def test_list_workflows(self) -> None:
        """List workflows returns workflow list."""
        responses.add(
            responses.GET,
            "https://api.unbrowser.ai/v1/workflows",
            json={
                "success": True,
                "data": {
                    "workflows": [
                        {
                            "id": "wf_123",
                            "name": "Test workflow",
                            "description": "Test",
                            "domain": "example.com",
                            "tags": ["test"],
                            "steps": 3,
                            "version": 1,
                            "usageCount": 10,
                            "successRate": 0.9,
                            "createdAt": "2024-01-01T00:00:00Z",
                            "updatedAt": "2024-01-01T00:00:00Z",
                        }
                    ],
                    "total": 1,
                },
            },
        )

        client = UnbrowserClient(api_key="ub_live_test123")
        result = client.list_workflows()

        assert result["total"] == 1
        assert len(result["workflows"]) == 1
        assert result["workflows"][0]["name"] == "Test workflow"


class TestContextManager:
    """Tests for context manager support."""

    def test_context_manager(self) -> None:
        """Client can be used as context manager."""
        with UnbrowserClient(api_key="ub_live_test123") as client:
            assert client.api_key == "ub_live_test123"
