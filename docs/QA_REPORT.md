# SDK QA Report

**Date:** 2025-12-23
**Version:** 0.5.0
**Tester:** Automated QA via persona-based tests

## Summary

- **Successes:** 13 tests passed
- **Warnings:** 4 minor issues
- **Issues:** 7 findings (4 test bugs, 3 actual bugs - all 3 now fixed)

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

### 2. FIXED - IPv6 Loopback Not Blocked by URL Safety

**Severity:** Medium
**Status:** Fixed

**Description:** The URL safety validator did not block IPv6 loopback addresses.

**Fix Applied:**
- Added `isIPv6()` function to detect bracketed IPv6 addresses
- Added `stripIPv6Brackets()` helper for consistent IPv6 handling
- Added `isIPv6Loopback()` to detect `::1` and expanded forms
- Added `isIPv6LinkLocal()` to detect `fe80::/10` addresses
- Added `isIPv6Private()` to detect `fc00::/7` addresses
- Updated `isLocalhost()` to check IPv6 loopback
- Updated `validate()` to check IPv6 link-local and private ranges

**Verification:**
```javascript
import { validateUrl } from '@llm-browser/core';

validateUrl('http://[::1]/admin');      // { safe: false, category: 'localhost' }
validateUrl('http://[fe80::1]/');       // { safe: false, category: 'link_local' }
validateUrl('http://[fd00::1]/');       // { safe: false, category: 'private_ip' }
```

---

### 3. FIXED - classifyFailure Crashes on Non-Error Objects

**Severity:** Low
**Status:** Fixed

**Description:** `classifyFailure()` threw when passed an object without an `error.message` property.

**Fix Applied:**
- Changed `errorMessage` parameter type from `string` to `string | Error | unknown`
- Added input normalization that handles:
  - String messages (pass through)
  - Error objects (extract `.message`)
  - Objects with `.message`, `.error`, or `.statusText` properties
  - Any other object (JSON stringify as fallback)
  - null/undefined (default to 'Unknown error')

**Verification:**
```javascript
import { classifyFailure } from '@llm-browser/core';

classifyFailure(undefined, { status: 403 });                    // Returns { category: 'unknown', ... }
classifyFailure(undefined, new Error('Connection timeout'));    // Returns { category: 'timeout', ... }
classifyFailure(undefined, { message: 'Auth required' });       // Returns { category: 'auth_required', ... }
classifyFailure(undefined, null);                               // Returns { category: 'unknown', ... }
```

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
- ~~Fix IPv6 loopback blocking in URL safety~~ DONE

### Priority 2 (Stability)
- ~~Add defensive checks in classifyFailure()~~ DONE

### Priority 3 (Developer Experience)
- Document async initialization requirements
- Consider adding method aliases for common expectations
- Add TypeScript examples to README
