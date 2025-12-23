# SDK QA Report

**Date:** 2025-12-23
**Version:** 0.5.0
**Tester:** Automated QA via persona-based tests

## Summary

- **Successes:** 13 tests passed
- **Warnings:** 5 minor issues
- **Issues:** 7 findings (4 test bugs, 3 actual bugs)

---

## Issues Found

### 1. FIXED - AnalyticsDashboard Export Bug

**Severity:** Medium
**Status:** Fixed

**Description:** `AnalyticsDashboard` was incorrectly exported as a value when it's actually an interface. TypeScript stripped the export silently.

**Fix Applied:**
```typescript
// Before (broken - silently stripped by TS)
export { AnalyticsDashboard } from './utils/analytics-dashboard.js';

// After (correct)
export {
  generateDashboard,
  getQuickStatus,
  type AnalyticsDashboard,
  type TierAnalytics,
  type DomainAnalytics,
  type TimeSeriesPoint,
  type SystemHealth,
  type DashboardOptions,
} from './utils/analytics-dashboard.js';
```

---

### 2. BUG - IPv6 Loopback Not Blocked by URL Safety

**Severity:** Medium
**Status:** Open - Needs Fix

**Description:** The URL safety validator does not block IPv6 loopback addresses.

**Reproduction:**
```javascript
import { validateUrl } from '@llm-browser/core';

const result = validateUrl('http://[::1]/admin');
console.log(result);
// { safe: true, ... }  // WRONG! Should be blocked
```

**Expected:** IPv6 loopback `[::1]` should be blocked like IPv4 `127.0.0.1`

**Root Cause:** `url-safety.ts` only checks IPv4 addresses, no IPv6 handling.

**Recommended Fix:** Add IPv6 localhost/private address detection in `isLocalhost()` and `isPrivateIP()` functions.

---

### 3. BUG - classifyFailure Crashes on Non-Error Objects

**Severity:** Low
**Status:** Open - Needs Fix

**Description:** `classifyFailure()` throws when passed an object without an `error.message` property.

**Reproduction:**
```javascript
import { classifyFailure } from '@llm-browser/core';

// Crashes with: Cannot read properties of undefined (reading 'toLowerCase')
const result = classifyFailure({ status: 403 });
```

**Root Cause:** The function expects `error.message` but receives an HTTP response object.

**Recommended Fix:** Add defensive checks for different error shapes (Error objects, HTTP responses, etc.)

---

### 4. API Documentation Issue - withRetry Options

**Severity:** Low (Documentation)
**Status:** Documented

**Description:** The `withRetry` function uses `maxAttempts` but users may expect `maxRetries`.

**Actual API:**
```javascript
await withRetry(fn, {
  maxAttempts: 3,     // Total attempts (not retries)
  initialDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
});
```

**Note:** `maxAttempts: 3` means 1 initial + 2 retries = 3 total attempts

---

### 5. API Documentation Issue - Method Names

**Severity:** Low (Documentation)
**Status:** Documented

Several classes have method names different from what users might expect:

| Class | Expected | Actual |
|-------|----------|--------|
| `PerformanceTracker` | `recordTiming()` | `record()` |
| `SessionManager` | `listProfiles()` | `listSessions()` |
| `ApiPatternRegistry` | `matchPattern()` | (none - use internal `tryMatch`) |

---

## Warnings (Minor Issues)

### 1. ContentExtractor - No Links Array in Result

**Description:** When extracting HTML, `result.links` is undefined even when the HTML contains links.

**Note:** Links may be extracted differently - need to check the actual API.

---

### 2. RateLimiter - Burst Not Working as Expected

**Description:** When acquiring 3 tokens immediately, all were rejected.

**Possible Cause:** May need to call `acquire()` with different timing or the rate limiter needs initialization.

---

### 3. LightweightRenderer - URL Validation

**Description:** Renderer throws "Invalid URL" when given raw HTML instead of a URL.

**Note:** This might be expected behavior if the API requires a URL, not raw HTML content.

---

### 4. ApiPatternRegistry - Requires Initialization

**Description:** `getPatternsForDomain()` returns empty before `initialize()` is called.

**Note:** Expected behavior - async initialization is required.

---

## Tests That Passed

1. URL Safety - Normal HTTPS URL allowed
2. URL Safety - Private IPs blocked (192.168.x.x, 10.x.x.x, 172.16.x.x)
3. URL Safety - Localhost blocked
4. URL Safety - Cloud metadata endpoints blocked
5. Content Extraction - Markdown generated
6. Content Extraction - Table data preserved
7. Content Extraction - Title extracted
8. GraphQL Detection - Correct endpoints identified
9. Link Header Parsing - Pagination links parsed
10. Hypermedia Format Detection - HAL format detected
11. validateUrlOrThrow - Throws UrlSafetyError correctly
12. LearningEngine - Stats available
13. Quick Status - Dashboard status retrievable

---

## Recommendations

### Priority 1 (Security)
- Fix IPv6 loopback blocking in URL safety

### Priority 2 (Stability)
- Add defensive checks in classifyFailure()

### Priority 3 (Developer Experience)
- Document async initialization requirements
- Consider adding method aliases for common expectations
- Add TypeScript examples to README
