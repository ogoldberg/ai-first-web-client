# Security Documentation

This document outlines the security measures implemented in the Unbrowser API.

## Authentication

### API Keys

- **Format**: `ub_live_xxxxx` (production) or `ub_test_xxxxx` (testing)
- **Storage**: API keys are hashed with SHA-256 before storage - plaintext keys are never stored
- **Validation**: Keys are validated for format before database lookup
- **Expiration**: Optional expiration dates can be set on keys
- **Revocation**: Keys can be revoked immediately; revoked keys are rejected

### Bearer Token Authentication

All authenticated endpoints require the `Authorization: Bearer <api_key>` header.

```bash
curl -H "Authorization: Bearer ub_live_xxxxx" https://api.unbrowser.ai/v1/browse
```

## Authorization

### Permission System

- API keys have associated permissions (e.g., `browse`, `batch`, `admin`)
- Admin routes require both authentication AND `admin` permission
- Permission checks are enforced via middleware

### Tenant Isolation

- All data is scoped to tenants (organizations)
- Cross-tenant access is prevented at the middleware level
- Usage, sessions, and workflows are tenant-isolated

## Rate Limiting

### Per-Tenant Limits

| Plan | Daily Units | Burst Limit |
|------|-------------|-------------|
| FREE | 100 | 10 |
| STARTER | 1,000 | 60 |
| TEAM | 10,000 | 300 |
| ENTERPRISE | 100,000 | 1,000 |

### Unit Costs by Tier

| Tier | Units |
|------|-------|
| Intelligence | 1 |
| Lightweight | 5 |
| Playwright | 25 |

### Rate Limit Headers

Responses include rate limit information:
- `X-RateLimit-Limit`: Daily limit in units
- `X-RateLimit-Remaining`: Remaining units
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds to wait (on 429 responses)

## HTTP Security Headers

The API sets comprehensive security headers via Hono's `secureHeaders` middleware:

### Content Security Policy (CSP)

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self';
font-src 'self';
object-src 'none';
media-src 'none';
frame-src 'none';
form-action 'self';
frame-ancestors 'none';
base-uri 'self';
upgrade-insecure-requests;
```

### Other Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS filter for older browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer information |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS |
| `Permissions-Policy` | Restrictive | Disable unused browser features |

## CORS Configuration

### Allowed Origins

**Production:**
- `https://unbrowser.ai`
- `https://www.unbrowser.ai`
- `https://api.unbrowser.ai`

**Development:**
- `https://unbrowser.ai`
- `http://localhost:3000`
- `http://localhost:3001`

### Allowed Methods

`GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

### Allowed Headers

`Content-Type`, `Authorization`, `X-Request-Id`

### Exposed Headers

`X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

## Input Validation

### URL Validation

All URLs are validated to ensure:
- Valid URL format (parseable by `new URL()`)
- Protocol is `http:` or `https:` only (no `file:`, `javascript:`, etc.)
- Invalid URLs return `INVALID_URL` error

### Request Body Validation

- JSON bodies are validated via Hono's `validator` middleware
- Required fields are checked with appropriate error messages
- Type validation ensures correct data types

### Query Parameter Validation

- Date parameters validated against `YYYY-MM-DD` format
- Numeric parameters parsed and validated
- Invalid values return descriptive errors

## Webhook Security

### Stripe Webhooks

- All Stripe webhooks are verified using `stripe.webhooks.constructEvent()`
- Webhook signature is validated against `STRIPE_WEBHOOK_SECRET`
- Invalid signatures are rejected with 400 status

## Sensitive Data Handling

### Request Logging

The request logger automatically redacts sensitive data:

**Redacted Headers:**
- `authorization`
- `cookie`
- `x-api-key`
- `api-key`
- `x-auth-token`

**Redacted Query Parameters:**
- `api_key`
- `apikey`
- `token`
- `secret`
- `password`
- `key`

### Error Responses

- Stack traces are only included in development mode
- Production errors return generic messages without internal details
- Error codes are consistent and documented

## Dependency Security

### Audit Results

Run `npm audit` regularly to check for vulnerabilities.

**Known Development-Only Vulnerabilities:**
- `@modelcontextprotocol/sdk <1.24.0` - DNS rebinding (dev tool only)
- `esbuild <=0.24.2` - Dev server vulnerability (not used in production)
- `vitest/vite-node` - Test framework vulnerabilities (not in production)

These are development dependencies and do not affect the production API.

### Recommendations

1. Run `npm audit` before each release
2. Update dependencies regularly
3. Use `npm audit fix` for automatic patches
4. Review critical/high severity issues manually

## Best Practices

### For API Users

1. **Store API keys securely** - Never commit keys to version control
2. **Use environment variables** - Store keys in `.env` files or secret managers
3. **Rotate keys regularly** - Create new keys and deprecate old ones
4. **Use test keys for development** - `ub_test_` keys for non-production use
5. **Monitor usage** - Check `/v1/usage` endpoint for anomalies

### For Developers

1. **Never log raw API keys** - Use redacted versions only
2. **Validate all input** - Never trust user input
3. **Use parameterized queries** - Prevent injection attacks
4. **Check permissions** - Verify authorization before actions
5. **Fail securely** - Return minimal error information

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** create public GitHub issues for security vulnerabilities
2. Email security concerns to the maintainers
3. Include detailed reproduction steps
4. Allow reasonable time for fixes before public disclosure

## Compliance

### Data Handling

- API keys are hashed, not encrypted (one-way)
- Request logs contain redacted data only
- Tenant data is isolated and access-controlled
- No personally identifiable information (PII) is logged

### Audit Trail

- All requests are logged with timestamps
- Request IDs enable tracing
- Admin actions are logged
- Usage is tracked per-tenant
