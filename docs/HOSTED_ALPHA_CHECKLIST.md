# Hosted Alpha Checklist

**Status:** Pre-Alpha
**Target:** Limited alpha deployment for early customers
**Tier:** Starter (see GO_TO_MARKET.md)

---

## Overview

This checklist tracks the requirements for deploying Unbrowser as a hosted service for alpha customers. The goal is a managed MCP endpoint with basic analytics and limited stored patterns, as defined in the Starter tier.

---

## 1. Infrastructure

### Compute

| Item | Status | Notes |
|------|--------|-------|
| Container image (Docker) | TODO | Multi-stage build with node:20-slim base |
| Container registry | TODO | ECR, GCR, or Docker Hub |
| Orchestration (K8s, ECS, Fly.io) | TODO | Start with single replica, scale later |
| Health check endpoint | TODO | `/health` returning `{status: "ok"}` |
| Graceful shutdown handling | DONE | MCP SDK handles SIGTERM |
| Resource limits (CPU/memory) | TODO | Recommend 2 vCPU, 4GB RAM per instance |

### Browser Pool (Optional)

| Item | Status | Notes |
|------|--------|-------|
| Playwright browser install | TODO | `npx playwright install chromium` in container |
| Browser pool sizing | TODO | 2-4 concurrent browsers per instance |
| Browser reuse/recycling | TODO | Recycle after N requests or timeout |
| Headless mode enforcement | DONE | Default in BrowserManager |
| Browser crash recovery | TODO | Auto-restart on crash |

### Storage

| Item | Status | Notes |
|------|--------|-------|
| SQLite persistence (EmbeddedStore) | DONE | Already implemented (CX-007) |
| Persistent volume for SQLite | TODO | Mount at `/data` |
| Session storage encryption | DONE | AES-256-GCM with LLM_BROWSER_SESSION_KEY |
| Knowledge base persistence | DONE | SQLite via EmbeddedStore |
| Procedural memory persistence | DONE | SQLite via EmbeddedStore |
| Backup strategy | TODO | Daily SQLite snapshots to object storage |

### Networking

| Item | Status | Notes |
|------|--------|-------|
| HTTPS/TLS termination | TODO | Load balancer or reverse proxy |
| WebSocket support (MCP stdio) | TODO | May need HTTP/SSE transport for hosted |
| Egress filtering (SSRF protection) | DONE | URL safety module blocks RFC1918, localhost |
| DNS resolution controls | TODO | Consider blocking internal DNS names |

---

## 2. Authentication & Authorization

### Customer Access

| Item | Status | Notes |
|------|--------|-------|
| API key generation | TODO | Per-customer unique keys |
| API key validation middleware | TODO | Check on every request |
| API key rotation support | TODO | Allow multiple active keys per customer |
| API key revocation | TODO | Immediate revocation capability |
| Customer database/registry | TODO | Store customer metadata, limits |

### Multi-Tenancy

| Item | Status | Notes |
|------|--------|-------|
| Tenant isolation (TenantStore) | DONE | Namespace-prefixed storage (CX-008) |
| LLM_BROWSER_TENANT_ID env var | DONE | Set per customer request |
| Shared pattern pool (opt-in) | DONE | SharedPatternPool class |
| Cross-tenant data leak prevention | DONE | Unit tests for isolation |

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `LLM_BROWSER_SESSION_KEY` | Encrypt sessions at rest | Yes |
| `LLM_BROWSER_TENANT_ID` | Default tenant ID | No (defaults to 'default') |
| `LOG_LEVEL` | Logging verbosity | No (defaults to 'info') |
| `LOG_PRETTY` | Pretty print logs | No (false in production) |

---

## 3. Rate Limiting

### Per-Customer Limits

| Item | Status | Notes |
|------|--------|-------|
| Requests per minute limit | TODO | Configurable per tier (Starter: 60 RPM) |
| Requests per day limit | TODO | Configurable per tier (Starter: 1000/day) |
| Rate limit headers in response | TODO | X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset |
| Rate limit exceeded response | TODO | 429 Too Many Requests with retry-after |

### Per-Domain Limits

| Item | Status | Notes |
|------|--------|-------|
| Domain rate limiter | DONE | RateLimiter utility in src/utils |
| Configurable per-domain limits | TODO | Allow customer override |
| Domain blocking | TODO | Block known problematic domains |

### Tier-Based Limits

| Item | Status | Notes |
|------|--------|-------|
| Playwright request limits | TODO | Expensive tier, more restrictive |
| Intelligence tier (no limit) | TODO | Cheap tier, more generous |
| Cost tracking per request | DONE | UsageMeter with tier costs |

---

## 4. Logging & Observability

### Structured Logging

| Item | Status | Notes |
|------|--------|-------|
| Pino JSON logging | DONE | PR #20 |
| Secret redaction | DONE | Authorization, cookies, tokens redacted |
| Component child loggers | DONE | Per-module log context |
| Request ID correlation | TODO | Add request ID to all logs |
| Customer ID in logs | TODO | Associate logs with customer |

### Metrics

| Item | Status | Notes |
|------|--------|-------|
| Request latency histograms | TODO | P50, P95, P99 per tier |
| Request count by tier | DONE | PerformanceTracker |
| Error rate by category | TODO | From error taxonomy |
| Browser pool utilization | TODO | Active/idle browsers |

### Export

| Item | Status | Notes |
|------|--------|-------|
| Log aggregation (CloudWatch, Datadog) | TODO | JSON logs are compatible |
| Metrics export (Prometheus, StatsD) | TODO | Add metrics endpoint |
| Trace export (OpenTelemetry) | TODO | Future consideration |

### Dashboards

| Item | Status | Notes |
|------|--------|-------|
| System status dashboard | DONE | get_system_status MCP tool |
| Analytics dashboard | DONE | get_analytics_dashboard MCP tool |
| Customer-facing usage dashboard | TODO | Web UI for customers |

---

## 5. Reliability

### Error Handling

| Item | Status | Notes |
|------|--------|-------|
| Error boundaries in SmartBrowser | DONE | PR #9 |
| Structured error responses | DONE | CX-004 error taxonomy |
| Graceful degradation without Playwright | DONE | Falls back to lighter tiers |
| Timeout configuration | DONE | Centralized in src/utils/timeouts.ts |

### Health Monitoring

| Item | Status | Notes |
|------|--------|-------|
| Session health monitoring | DONE | PR #15 |
| Liveness probe | TODO | `/health/live` |
| Readiness probe | TODO | `/health/ready` (browser pool ready) |
| Dependency health checks | TODO | SQLite, browser pool status |

### Recovery

| Item | Status | Notes |
|------|--------|-------|
| Automatic restart on crash | TODO | Container orchestrator handles this |
| Browser crash recovery | TODO | BrowserManager restart |
| SQLite corruption recovery | TODO | Backup restoration |

---

## 6. Customer Onboarding

### Documentation

| Item | Status | Notes |
|------|--------|-------|
| LLM Onboarding Spec | DONE | LLM_ONBOARDING_SPEC.md (CX-012) |
| API reference | TODO | Document all MCP tools |
| Quick start guide | TODO | "First browse in 5 minutes" |
| Error handling guide | TODO | Based on error taxonomy |
| Best practices guide | TODO | Session management, tier selection |

### Self-Service

| Item | Status | Notes |
|------|--------|-------|
| Sign-up flow | TODO | Web form for alpha access |
| API key provisioning | TODO | Generate and display key |
| Usage dashboard | TODO | View request counts, costs |
| Support contact | TODO | Email/Discord for alpha feedback |

### Limits

| Item | Status | Notes |
|------|--------|-------|
| Alpha user capacity | TODO | Target: 10-20 alpha users |
| Free tier limits | TODO | Starter tier from GO_TO_MARKET.md |
| Upgrade path | TODO | Link to Team tier when ready |

---

## 7. Security

### Data Protection

| Item | Status | Notes |
|------|--------|-------|
| Session encryption at rest | DONE | S-003, AES-256-GCM |
| SSRF protection | DONE | S-001, URL safety module |
| Secret redaction in logs | DONE | S-002, Pino redact |
| Input validation | DONE | URL validation, parameter sanitization |

### Access Control

| Item | Status | Notes |
|------|--------|-------|
| API key authentication | TODO | Required for all requests |
| No public access | TODO | All endpoints require auth |
| Admin endpoints separation | TODO | Separate from customer endpoints |

### Compliance

| Item | Status | Notes |
|------|--------|-------|
| Privacy policy | TODO | What data is collected |
| Terms of service | TODO | Usage terms |
| Data retention policy | TODO | How long data is kept |
| GDPR considerations | TODO | For EU customers |

---

## 8. Deployment Pipeline

### CI/CD

| Item | Status | Notes |
|------|--------|-------|
| TypeScript build | DONE | `npm run build` |
| Unit tests | DONE | 1894+ tests |
| Live tests | DONE | 76 tests (LIVE_TESTS=true) |
| Container build | TODO | Dockerfile |
| Container push | TODO | To registry |
| Staging deployment | TODO | Pre-production environment |
| Production deployment | TODO | Rolling update strategy |

### Rollback

| Item | Status | Notes |
|------|--------|-------|
| Version tagging | TODO | Git tags for releases |
| Container versioning | TODO | Immutable container tags |
| Rollback procedure | TODO | Documented steps |
| Database migration rollback | TODO | For schema changes |

---

## 9. Pre-Launch Checklist

### Before Alpha Launch

- [ ] Infrastructure provisioned
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery tested
- [ ] Load testing completed
- [ ] Security review completed
- [ ] Documentation published
- [ ] Support channel established
- [ ] First 5-10 alpha users identified
- [ ] Feedback collection process defined

### Alpha Success Criteria

| Metric | Target | Notes |
|--------|--------|-------|
| Uptime | 95% | Allow for maintenance windows |
| P95 latency (intelligence tier) | <500ms | Excluding Playwright |
| Error rate | <5% | Excluding user errors |
| Customer satisfaction | 4/5 | Survey alpha users |
| Bugs reported | <10 critical | During alpha period |

---

## 10. Post-Alpha Improvements

Items to address before Team tier:

1. **Performance:** Optimize cold start, browser pool
2. **Scale:** Multi-instance deployment, load balancing
3. **Features:** Team collaboration, shared patterns
4. **Monitoring:** Customer-facing dashboards
5. **Support:** Dedicated support channels

---

## References

- [GO_TO_MARKET.md](GO_TO_MARKET.md) - Pricing and tier definitions
- [VISION.md](VISION.md) - Product vision and success metrics
- [LLM_ONBOARDING_SPEC.md](LLM_ONBOARDING_SPEC.md) - Client onboarding documentation
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - Current implementation status
