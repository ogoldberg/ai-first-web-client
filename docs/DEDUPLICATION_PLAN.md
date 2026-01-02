# Code Deduplication Plan

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Preparation | DONE |
| Phase 2 | Remove marketing pages | DONE (PR #224) |
| Phase 3 | Remove SDK | BLOCKED (needs SDK published to npm) |
| Phase 4 | Test cleanup | PARTIAL (marketing tests done) |
| Phase 5 | Verification | PENDING |

## Problem Statement

The Unbrowser codebase is split across 3 repositories, but code was duplicated:

| Repository | Purpose | Duplicated Code |
|------------|---------|-----------------|
| `ai-first-web-client` | API + Core | ~~Has SDK in `packages/core`~~, ~~marketing pages in `packages/api/src/routes/`~~ |
| `unbrowser-marketing` | Marketing Site | Has marketing pages (canonical location) |
| `rabbit-found/unbrowser` | SDK | Has SDK (canonical location) |

## Target State

After deduplication:

| Repository | Contains | Does NOT Contain |
|------------|----------|------------------|
| `ai-first-web-client` | API routes, core intelligence, MCP | Marketing pages, SDK |
| `unbrowser-marketing` | Landing, auth, dashboard, pricing pages | API routes, SDK |
| `rabbit-found/unbrowser` | SDK client code | API routes, marketing pages |

## Completed Work

### Phase 2: Remove Marketing Pages from packages/api (DONE)

**PR #224** removed these files from `packages/api/src/routes/`:
- `landing.ts` (1796 lines)
- `auth.ts` (1232 lines)
- `dashboard-ui.ts`
- `pricing-page.ts`
- `pricing-calculator.ts`

**Updated `packages/api/src/app.ts`:**
- Removed mode system (`UNBROWSER_MODE`)
- Added redirects for marketing routes to `www.unbrowser.ai`
- Root endpoint returns API info (JSON) or redirects browsers

**Test updates:**
- Removed `tests/dedup/marketing-pages.test.ts`
- Updated `tests/dedup/api-only.test.ts` to verify marketing files don't exist

## Pending Work

### Phase 3: Remove SDK from packages/core (BLOCKED)

**Dependency:** `unbrowser-core` npm package needs to be updated to current version

**Current status:** Package exists at https://www.npmjs.com/package/unbrowser-core but contains an old version. Need to publish updated SDK from `rabbit-found/unbrowser` before removing local copy.

**Files to REMOVE from `packages/core/`:**
- Entire `packages/core/` directory

**Update root `package.json`:**
- Remove `packages/core` from workspaces
- Add `unbrowser-core` as dependency (from npm)

**Update imports in `packages/api/`:**
- Change: `import { ... } from '../../core/src/...'`
- To: `import { ... } from 'unbrowser-core'`

### Phase 4: Test Cleanup (Partial)

#### Tests to REMOVE from `ai-first-web-client` (after SDK removal):

| Test File | Reason |
|-----------|--------|
| `tests/sdk/http-client.test.ts` | SDK tests belong in `rabbit-found/unbrowser` |
| `tests/sdk-cache.test.ts` | SDK tests belong in `rabbit-found/unbrowser` |
| `tests/utils/http-client.test.ts` | SDK tests belong in `rabbit-found/unbrowser` |
| `tests/dedup/sdk-contract.test.ts` | Temporary - remove after dedup complete |

#### Tests to KEEP in `ai-first-web-client`:

| Test File | Reason |
|-----------|--------|
| `packages/api/tests/*.test.ts` | API route tests |
| `tests/core/*.test.ts` | Core intelligence tests |
| `tests/utils/*.test.ts` (except http-client) | Utility tests |

### Phase 5: Verification

After all changes:

1. **In `ai-first-web-client`:**
   ```bash
   npm test  # Should pass with fewer tests
   npm run build  # Should build successfully
   curl http://localhost:3001/health
   curl http://localhost:3001/docs
   curl http://localhost:3001/  # Should redirect to www.unbrowser.ai
   ```

2. **In `unbrowser-marketing`:**
   ```bash
   npm run build
   curl http://localhost:3001/  # Landing page
   curl http://localhost:3001/pricing  # Pricing page
   ```

3. **In `rabbit-found/unbrowser`:**
   ```bash
   npm test
   npm run build
   npm pack  # Verify package builds
   ```

## Rollback Plan

If issues arise:
1. All changes are in separate PRs
2. Each PR can be reverted independently
3. Keep branches until verified in production

## Open Questions

1. **SDK Publishing**: Is `rabbit-found/unbrowser` already published to npm? If not, we need to publish it before Phase 3.

2. ~~**API Server Mode**: After removing marketing pages, how does the API server respond to `/`?~~
   **RESOLVED**: Returns JSON for API clients, redirects browsers to `www.unbrowser.ai`
