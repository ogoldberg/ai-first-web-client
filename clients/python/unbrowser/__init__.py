"""
Unbrowser Python Client

Official Python client for the Unbrowser cloud API.

Example:
    >>> from unbrowser import UnbrowserClient
    >>>
    >>> client = UnbrowserClient(api_key="ub_live_xxxxx")
    >>> result = client.browse("https://example.com")
    >>> print(result.content.markdown)
"""

from .client import (
    UnbrowserClient,
    UnbrowserError,
    RateLimitError,
    AuthenticationError,
    ValidationError,
)
from .types import (
    BrowseOptions,
    BrowseResult,
    BatchResult,
    SessionData,
    Cookie,
    DomainIntelligence,
    BrowsePreview,
    ExecutionPlan,
    ExecutionStep,
    TimeEstimate,
    ConfidenceLevel,
    WorkflowInfo,
    WorkflowDetails,
    ReplayResult,
)

__version__ = "0.1.0"
__all__ = [
    # Client
    "UnbrowserClient",
    # Errors
    "UnbrowserError",
    "RateLimitError",
    "AuthenticationError",
    "ValidationError",
    # Types
    "BrowseOptions",
    "BrowseResult",
    "BatchResult",
    "SessionData",
    "Cookie",
    "DomainIntelligence",
    "BrowsePreview",
    "ExecutionPlan",
    "ExecutionStep",
    "TimeEstimate",
    "ConfidenceLevel",
    "WorkflowInfo",
    "WorkflowDetails",
    "ReplayResult",
]
