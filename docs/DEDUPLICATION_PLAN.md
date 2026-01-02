# Code Deduplication Plan

## Problem Statement

The Unbrowser codebase is split across 3 repositories, but code is duplicated:

| Repository | Purpose | Duplicated Code |
|------------|---------|-----------------|
| `ai-first-web-client` | API + Core | Has SDK in `packages/core`, marketing pages in `packages/api/src/routes/` |
| `unbrowser-marketing` | Marketing Site | Has marketing pages (canonical location) |
| `rabbit-found/unbrowser` | SDK | Has SDK (canonical location) |

## Target State

After deduplication:

| Repository | Contains | Does NOT Contain |
|------------|----------|------------------|
| `ai-first-web-client` | API routes, core intelligence, MCP | Marketing pages, SDK |
| `unbrowser-marketing` | Landing, auth, dashboard, pricing pages | API routes, SDK |
| `rabbit-found/unbrowser` | SDK client code | API routes, marketing pages |

## Deduplication Steps

### Phase 1: Preparation (Before Any Changes)

1. **Run existing tests to establish baseline**
   ```bash
   # In ai-first-web-client
   npm test

   # Note: unbrowser-marketing has no tests currently
   ```

2. **Create deduplication detection tests** (DONE)
   - `tests/dedup/sdk-contract.test.ts` - Tests SDK interface
   - `tests/dedup/marketing-pages.test.ts` - Tests marketing page existence

3. **Document which tests will need updates**
   See "Test Cleanup" section below.

### Phase 2: Remove Marketing Pages from packages/api

**Files to REMOVE from `packages/api/src/routes/`:**
- `landing.ts` (1796 lines) - Keep in unbrowser-marketing
- `auth.ts` (1232 lines) - Keep in unbrowser-marketing
- `dashboard-ui.ts` - Keep in unbrowser-marketing
- `pricing-page.ts` - Keep in unbrowser-marketing
- `pricing-calculator.ts` - Keep in unbrowser-marketing

**Files to KEEP in `packages/api/src/routes/`:**
- `browse.ts` - Core API functionality
- `health.ts` - API health checks
- `docs.ts` - API documentation (Swagger UI)
- `admin.ts`, `admin-ui.ts` - Admin API
- `tenants.ts` - Tenant management API
- `billing.ts` - Billing API
- `workflows.ts` - Workflow API
- `discovery.ts` - API discovery
- All other API-specific routes

**Update `packages/api/src/app.ts`:**
- Remove route registrations for landing, auth, pricing pages
- Keep route registrations for API endpoints

### Phase 3: Remove SDK from packages/core

**Files to REMOVE from `packages/core/`:**
- Entire `packages/core/` directory

**Update root `package.json`:**
- Remove `packages/core` from workspaces
- Add `@unbrowser/core` or `unbrowser` as dependency (from npm)

**Update imports in `packages/api/`:**
- Change: `import { ... } from '../../core/src/...'`
- To: `import { ... } from '@unbrowser/core'` (or published SDK package)

### Phase 4: Test Cleanup

#### Tests to REMOVE from `ai-first-web-client`:

| Test File | Reason |
|-----------|--------|
| `tests/sdk/http-client.test.ts` | SDK tests belong in `rabbit-found/unbrowser` |
| `tests/sdk-cache.test.ts` | SDK tests belong in `rabbit-found/unbrowser` |
| `tests/utils/http-client.test.ts` | SDK tests belong in `rabbit-found/unbrowser` |
| `tests/dedup/sdk-contract.test.ts` | Temporary - remove after dedup complete |
| `tests/dedup/marketing-pages.test.ts` | Temporary - remove after dedup complete |

#### Tests to KEEP in `ai-first-web-client`:

| Test File | Reason |
|-----------|--------|
| `packages/api/tests/*.test.ts` | API route tests (browse, health, auth middleware, etc.) |
| `tests/core/*.test.ts` | Core intelligence tests |
| `tests/utils/*.test.ts` (except http-client) | Utility tests |

#### Tests to ADD to `ai-first-web-client`:

| Test File | Purpose |
|-----------|---------|
| `packages/api/tests/no-marketing.test.ts` | Verify marketing routes are NOT present |
| Integration tests that use SDK as dependency | Verify SDK integration works |

#### Tests to ADD to `unbrowser-marketing`:

| Test File | Purpose |
|-----------|---------|
| `tests/routes/landing.test.ts` | Landing page renders |
| `tests/routes/auth.test.ts` | Auth pages render |
| `tests/routes/pricing.test.ts` | Pricing pages render |
| `tests/links.test.ts` | Cross-domain links are correct |

#### Tests to ADD to `rabbit-found/unbrowser`:

| Test File | Purpose |
|-----------|---------|
| Move `tests/sdk/http-client.test.ts` | SDK client tests |
| Move `tests/sdk-cache.test.ts` | SDK caching tests |

### Phase 5: Verification

After all changes:

1. **In `ai-first-web-client`:**
   ```bash
   npm test  # Should pass with fewer tests
   npm run build  # Should build successfully
   # Verify API endpoints work
   curl http://localhost:3001/health
   curl http://localhost:3001/docs
   # Verify marketing routes return 404
   curl http://localhost:3001/  # Should be 404 or redirect
   ```

2. **In `unbrowser-marketing`:**
   ```bash
   npm test  # Should pass (new tests)
   npm run build
   # Verify pages render
   curl http://localhost:3001/  # Landing page
   curl http://localhost:3001/pricing  # Pricing page
   ```

3. **In `rabbit-found/unbrowser`:**
   ```bash
   npm test  # Should pass (moved tests)
   npm run build
   npm pack  # Verify package builds
   ```

## Rollback Plan

If issues arise:
1. All changes should be in separate PRs
2. Each PR can be reverted independently
3. Keep branches until verified in production

## Timeline

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Preparation | 1 hour | None |
| Phase 2: Remove marketing | 2-3 hours | Phase 1 |
| Phase 3: Remove SDK | 2-3 hours | SDK published to npm |
| Phase 4: Test cleanup | 1-2 hours | Phases 2, 3 |
| Phase 5: Verification | 1 hour | Phase 4 |

## Open Questions

1. **SDK Publishing**: Is `rabbit-found/unbrowser` already published to npm? If not, we need to publish it before Phase 3.

2. **API Server Mode**: After removing marketing pages, how does the API server respond to `/`? Options:
   - Return 404
   - Redirect to `www.unbrowser.ai`
   - Return a simple JSON response

3. **Shared Dependencies**: Are there any shared utilities between marketing and API that need to be extracted?
