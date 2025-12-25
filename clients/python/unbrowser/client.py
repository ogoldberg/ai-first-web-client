"""
Unbrowser Python Client

HTTP client for the Unbrowser cloud API.
"""

import time
from typing import Any, Callable, Optional, Union
from urllib.parse import urlencode

import requests

from .types import (
    BatchResult,
    BrowseOptions,
    BrowsePreview,
    BrowseResult,
    DomainIntelligence,
    ReplayResult,
    SessionData,
    WorkflowDetails,
    WorkflowInfo,
)


class UnbrowserError(Exception):
    """Base exception for Unbrowser errors."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"


class AuthenticationError(UnbrowserError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Invalid or missing API key"):
        super().__init__("UNAUTHORIZED", message)


class RateLimitError(UnbrowserError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
    ):
        super().__init__("RATE_LIMITED", message)
        self.retry_after = retry_after


class ValidationError(UnbrowserError):
    """Raised when request validation fails."""

    def __init__(self, message: str):
        super().__init__("INVALID_REQUEST", message)


class UnbrowserClient:
    """
    Client for the Unbrowser cloud API.

    Example:
        >>> client = UnbrowserClient(api_key="ub_live_xxxxx")
        >>> result = client.browse("https://example.com")
        >>> print(result.content.markdown)

    Args:
        api_key: API key for authentication (required).
            Must start with "ub_live_" or "ub_test_".
        base_url: Base URL for the API.
            Default: https://api.unbrowser.ai
        timeout: Request timeout in seconds. Default: 60
        retry: Whether to retry failed requests. Default: True
        max_retries: Maximum retry attempts. Default: 3
    """

    DEFAULT_BASE_URL = "https://api.unbrowser.ai"
    DEFAULT_TIMEOUT = 60
    DEFAULT_MAX_RETRIES = 3

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
        retry: bool = True,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        if not api_key:
            raise ValidationError("api_key is required")
        if not api_key.startswith("ub_"):
            raise ValidationError("Invalid API key format. Must start with 'ub_'")

        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.retry = retry
        self.max_retries = max_retries

        # Create a session for connection pooling
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "unbrowser-python/0.1.0",
            }
        )

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict[str, Any]] = None,
    ) -> Any:
        """Make an authenticated request to the API."""
        url = f"{self.base_url}{path}"
        last_error: Optional[Exception] = None
        attempts = self.max_retries if self.retry else 1

        for attempt in range(1, attempts + 1):
            try:
                if method == "GET":
                    response = self._session.get(url, timeout=self.timeout)
                elif method == "POST":
                    response = self._session.post(
                        url, json=body, timeout=self.timeout
                    )
                elif method == "DELETE":
                    response = self._session.delete(
                        url, json=body, timeout=self.timeout
                    )
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                # Handle rate limiting
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    raise RateLimitError(
                        "Daily request limit exceeded",
                        retry_after=int(retry_after) if retry_after else None,
                    )

                # Handle authentication errors
                if response.status_code == 401:
                    raise AuthenticationError()

                if response.status_code == 403:
                    raise UnbrowserError(
                        "FORBIDDEN", "API key does not have access to this resource"
                    )

                # Parse response
                result = response.json()

                if not result.get("success", False):
                    error = result.get("error", {})
                    code = error.get("code", "UNKNOWN_ERROR")
                    message = error.get("message", "Unknown error")
                    raise UnbrowserError(code, message)

                return result.get("data")

            except (requests.Timeout, requests.ConnectionError) as e:
                last_error = e
                # Don't retry on certain errors
                if isinstance(e, requests.Timeout):
                    if attempt < attempts:
                        time.sleep(2**attempt)
                        continue
                raise UnbrowserError("TIMEOUT", str(e))

            except (AuthenticationError, RateLimitError, ValidationError):
                # Don't retry auth/rate limit errors
                raise

            except UnbrowserError as e:
                # Don't retry client errors
                if e.code in ["INVALID_REQUEST", "INVALID_URL", "FORBIDDEN"]:
                    raise
                last_error = e
                if attempt < attempts:
                    time.sleep(2**attempt)
                    continue
                raise

        if last_error:
            raise last_error
        raise UnbrowserError("UNKNOWN_ERROR", "Request failed")

    def browse(
        self,
        url: str,
        options: Optional[BrowseOptions] = None,
        session: Optional[SessionData] = None,
    ) -> BrowseResult:
        """
        Browse a URL and extract content.

        Args:
            url: URL to browse.
            options: Browse options (content type, selectors, etc.).
            session: Session data (cookies, localStorage).

        Returns:
            BrowseResult with extracted content and metadata.

        Example:
            >>> result = client.browse(
            ...     "https://example.com/products/123",
            ...     options=BrowseOptions(
            ...         content_type=ContentType.MARKDOWN,
            ...         max_chars=10000,
            ...     ),
            ... )
            >>> print(result.title)
            >>> print(result.content.markdown)
        """
        body: dict[str, Any] = {"url": url}
        if options:
            body["options"] = options.to_dict()
        if session:
            body["session"] = session.to_dict()

        data = self._request("POST", "/v1/browse", body)
        return BrowseResult.from_dict(data)

    def preview_browse(
        self,
        url: str,
        options: Optional[BrowseOptions] = None,
    ) -> BrowsePreview:
        """
        Preview what will happen when browsing a URL (without executing).

        Returns execution plan, time estimates, and confidence levels.
        Completes in <50ms vs 2-5s for browser automation.

        Args:
            url: URL to preview.
            options: Browse options.

        Returns:
            BrowsePreview with execution plan and estimates.

        Example:
            >>> preview = client.preview_browse("https://reddit.com/r/programming")
            >>> print(f"Expected time: {preview.estimated_time.expected}ms")
            >>> print(f"Confidence: {preview.confidence.overall}")
        """
        body: dict[str, Any] = {"url": url}
        if options:
            body["options"] = options.to_dict()

        data = self._request("POST", "/v1/browse/preview", body)
        return BrowsePreview.from_dict(data)

    def fetch(
        self,
        url: str,
        options: Optional[BrowseOptions] = None,
        session: Optional[SessionData] = None,
    ) -> BrowseResult:
        """
        Fast content fetch using tiered rendering.

        Starts with the fastest tier and only escalates if content
        extraction fails. Use this for bulk operations or when speed
        is critical.

        Args:
            url: URL to fetch.
            options: Browse options.
            session: Session data.

        Returns:
            BrowseResult with extracted content.
        """
        body: dict[str, Any] = {"url": url}
        if options:
            body["options"] = options.to_dict()
        if session:
            body["session"] = session.to_dict()

        data = self._request("POST", "/v1/fetch", body)
        return BrowseResult.from_dict(data)

    def batch(
        self,
        urls: list[str],
        options: Optional[BrowseOptions] = None,
        session: Optional[SessionData] = None,
    ) -> BatchResult:
        """
        Browse multiple URLs in parallel.

        Args:
            urls: List of URLs to browse.
            options: Browse options (applied to all URLs).
            session: Session data.

        Returns:
            BatchResult with results for each URL.

        Example:
            >>> result = client.batch([
            ...     "https://example.com/page1",
            ...     "https://example.com/page2",
            ...     "https://example.com/page3",
            ... ])
            >>> for item in result.results:
            ...     print(f"{item.url}: {'OK' if item.success else 'FAILED'}")
        """
        body: dict[str, Any] = {"urls": urls}
        if options:
            body["options"] = options.to_dict()
        if session:
            body["session"] = session.to_dict()

        data = self._request("POST", "/v1/batch", body)
        return BatchResult.from_dict(data)

    def get_domain_intelligence(self, domain: str) -> DomainIntelligence:
        """
        Get learned patterns and intelligence for a domain.

        Args:
            domain: Domain name (e.g., "example.com").

        Returns:
            DomainIntelligence with patterns and recommendations.
        """
        data = self._request("GET", f"/v1/domains/{domain}/intelligence")
        return DomainIntelligence.from_dict(data)

    def get_usage(self) -> dict[str, Any]:
        """
        Get usage statistics for the current billing period.

        Returns:
            Dictionary with period, requests, and limits.
        """
        return self._request("GET", "/v1/usage")

    def health(self) -> dict[str, Any]:
        """
        Check API health (no auth required).

        Returns:
            Dictionary with status, version, and uptime.
        """
        url = f"{self.base_url}/health"
        response = requests.get(url, timeout=self.timeout)
        return response.json()

    # Workflow Methods

    def start_recording(
        self,
        name: str,
        description: str,
        domain: str,
        tags: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Start a workflow recording session.

        Records all browse operations for later replay.

        Args:
            name: Workflow name.
            description: Workflow description.
            domain: Primary domain for the workflow.
            tags: Optional tags for categorization.

        Returns:
            Dictionary with recordingId, status, and startedAt.

        Example:
            >>> session = client.start_recording(
            ...     name="Extract product pricing",
            ...     description="Navigate to product page and extract price",
            ...     domain="example.com",
            ... )
            >>> print(session["recordingId"])
        """
        body: dict[str, Any] = {
            "name": name,
            "description": description,
            "domain": domain,
        }
        if tags:
            body["tags"] = tags
        return self._request("POST", "/v1/workflows/record/start", body)

    def stop_recording(
        self,
        recording_id: str,
        save: bool = True,
    ) -> Optional[dict[str, Any]]:
        """
        Stop a recording session and optionally save as workflow.

        Args:
            recording_id: Recording session ID.
            save: Whether to save the recording as a workflow.

        Returns:
            Dictionary with workflowId, skillId, name, steps, etc.
            None if save=False.
        """
        return self._request(
            "POST",
            f"/v1/workflows/record/{recording_id}/stop",
            {"save": save},
        )

    def annotate_recording(
        self,
        recording_id: str,
        step_number: int,
        annotation: str,
        importance: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Annotate a step in an active recording.

        Args:
            recording_id: Recording session ID.
            step_number: Step number to annotate.
            annotation: Annotation text.
            importance: Step importance (critical, important, optional).

        Returns:
            Dictionary with recordingId, stepNumber, annotated.
        """
        body: dict[str, Any] = {
            "stepNumber": step_number,
            "annotation": annotation,
        }
        if importance:
            body["importance"] = importance
        return self._request(
            "POST",
            f"/v1/workflows/record/{recording_id}/annotate",
            body,
        )

    def replay_workflow(
        self,
        workflow_id: str,
        variables: Optional[dict[str, Union[str, int, bool]]] = None,
    ) -> ReplayResult:
        """
        Replay a saved workflow with optional variable substitution.

        Args:
            workflow_id: Workflow ID.
            variables: Variable substitutions for the workflow.

        Returns:
            ReplayResult with step results and timing.

        Example:
            >>> result = client.replay_workflow(
            ...     "wf_xyz789",
            ...     variables={"productId": "456"},
            ... )
            >>> print(result.overall_success)
        """
        body: dict[str, Any] = {}
        if variables:
            body["variables"] = variables
        data = self._request("POST", f"/v1/workflows/{workflow_id}/replay", body)
        return ReplayResult.from_dict(data)

    def list_workflows(
        self,
        domain: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        List saved workflows.

        Args:
            domain: Filter by domain.
            tags: Filter by tags.

        Returns:
            Dictionary with workflows list and total count.
        """
        params = {}
        if domain:
            params["domain"] = domain
        if tags:
            params["tags"] = ",".join(tags)

        path = "/v1/workflows"
        if params:
            path = f"{path}?{urlencode(params)}"
        return self._request("GET", path)

    def get_workflow(self, workflow_id: str) -> WorkflowDetails:
        """
        Get workflow details including full step information.

        Args:
            workflow_id: Workflow ID.

        Returns:
            WorkflowDetails with full workflow information.
        """
        data = self._request("GET", f"/v1/workflows/{workflow_id}")
        return WorkflowDetails.from_dict(data)

    def delete_workflow(self, workflow_id: str) -> dict[str, Any]:
        """
        Delete a saved workflow.

        Args:
            workflow_id: Workflow ID.

        Returns:
            Dictionary with workflowId and deleted status.
        """
        return self._request("DELETE", f"/v1/workflows/{workflow_id}")

    def close(self) -> None:
        """Close the client session."""
        self._session.close()

    def __enter__(self) -> "UnbrowserClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
