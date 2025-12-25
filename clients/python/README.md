# Unbrowser Python Client

Official Python client for the [Unbrowser](https://unbrowser.ai) cloud API.

Unbrowser is an intelligent web browsing API that learns from browsing patterns and progressively optimizes to deliver faster, more reliable content extraction.

## Installation

```bash
pip install unbrowser
```

## Quick Start

```python
from unbrowser import UnbrowserClient

# Create client
client = UnbrowserClient(api_key="ub_live_xxxxx")

# Browse a URL
result = client.browse("https://example.com")
print(result.title)
print(result.content.markdown)
print(f"Loaded in {result.metadata.load_time}ms using {result.metadata.tier} tier")
```

## Features

- **Tiered Rendering**: Automatically uses the fastest tier (intelligence -> lightweight -> playwright)
- **Content Extraction**: Returns content as markdown, text, or HTML
- **Batch Processing**: Browse multiple URLs in parallel
- **Workflow Recording**: Record and replay browse operations
- **Domain Intelligence**: Learn patterns for better extraction
- **Session Management**: Handle authenticated browsing with cookies

## Usage Examples

### Basic Browse

```python
from unbrowser import UnbrowserClient, BrowseOptions, ContentType

client = UnbrowserClient(api_key="ub_live_xxxxx")

# Simple browse
result = client.browse("https://example.com")

# With options
result = client.browse(
    "https://example.com/products",
    options=BrowseOptions(
        content_type=ContentType.MARKDOWN,
        max_chars=10000,
        include_tables=True,
    ),
)
```

### Preview Before Browse

Check what will happen before executing:

```python
preview = client.preview_browse("https://reddit.com/r/programming")

print(f"Expected time: {preview.estimated_time.expected}ms")
print(f"Confidence: {preview.confidence.overall}")
print(f"Steps: {len(preview.plan.steps)}")
print(f"Tier: {preview.plan.tier}")

# See execution plan
for step in preview.plan.steps:
    print(f"  {step.order}. {step.action}: {step.description}")
```

### Batch Processing

Browse multiple URLs in parallel:

```python
result = client.batch([
    "https://example.com/page1",
    "https://example.com/page2",
    "https://example.com/page3",
])

for item in result.results:
    if item.success:
        print(f"{item.url}: {item.data.title}")
    else:
        print(f"{item.url}: FAILED - {item.error['message']}")

print(f"Total time: {result.total_time}ms")
```

### Fast Fetch

Optimized for speed using tiered rendering:

```python
# Fast fetch prioritizes speed over completeness
result = client.fetch(
    "https://example.com",
    options=BrowseOptions(
        max_latency_ms=1000,  # Skip tiers slower than 1s
        max_cost_tier=CostTier.LIGHTWEIGHT,  # Don't use Playwright
    ),
)
```

### Authenticated Browsing

Use session data for authenticated requests:

```python
from unbrowser import SessionData, Cookie

session = SessionData(
    cookies=[
        Cookie(name="session_id", value="abc123", domain="example.com"),
    ],
    local_storage={"user_id": "12345"},
)

result = client.browse("https://example.com/dashboard", session=session)
```

### Workflow Recording

Record browse operations for later replay:

```python
# Start recording
recording = client.start_recording(
    name="Extract product pricing",
    description="Navigate to product page and extract price",
    domain="example.com",
)

# Browse (operations are recorded)
client.browse("https://example.com/products/123")

# Stop and save
workflow = client.stop_recording(recording["recordingId"])

# Replay with different parameters
result = client.replay_workflow(
    workflow["workflowId"],
    variables={"product_id": "456"},
)

print(f"Success: {result.overall_success}")
print(f"Duration: {result.total_duration}ms")
```

### Domain Intelligence

Get learned patterns for a domain:

```python
intel = client.get_domain_intelligence("example.com")

print(f"Known patterns: {intel.known_patterns}")
print(f"Success rate: {intel.success_rate:.0%}")
print(f"Recommended strategy: {intel.recommended_wait_strategy}")
```

### Usage Statistics

Check your usage:

```python
usage = client.get_usage()

print(f"Period: {usage['period']['start']} to {usage['period']['end']}")
print(f"Total requests: {usage['requests']['total']}")
print(f"Remaining: {usage['limits']['remaining']}/{usage['limits']['daily']}")
```

## Error Handling

```python
from unbrowser import (
    UnbrowserClient,
    UnbrowserError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
)

client = UnbrowserClient(api_key="ub_live_xxxxx")

try:
    result = client.browse("https://example.com")
except AuthenticationError:
    print("Invalid API key")
except RateLimitError as e:
    print(f"Rate limited. Retry after: {e.retry_after}s")
except ValidationError as e:
    print(f"Invalid request: {e.message}")
except UnbrowserError as e:
    print(f"Error [{e.code}]: {e.message}")
```

## Configuration

```python
client = UnbrowserClient(
    api_key="ub_live_xxxxx",
    base_url="https://api.unbrowser.ai",  # Optional
    timeout=60,  # Request timeout in seconds
    retry=True,  # Retry failed requests
    max_retries=3,  # Maximum retry attempts
)
```

## Context Manager

The client can be used as a context manager:

```python
with UnbrowserClient(api_key="ub_live_xxxxx") as client:
    result = client.browse("https://example.com")
    print(result.content.markdown)
# Connection is closed automatically
```

## Rate Limits

Rate limits vary by plan:

| Plan       | Daily Limit    | Batch Size |
| ---------- | -------------- | ---------- |
| Free       | 100 requests   | 10 URLs    |
| Starter    | 1,000 requests | 10 URLs    |
| Team       | 10,000 requests| 50 URLs    |
| Enterprise | Custom         | Custom     |

Rate limit information is included in error responses:

```python
try:
    result = client.browse("https://example.com")
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after} seconds")
```

## Tiered Rendering

Unbrowser uses a tiered approach to minimize latency and cost:

| Tier         | Latency     | Best For                              |
| ------------ | ----------- | ------------------------------------- |
| Intelligence | ~50-200ms   | Static pages, cached patterns, APIs   |
| Lightweight  | ~200-500ms  | Simple JavaScript, SSR frameworks     |
| Playwright   | ~2-5s       | Complex SPAs, heavy JS, authentication|

Control tier usage:

```python
from unbrowser import BrowseOptions, CostTier

# Limit to fast tiers only
result = client.browse(
    "https://example.com",
    options=BrowseOptions(
        max_cost_tier=CostTier.LIGHTWEIGHT,
        max_latency_ms=1000,
    ),
)
```

## Type Hints

This library is fully typed and includes a `py.typed` marker for PEP 561 compliance:

```python
from unbrowser import BrowseResult, BrowseOptions

def process_page(result: BrowseResult) -> str:
    return result.content.markdown
```

## Requirements

- Python 3.10+
- requests >= 2.28.0

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Documentation](https://unbrowser.ai/docs)
- [API Reference](https://api.unbrowser.ai/docs)
- [GitHub](https://github.com/anthropics/unbrowser)
- [Support](mailto:support@unbrowser.ai)
