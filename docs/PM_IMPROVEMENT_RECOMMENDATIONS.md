# Product Manager Improvement Recommendations

**Date:** 2025-12-23
**Reviewer:** PM Sweep Analysis

## Executive Summary

The @llm-browser/core SDK is feature-rich but has usability gaps that create friction for developers. The core issues fall into three themes:

1. **Initialization is non-obvious** - Async setup requirements are buried
2. **Documentation is minimal** - TypeScript examples and options missing
3. **API discoverability is poor** - Advanced features are hidden

---

## Critical Priority (Immediate Action)

### 1. SDK Documentation is Bare Minimum

**Problem:** The [packages/core/README.md](../packages/core/README.md) has only 80 lines and lacks:
- TypeScript import examples with types
- Configuration options table
- SmartBrowseOptions documentation (30+ undocumented options)
- Error handling patterns
- Common use cases

**Impact:** High - Developers won't know what's available

**Backlog Status:** SDK-007 (examples) and SDK-008 (documentation) are "Not Started"

**Recommendation:**
1. Add "Configuration Reference" section with LLMBrowserConfig table
2. Add "Browse Options Reference" with SmartBrowseOptions grouped by concern
3. Add TypeScript examples showing proper type imports
4. Add error handling example with StructuredError

---

### 2. Silent Initialization Failures

**Problem:** The SDK requires `createLLMBrowser()` which calls `initialize()` internally, but:
- No warning if semantic infrastructure fails to initialize
- No indication of degraded mode
- Users don't know optional dependencies (@xenova/transformers) affect functionality

**Impact:** High - Users experience degraded performance without knowing why

**Recommendation:**
1. Add `getInitializationStatus()` method returning what features are active
2. Log INFO-level message on init: "Initialized with: semantic matching ON/OFF, playwright ON/OFF"
3. Add `verbose: true` option to see detailed initialization steps

---

### 3. No Cache Management API

**Problem:** Users cannot:
- Clear cache for a domain
- Check cache status
- Force cache refresh

**Impact:** Medium - Common support issue for time-sensitive data

**Recommendation:** Add to LLMBrowserClient:
```typescript
clearCache(domain?: string): void
getCacheStats(): { totalSize: number; domainStats: Record<string, number> }
```

---

## High Priority (Do This Sprint)

### 4. Method Naming Inconsistencies (From QA Report)

| Class | Expected | Actual | Confusion Level |
|-------|----------|--------|-----------------|
| PerformanceTracker | `recordTiming()` | `record()` | Medium |
| SessionManager | `listProfiles()` | `listSessions()` | Low |
| withRetry | `maxRetries` | `maxAttempts` | High |

**Recommendation:** Add JSDoc clarification and consider method aliases in future major version.

---

### 5. Learning Systems Terminology Confusing

**Problem:** Two related but separate systems:
- `enableLearning` - API pattern learning
- `enableProceduralMemory` - Skill/trajectory learning

Users don't understand the distinction.

**Recommendation:**
1. Rename in next major version: `enablePatternLearning`, `enableSkillLearning`
2. Add "Learning Systems" section to README explaining both
3. Add quick explanation in JSDoc

---

### 6. SmartBrowseOptions is Overwhelming

**Problem:** 30+ options with no guidance on which matter for which use case.

**Recommendation:** Create grouped documentation:
- **Essential** (5 options): forceTier, contentType, waitForSelector, maxChars, timeout
- **Learning** (5 options): enableLearning, includeDecisionTrace, recordTrajectory
- **Validation** (5 options): validators, minContentLength, requireFields
- **Advanced** (remaining): pagination, freshnessRequirement, etc.

---

## Medium Priority (Plan For)

### 7. No Session Health Visibility

**Problem:** SessionManager has `getSessionHealth()` but it's not exposed on LLMBrowserClient.

**Recommendation:** Add convenience method:
```typescript
async checkSessionHealth(domain: string): Promise<SessionHealth>
```

---

### 8. No Progress Indication for Long Operations

**Problem:** `browse()` can take 30+ seconds with no feedback.

**Recommendation:** Add optional progress callback:
```typescript
await browser.browse(url, {
  onProgress: (status) => console.log(`${status.phase}: ${status.message}`)
});
```

---

### 9. Error Messages Need Improvement

**Problem:** From QA - LightweightRenderer throws "Invalid URL" when given HTML instead of URL.

**Recommendation:** Improve error messages to suggest the correct approach:
- "LightweightRenderer requires a URL. Use ContentExtractor.extract() for raw HTML."

---

### 10. Tier Terminology Confusion

**Problem:** Three naming schemes:
- RenderTier type: `'intelligence' | 'lightweight' | 'playwright'`
- TIER_ALIASES: includes `'static'`
- Docs mention: "Tier 1", "Tier 2", "Tier 3"

**Recommendation:** Standardize on one scheme and document all aliases.

---

## Low Priority (Nice to Have)

### 11. No Batch Browse Helper

**Recommendation:** Add convenience method for common pattern:
```typescript
const results = await browser.browseMultiple(urls, { concurrent: 2 });
```

### 12. No Pagination Helper

**Recommendation:** Add `browsePages()` that auto-follows pagination:
```typescript
const allResults = await browser.browsePages(url, { maxPages: 10 });
```

### 13. Decision Trace Hard to Use

**Recommendation:** Add `browseWithDebug()` convenience method that enables all debugging options.

---

## Existing Backlog Gaps

These items are NOT in [BACKLOG.md](BACKLOG.md) but should be:

| Priority | Item | Effort | Category |
|----------|------|--------|----------|
| P1 | SDK documentation expansion (SDK-007, SDK-008) | L | Documentation |
| P1 | Add cache management API | S | Features |
| P2 | Add getInitializationStatus() | S | Features |
| P2 | Expose getSessionHealth() on client | S | Features |
| P2 | Add onProgress callback | M | Features |
| P2 | Improve error messages with suggestions | M | DX |
| P3 | Add browseMultiple() helper | S | Features |
| P3 | Add browsePages() helper | M | Features |

---

## Quick Wins (< 1 Day Each)

All quick wins have been implemented:

1. ~~Add LLMBrowserConfig options table to README~~ DONE
2. ~~Add example showing TypeScript type imports~~ DONE
3. ~~Add JSDoc clarification for `maxAttempts` vs `maxRetries`~~ DONE
4. ~~Expose `getSessionHealth()` from LLMBrowserClient~~ DONE
5. ~~Add initialization status logging~~ DONE
6. Add `getInitializationStatus()` method DONE (added as part of #5)

---

## Success Metrics

Track these to measure improvement:
1. **Time to first successful browse** - Should decrease
2. **Support questions about initialization** - Should decrease
3. **Cache-related bug reports** - Should decrease
4. **"Degraded mode" user confusion** - Should decrease

---

## Appendix: Files to Update

| File | Updates Needed |
|------|----------------|
| packages/core/README.md | Config table, options reference, TypeScript examples |
| packages/core/src/sdk.ts | Add getInitializationStatus(), clearCache(), getCacheStats() |
| packages/core/src/sdk.ts | Expose getSessionHealth() |
| src/utils/retry.ts | Improve JSDoc for maxAttempts |
| docs/BACKLOG.md | Add DX items identified above |
