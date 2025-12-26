# Rate Limiting Support

**Status:** ✅ Implemented (GAP-010)
**Date:** 2025-12-26
**Related:** [FORM_AUTOMATION_IMPLEMENTATION.md](FORM_AUTOMATION_IMPLEMENTATION.md)

## Overview

The FormSubmissionLearner now includes comprehensive **rate limiting detection and handling**. The system automatically detects rate limits, tracks quota usage, and implements intelligent retry strategies to ensure reliable form submissions even under rate constraints.

### Why This Matters

Rate limiting is ubiquitous in modern APIs:
- **Public APIs**: GitHub (5000 req/hr), Twitter (300 req/15min), Stripe (100 req/sec)
- **Internal APIs**: Microservices, admin panels, SaaS platforms
- **Form submissions**: Login attempts, data imports, bulk operations

**Impact:** Prevents failed submissions due to rate limits and enables automatic retry with proper backoff.

## Features

### 1. Rate Limit Detection

**Detects via:**
- **429 Status Code**: Standard "Too Many Requests" response
- **Retry-After Header**: Seconds (integer) or HTTP date
- **X-RateLimit-*** Headers**: Limit, Remaining, Reset

**Header support:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735240500
```

### 2. Intelligent Tracking

**Per-domain tracking:**
- Rate limit quota (requests per period)
- Remaining requests in current period
- Reset timestamp (when quota renews)
- Rate limit hit count (for analytics)

**Proactive warnings:**
- Warns when remaining quota < 20%
- Logs rate limit events for debugging
- Tracks reset times for wait calculations

### 3. Automatic Retry

**Exponential backoff:**
- Attempt 1: Wait 1 second (2^0)
- Attempt 2: Wait 2 seconds (2^1)
- Attempt 3: Wait 4 seconds (2^2)
- Max wait: 60 seconds (capped for safety)

**Respects Retry-After:**
- Waits for specified duration before retry
- Parses both seconds and HTTP date formats
- Falls back to reset timestamp if available

### 4. Pre-emptive Checks

**Avoids unnecessary requests:**
- Checks rate limit status before submission
- Waits for reset if quota exhausted
- Prevents cascading rate limit hits

## Usage

### Basic Example

```typescript
import { FormSubmissionLearner } from 'llm-browser/core';

const learner = new FormSubmissionLearner(apiPatternRegistry);

// Rate limiting is automatic - no configuration needed
const result = await learner.submitForm({
  url: 'https://api.example.com/submit',
  fields: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});

// If rate limited, the system will:
// 1. Detect the 429 response
// 2. Parse Retry-After header
// 3. Wait the specified duration
// 4. Automatically retry
// 5. Return successful result (or throw after max retries)
```

### Rate Limit Response Handling

**Example 429 response:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735240500

{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit. Please try again later."
}
```

**Automatic handling:**
```
[FormSubmissionLearner] Rate limit detected
  domain: api.example.com
  retryAfterSeconds: 60
  resetAt: 2025-12-26T18:35:00.000Z
  rateLimitCount: 1

[FormSubmissionLearner] Waiting for rate limit to reset
  domain: api.example.com
  waitSeconds: 60
  attempt: 1

[FormSubmissionLearner] Retrying submission...
  domain: api.example.com
  attempt: 2

✓ Form submitted successfully (after retry)
```

## Implementation Details

### RateLimitInfo Interface

```typescript
export interface RateLimitInfo {
  domain: string;                    // Domain being rate limited
  limit?: number;                    // Quota (e.g., 100 req/hour)
  remaining?: number;                // Requests left in period
  resetAt?: number;                  // Unix timestamp (ms) when resets
  retryAfterSeconds?: number;        // From Retry-After header
  lastRateLimitTime?: number;        // When we last hit limit
  rateLimitCount: number;            // Total times rate limited
}
```

### Detection Algorithm

```
1. Check response status
   └─> If 429: Parse rate limit headers
   └─> If not 429: Still parse X-RateLimit-* headers (for tracking)

2. Parse Retry-After header
   └─> If integer: Treat as seconds
   └─> If string: Parse as HTTP date

3. Parse X-RateLimit-Reset
   └─> Convert Unix timestamp to milliseconds

4. Calculate resetAt
   └─> Use Retry-After OR X-RateLimit-Reset
   └─> Fallback to 60s if neither available

5. Store RateLimitInfo by domain
   └─> Update existing info if domain already tracked
```

### Retry Strategy

```typescript
// Exponential backoff with cap
async retryWithBackoff<T>(fn: () => Promise<T>, domain: string, maxRetries: number = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check if we need to wait
      const waitMs = this.checkRateLimitWait(domain);
      if (waitMs > 0) {
        await sleep(Math.min(waitMs, 60000)); // Cap at 60s
      }

      return await fn(); // Attempt request
    } catch (error) {
      if (error.response?.status === 429) {
        // Update rate limit info
        this.updateRateLimitInfo(error.response, domain);

        // Exponential backoff: 2^attempt seconds
        const backoffSeconds = Math.min(Math.pow(2, attempt), 60);
        await sleep(backoffSeconds * 1000);

        continue; // Retry
      }

      throw error; // Not a rate limit error
    }
  }

  throw new Error('Max retries exceeded');
}
```

## Header Formats

### Standard Rate Limit Headers

```http
X-RateLimit-Limit: 100          # Total quota
X-RateLimit-Remaining: 47       # Requests left
X-RateLimit-Reset: 1735240500   # Unix timestamp

# Alternative naming (also supported):
RateLimit-Limit: 100
RateLimit-Remaining: 47
RateLimit-Reset: 1735240500
```

### Retry-After Formats

**Seconds (integer):**
```http
Retry-After: 60
```

**HTTP Date:**
```http
Retry-After: Wed, 26 Dec 2025 18:35:00 GMT
```

## Examples

### GitHub API Rate Limit

```http
HTTP/1.1 403 Forbidden
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735240500

{
  "message": "API rate limit exceeded",
  "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
}
```

**Automatic handling:**
- Detects via 403 + X-RateLimit-Remaining: 0
- Waits until X-RateLimit-Reset timestamp
- Retries after quota renews

### Stripe API Rate Limit

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 5

{
  "error": {
    "type": "rate_limit_error",
    "message": "Too many requests hit the API too quickly."
  }
}
```

**Automatic handling:**
- Detects via 429 status
- Waits 5 seconds (from Retry-After)
- Retries with exponential backoff if still rate limited

## Performance Impact

### Without Rate Limiting Support

```
Attempt 1: Submit → 429 Rate Limited → Error thrown → User retry
Attempt 2: Submit → 429 Still limited → Error thrown → User retry
Attempt 3: Submit → 429 Still limited → Give up
Result: ❌ Failed submission, poor UX
```

### With Rate Limiting Support

```
Attempt 1: Submit → 429 Rate Limited → Parse Retry-After: 60s
           Wait 60s → Retry → 200 Success ✓
Result: ✅ Successful submission, seamless UX
```

**Benefits:**
- Automatic recovery from rate limits
- No manual user intervention needed
- Respects API quotas (good citizenship)
- Prevents wasted requests during limit period

## Limitations

### 1. Non-Standard Headers

Some APIs use custom rate limit headers:
```http
X-App-RateLimit-Limit: 100
X-App-RateLimit-Remaining: 50
```

**Mitigation:** System looks for both `x-ratelimit-*` and `ratelimit-*` variants. Custom headers not detected.

### 2. Shared Rate Limits

Some rate limits are shared across multiple endpoints/domains:
- Same API key across multiple apps
- Organization-wide quotas

**Mitigation:** Tracking is per-domain. Shared limits may be hit unexpectedly.

### 3. Dynamic Rate Limits

Some APIs adjust rate limits based on:
- User tier/plan
- Time of day
- API load

**Current behavior:** Uses headers from most recent response. May not reflect current limits if they changed.

## Integration

### With Other Features

**2FA + Rate Limiting:**
```typescript
// Login with rate limiting + 2FA
const result = await learner.submitForm({
  url: 'https://api.example.com/login',
  fields: { username, password }
}, {
  onOTPRequired: async (challenge) => {
    // If rate limited during OTP, system will wait and retry
    return await promptUserForOTP(challenge);
  }
});
```

**Batch Submissions:**
```typescript
// Submit multiple forms, each respects rate limits
for (const formData of batchData) {
  await learner.submitForm(formData);
  // System automatically spaces requests if approaching limit
}
```

## Monitoring

### Rate Limit Warnings

```
[WARN] Approaching rate limit
  domain: api.example.com
  remaining: 15
  limit: 100
  percentRemaining: 15.0

[INFO] Rate limit detected
  domain: api.example.com
  retryAfterSeconds: 60
  rateLimitCount: 3
```

### Tracking State

```typescript
// Get current rate limit info (internal API)
const rateLimitInfo = learner['rateLimits'].get('api.example.com');

console.log(rateLimitInfo);
// {
//   domain: 'api.example.com',
//   limit: 100,
//   remaining: 47,
//   resetAt: 1735240500000,
//   rateLimitCount: 2
// }
```

## Best Practices

1. **Set Reasonable Timeouts**: Don't set form submission timeout < retry wait time
2. **Monitor Logs**: Track `rateLimitCount` to identify problematic domains
3. **Batch Wisely**: Space out batch operations to avoid hitting limits
4. **Respect Quotas**: System warns at 20% remaining - consider backing off

## Related Documentation

- [Form Automation Implementation](FORM_AUTOMATION_IMPLEMENTATION.md)
- [2FA Support](TWO_FACTOR_AUTH_SUPPORT.md) - Rate limiting during OTP flows

## Future Enhancements

1. **Adaptive Throttling**: Proactively slow down when approaching limits
2. **Custom Header Support**: Configurable header names per domain
3. **Quota Prediction**: Learn typical usage patterns and warn before hitting limits
4. **Rate Limit Dashboard**: Visualize rate limit status across domains

---

**Status:** ✅ Production ready
**Coverage:** Universal (all API-based submissions)
**Max Retries:** 3 attempts with exponential backoff
**Max Wait:** 60 seconds per retry attempt
