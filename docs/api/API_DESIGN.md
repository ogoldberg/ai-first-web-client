# Unbrowser REST API Design

This document describes the design of the Unbrowser REST API at `api.unbrowser.ai`.

## Overview

The API provides intelligent web browsing capabilities for AI agents. It wraps the core Unbrowser functionality with authentication, rate limiting, and usage tracking.

## Base URL

```
https://api.unbrowser.ai
```

Staging: `https://api-staging.unbrowser.ai`

## Authentication

All API requests (except `/health`) require authentication via Bearer token:

```http
Authorization: Bearer ub_live_xxxxx
```

### API Key Format

- `ub_live_xxxxx` - Production keys
- `ub_test_xxxxx` - Test/sandbox keys (limited functionality)

API keys are:
- 32+ characters after the prefix
- Stored as SHA-256 hash (never in plaintext)
- Scoped to a single tenant

## Endpoints

### Core Browsing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/browse` | Browse URL with intelligent extraction |
| `POST` | `/v1/fetch` | Fast tiered fetch (speed-optimized) |
| `POST` | `/v1/batch` | Browse multiple URLs in parallel |

### Intelligence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/domains/{domain}/intelligence` | Get learned patterns for domain |

### Usage & Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/usage` | Get usage statistics for billing period |
| `GET` | `/health` | Health check (no auth required) |

## Request/Response Format

### Standard Response Envelope

All responses use a consistent envelope:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body |
| `INVALID_URL` | 400 | URL is not valid |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | API key lacks permission |
| `RATE_LIMITED` | 429 | Daily limit exceeded |
| `BROWSE_ERROR` | 500 | Failed to browse URL |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Rate Limiting

Rate limits are enforced per API key:

| Plan | Daily Limit | Burst Limit |
|------|-------------|-------------|
| Free | 100 | 10/minute |
| Starter | 1,000 | 60/minute |
| Team | 10,000 | 300/minute |
| Enterprise | Custom | Custom |

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 4568
X-RateLimit-Reset: 1704067200
```

## Tiered Rendering

The API uses a tiered approach to minimize latency and cost:

### Tier 1: Intelligence (~50-200ms)
- Content Intelligence extraction
- Framework detection (Next.js, etc.)
- Cached patterns from previous visits
- **Cost**: 1 request unit

### Tier 2: Lightweight (~200-500ms)
- linkedom rendering
- Simple JavaScript execution
- No full browser needed
- **Cost**: 5 request units

### Tier 3: Playwright (~2-5s)
- Full browser rendering
- Complex JavaScript support
- Screenshot capability
- **Cost**: 25 request units

### Controlling Tiers

Use `maxCostTier` to limit tier usage:

```json
{
  "url": "https://example.com",
  "options": {
    "maxCostTier": "lightweight"
  }
}
```

Use `maxLatencyMs` to skip slow tiers:

```json
{
  "url": "https://example.com",
  "options": {
    "maxLatencyMs": 2000
  }
}
```

## SSE Progress Updates

For long-running requests, use Server-Sent Events for progress updates:

```http
POST /v1/browse
Accept: text/event-stream
```

Events:

```
event: progress
data: {"stage": "loading", "tier": "lightweight", "elapsed": 500}

event: progress
data: {"stage": "extracting", "tier": "lightweight", "elapsed": 750}

event: result
data: {"success": true, "data": {...}}
```

## Batch Processing

Batch requests process URLs in parallel:

```json
{
  "urls": [
    "https://example.com/page1",
    "https://example.com/page2"
  ],
  "options": {
    "maxChars": 5000
  }
}
```

Response includes per-URL results:

```json
{
  "success": true,
  "data": {
    "results": [
      {"url": "...", "success": true, "data": {...}},
      {"url": "...", "success": false, "error": {...}}
    ],
    "totalTime": 1500
  }
}
```

**Limits**:
- Free/Starter: 10 URLs per batch
- Team/Enterprise: 50 URLs per batch

## Session Management

Pass session data for authenticated browsing:

```json
{
  "url": "https://example.com/dashboard",
  "session": {
    "cookies": [
      {"name": "session_id", "value": "abc123", "domain": "example.com"}
    ],
    "localStorage": {
      "token": "xyz789"
    }
  }
}
```

New cookies set during browsing are returned in the response.

## Domain Intelligence

Get learned patterns for a domain:

```
GET /v1/domains/example.com/intelligence
```

Response:

```json
{
  "success": true,
  "data": {
    "domain": "example.com",
    "knownPatterns": 12,
    "selectorChains": 5,
    "validators": 3,
    "successRate": 0.95,
    "recommendedWaitStrategy": "networkidle",
    "shouldUseSession": false
  }
}
```

## Usage Tracking

Get current billing period usage:

```
GET /v1/usage
```

Response:

```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    },
    "requests": {
      "total": 5432,
      "byTier": {
        "intelligence": 3500,
        "lightweight": 1500,
        "playwright": 432
      }
    },
    "limits": {
      "daily": 10000,
      "remaining": 4568
    }
  }
}
```

## SDK Usage

The official SDK (`@unbrowser/core`) wraps this API:

```typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: 'ub_live_xxxxx',
});

// Browse
const result = await client.browse('https://example.com');
console.log(result.content.markdown);

// Batch
const batch = await client.batch([
  'https://example.com/page1',
  'https://example.com/page2',
]);

// Domain intelligence
const intel = await client.getDomainIntelligence('example.com');

// Usage
const usage = await client.getUsage();
```

## Future Endpoints

Planned for future versions:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/execute` | Execute discovered API directly |
| `POST` | `/v1/sessions` | Create/manage persistent sessions |
| `GET` | `/v1/patterns` | List all learned patterns |
| `POST` | `/v1/patterns/import` | Import patterns from another tenant |

## OpenAPI Specification

The full OpenAPI 3.1 specification is available at:
- `docs/api/openapi.yaml` (this repo)
- `https://api.unbrowser.ai/openapi.yaml` (live)

Import into Swagger UI, Postman, or other API tools for interactive exploration.
