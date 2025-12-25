"""
Type definitions for the Unbrowser Python client.

These dataclasses mirror the TypeScript types from @unbrowser/core.
"""

from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum


class ContentType(str, Enum):
    """Content format options."""
    MARKDOWN = "markdown"
    TEXT = "text"
    HTML = "html"


class CostTier(str, Enum):
    """Maximum cost tier options."""
    INTELLIGENCE = "intelligence"
    LIGHTWEIGHT = "lightweight"
    PLAYWRIGHT = "playwright"


class VerificationMode(str, Enum):
    """Verification mode options."""
    BASIC = "basic"
    STANDARD = "standard"
    THOROUGH = "thorough"


class Importance(str, Enum):
    """Step importance levels."""
    CRITICAL = "critical"
    IMPORTANT = "important"
    OPTIONAL = "optional"


class DomainFamiliarity(str, Enum):
    """Domain familiarity levels."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class ConfidenceRating(str, Enum):
    """Confidence rating levels."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class Cookie:
    """HTTP cookie."""
    name: str
    value: str
    domain: Optional[str] = None
    path: Optional[str] = "/"


@dataclass
class VerifyOptions:
    """Verification options for browse requests."""
    enabled: bool = True
    mode: VerificationMode = VerificationMode.BASIC


@dataclass
class BrowseOptions:
    """Options for browse requests."""
    content_type: ContentType = ContentType.MARKDOWN
    wait_for_selector: Optional[str] = None
    scroll_to_load: bool = False
    max_chars: Optional[int] = None
    include_tables: bool = True
    max_latency_ms: Optional[int] = None
    max_cost_tier: Optional[CostTier] = None
    verify: Optional[VerifyOptions] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to API request format."""
        result: dict[str, Any] = {}
        if self.content_type:
            result["contentType"] = self.content_type.value
        if self.wait_for_selector:
            result["waitForSelector"] = self.wait_for_selector
        if self.scroll_to_load:
            result["scrollToLoad"] = self.scroll_to_load
        if self.max_chars is not None:
            result["maxChars"] = self.max_chars
        if not self.include_tables:
            result["includeTables"] = False
        if self.max_latency_ms is not None:
            result["maxLatencyMs"] = self.max_latency_ms
        if self.max_cost_tier:
            result["maxCostTier"] = self.max_cost_tier.value
        if self.verify:
            result["verify"] = {
                "enabled": self.verify.enabled,
                "mode": self.verify.mode.value,
            }
        return result


@dataclass
class SessionData:
    """Session data for authenticated requests."""
    cookies: list[Cookie] = field(default_factory=list)
    local_storage: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to API request format."""
        result: dict[str, Any] = {}
        if self.cookies:
            result["cookies"] = [
                {"name": c.name, "value": c.value, "domain": c.domain, "path": c.path}
                for c in self.cookies
            ]
        if self.local_storage:
            result["localStorage"] = self.local_storage
        return result


@dataclass
class ContentResult:
    """Extracted content from a browse operation."""
    markdown: str
    text: str
    html: Optional[str] = None


@dataclass
class TableData:
    """Extracted table data."""
    headers: list[str]
    rows: list[list[str]]


@dataclass
class DiscoveredApi:
    """Discovered API endpoint."""
    url: str
    method: str
    content_type: str


@dataclass
class BrowseMetadata:
    """Metadata about a browse operation."""
    load_time: int
    tier: str
    tiers_attempted: list[str]


@dataclass
class VerificationResult:
    """Verification result for a browse operation."""
    passed: bool
    confidence: float
    checks_run: int
    errors: Optional[list[str]] = None
    warnings: Optional[list[str]] = None


@dataclass
class BrowseResult:
    """Result of a browse operation."""
    url: str
    final_url: str
    title: str
    content: ContentResult
    metadata: BrowseMetadata
    tables: Optional[list[TableData]] = None
    discovered_apis: Optional[list[DiscoveredApi]] = None
    new_cookies: Optional[list[Cookie]] = None
    verification: Optional[VerificationResult] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BrowseResult":
        """Create from API response data."""
        content = ContentResult(
            markdown=data["content"]["markdown"],
            text=data["content"]["text"],
            html=data["content"].get("html"),
        )
        metadata = BrowseMetadata(
            load_time=data["metadata"]["loadTime"],
            tier=data["metadata"]["tier"],
            tiers_attempted=data["metadata"]["tiersAttempted"],
        )
        tables = None
        if data.get("tables"):
            tables = [
                TableData(headers=t["headers"], rows=t["rows"])
                for t in data["tables"]
            ]
        discovered_apis = None
        if data.get("discoveredApis"):
            discovered_apis = [
                DiscoveredApi(
                    url=a["url"],
                    method=a["method"],
                    content_type=a["contentType"],
                )
                for a in data["discoveredApis"]
            ]
        new_cookies = None
        if data.get("newCookies"):
            new_cookies = [
                Cookie(
                    name=c["name"],
                    value=c["value"],
                    domain=c.get("domain"),
                    path=c.get("path", "/"),
                )
                for c in data["newCookies"]
            ]
        verification = None
        if data.get("verification"):
            v = data["verification"]
            verification = VerificationResult(
                passed=v["passed"],
                confidence=v["confidence"],
                checks_run=v["checksRun"],
                errors=v.get("errors"),
                warnings=v.get("warnings"),
            )
        return cls(
            url=data["url"],
            final_url=data["finalUrl"],
            title=data["title"],
            content=content,
            metadata=metadata,
            tables=tables,
            discovered_apis=discovered_apis,
            new_cookies=new_cookies,
            verification=verification,
        )


@dataclass
class BatchResultItem:
    """Single result in a batch operation."""
    url: str
    success: bool
    data: Optional[BrowseResult] = None
    error: Optional[dict[str, str]] = None


@dataclass
class BatchResult:
    """Result of a batch browse operation."""
    results: list[BatchResultItem]
    total_time: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BatchResult":
        """Create from API response data."""
        results = []
        for r in data["results"]:
            item = BatchResultItem(
                url=r["url"],
                success=r["success"],
                data=BrowseResult.from_dict(r["data"]) if r.get("data") else None,
                error=r.get("error"),
            )
            results.append(item)
        return cls(results=results, total_time=data["totalTime"])


@dataclass
class DomainIntelligence:
    """Intelligence about a domain."""
    domain: str
    known_patterns: int
    selector_chains: int
    validators: int
    pagination_patterns: int
    recent_failures: int
    success_rate: float
    domain_group: Optional[str]
    recommended_wait_strategy: str
    should_use_session: bool

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DomainIntelligence":
        """Create from API response data."""
        return cls(
            domain=data["domain"],
            known_patterns=data.get("knownPatterns", 0),
            selector_chains=data.get("selectorChains", 0),
            validators=data.get("validators", 0),
            pagination_patterns=data.get("paginationPatterns", 0),
            recent_failures=data.get("recentFailures", 0),
            success_rate=data.get("successRate", 0.0),
            domain_group=data.get("domainGroup"),
            recommended_wait_strategy=data.get("recommendedWaitStrategy", "load"),
            should_use_session=data.get("shouldUseSession", False),
        )


# Plan Preview Types


@dataclass
class ExecutionStep:
    """A step in an execution plan."""
    order: int
    action: str
    description: str
    tier: CostTier
    expected_duration: int
    confidence: ConfidenceRating
    reason: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExecutionStep":
        """Create from API response data."""
        return cls(
            order=data["order"],
            action=data["action"],
            description=data["description"],
            tier=CostTier(data["tier"]),
            expected_duration=data["expectedDuration"],
            confidence=ConfidenceRating(data["confidence"]),
            reason=data.get("reason"),
        )


@dataclass
class ExecutionPlan:
    """An execution plan for browsing."""
    steps: list[ExecutionStep]
    tier: CostTier
    reasoning: str
    fallback_plan: Optional["ExecutionPlan"] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExecutionPlan":
        """Create from API response data."""
        steps = [ExecutionStep.from_dict(s) for s in data["steps"]]
        fallback = None
        if data.get("fallbackPlan"):
            fallback = ExecutionPlan.from_dict(data["fallbackPlan"])
        return cls(
            steps=steps,
            tier=CostTier(data["tier"]),
            reasoning=data["reasoning"],
            fallback_plan=fallback,
        )


@dataclass
class TimeEstimate:
    """Time estimate for an operation."""
    min: int
    max: int
    expected: int
    breakdown: dict[str, int]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TimeEstimate":
        """Create from API response data."""
        return cls(
            min=data["min"],
            max=data["max"],
            expected=data["expected"],
            breakdown=data["breakdown"],
        )


@dataclass
class ConfidenceFactors:
    """Factors affecting confidence."""
    has_learned_patterns: bool
    domain_familiarity: DomainFamiliarity
    api_discovered: bool
    requires_auth: bool
    bot_detection_likely: bool
    skills_available: bool
    pattern_count: int
    pattern_success_rate: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ConfidenceFactors":
        """Create from API response data."""
        return cls(
            has_learned_patterns=data["hasLearnedPatterns"],
            domain_familiarity=DomainFamiliarity(data["domainFamiliarity"]),
            api_discovered=data["apiDiscovered"],
            requires_auth=data["requiresAuth"],
            bot_detection_likely=data["botDetectionLikely"],
            skills_available=data["skillsAvailable"],
            pattern_count=data["patternCount"],
            pattern_success_rate=data["patternSuccessRate"],
        )


@dataclass
class ConfidenceLevel:
    """Confidence level for an operation."""
    overall: ConfidenceRating
    factors: ConfidenceFactors

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ConfidenceLevel":
        """Create from API response data."""
        return cls(
            overall=ConfidenceRating(data["overall"]),
            factors=ConfidenceFactors.from_dict(data["factors"]),
        )


@dataclass
class BrowsePreview:
    """Preview of what will happen when browsing."""
    schema_version: str
    plan: ExecutionPlan
    estimated_time: TimeEstimate
    confidence: ConfidenceLevel
    alternative_plans: Optional[list[ExecutionPlan]] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BrowsePreview":
        """Create from API response data."""
        alt_plans = None
        if data.get("alternativePlans"):
            alt_plans = [ExecutionPlan.from_dict(p) for p in data["alternativePlans"]]
        return cls(
            schema_version=data["schemaVersion"],
            plan=ExecutionPlan.from_dict(data["plan"]),
            estimated_time=TimeEstimate.from_dict(data["estimatedTime"]),
            confidence=ConfidenceLevel.from_dict(data["confidence"]),
            alternative_plans=alt_plans,
        )


# Workflow Types


@dataclass
class WorkflowInfo:
    """Summary information about a workflow."""
    id: str
    name: str
    description: str
    domain: str
    tags: list[str]
    steps: int
    version: int
    usage_count: int
    success_rate: float
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkflowInfo":
        """Create from API response data."""
        return cls(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            domain=data["domain"],
            tags=data.get("tags", []),
            steps=data["steps"],
            version=data["version"],
            usage_count=data.get("usageCount", 0),
            success_rate=data.get("successRate", 0.0),
            created_at=data["createdAt"],
            updated_at=data["updatedAt"],
        )


@dataclass
class WorkflowStep:
    """A step in a workflow."""
    step_number: int
    action: str
    description: str
    importance: Importance
    success: bool
    url: Optional[str] = None
    user_annotation: Optional[str] = None
    tier: Optional[CostTier] = None
    duration: Optional[int] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkflowStep":
        """Create from API response data."""
        return cls(
            step_number=data["stepNumber"],
            action=data["action"],
            description=data["description"],
            importance=Importance(data["importance"]),
            success=data["success"],
            url=data.get("url"),
            user_annotation=data.get("userAnnotation"),
            tier=CostTier(data["tier"]) if data.get("tier") else None,
            duration=data.get("duration"),
        )


@dataclass
class WorkflowDetails:
    """Full details of a workflow."""
    id: str
    name: str
    description: str
    domain: str
    tags: list[str]
    version: int
    usage_count: int
    success_rate: float
    steps: list[WorkflowStep]
    skill_id: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkflowDetails":
        """Create from API response data."""
        steps = [WorkflowStep.from_dict(s) for s in data["steps"]]
        return cls(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            domain=data["domain"],
            tags=data.get("tags", []),
            version=data["version"],
            usage_count=data.get("usageCount", 0),
            success_rate=data.get("successRate", 0.0),
            steps=steps,
            skill_id=data.get("skillId"),
            created_at=data["createdAt"],
            updated_at=data["updatedAt"],
        )


@dataclass
class ReplayStepResult:
    """Result of a single step in a workflow replay."""
    step_number: int
    success: bool
    duration: int
    tier: Optional[CostTier] = None
    error: Optional[str] = None


@dataclass
class ReplayResult:
    """Result of replaying a workflow."""
    workflow_id: str
    overall_success: bool
    total_duration: int
    results: list[ReplayStepResult]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReplayResult":
        """Create from API response data."""
        results = []
        for r in data["results"]:
            results.append(
                ReplayStepResult(
                    step_number=r["stepNumber"],
                    success=r["success"],
                    duration=r["duration"],
                    tier=CostTier(r["tier"]) if r.get("tier") else None,
                    error=r.get("error"),
                )
            )
        return cls(
            workflow_id=data["workflowId"],
            overall_success=data["overallSuccess"],
            total_duration=data["totalDuration"],
            results=results,
        )
