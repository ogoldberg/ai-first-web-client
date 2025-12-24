# Proxy Management & IP Blocking Prevention Plan

## Overview

This document outlines the implementation plan for preventing IP blocking in the Unbrowser cloud API. The solution combines proxy rotation, health monitoring, domain risk classification, and smart routing to ensure reliable web access at scale.

## Problem Statement

When operating a cloud-hosted web browsing API:
1. **Single IP exposure** - All requests from cloud servers share limited IPs
2. **Reputation damage** - One bad actor can get IPs blocked for everyone
3. **Site-specific blocking** - Different sites have different protection levels
4. **Cost optimization** - Residential proxies are expensive, should use sparingly

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browse Request                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DomainRiskClassifier                             │
│  ┌─────────────────┬─────────────────┬─────────────────────────┐   │
│  │ Risk Database   │ Historical Data │ Real-time Learning      │   │
│  └─────────────────┴─────────────────┴─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ risk level + tenant tier
┌─────────────────────────────────────────────────────────────────────┐
│                        ProxySelector                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Selection Matrix:                                           │   │
│  │  ┌──────────────┬────────────┬────────────┬──────────────┐  │   │
│  │  │              │ Low Risk   │ Med Risk   │ High Risk    │  │   │
│  │  ├──────────────┼────────────┼────────────┼──────────────┤  │   │
│  │  │ FREE         │ Datacenter │ Datacenter │ Block/Error  │  │   │
│  │  │ STARTER      │ Datacenter │ ISP        │ Residential  │  │   │
│  │  │ TEAM         │ Datacenter │ ISP        │ Residential  │  │   │
│  │  │ ENTERPRISE   │ Datacenter │ ISP        │ Residential+ │  │   │
│  │  └──────────────┴────────────┴────────────┴──────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ selected proxy tier
┌─────────────────────────────────────────────────────────────────────┐
│                        ProxyManager                                  │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Proxy Pools:                                                   │ │
│  │  ├─ Datacenter Pool (cheap, fast, easily blocked)             │ │
│  │  ├─ ISP Pool (mid-tier, better reputation)                    │ │
│  │  ├─ Residential Pool (expensive, best reputation)             │ │
│  │  └─ Premium Pool (Bright Data unlocker, last resort)          │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ proxy instance
┌─────────────────────────────────────────────────────────────────────┐
│                     ProxyHealthTracker                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Per-Proxy Metrics:                                             │ │
│  │  ├─ Success rate (last 100 requests)                          │ │
│  │  ├─ Per-domain block status                                   │ │
│  │  ├─ Cooldown timers                                           │ │
│  │  └─ Response time percentiles                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Execute Request                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. ProxyManager (`packages/api/src/services/proxy-manager.ts`)

Central orchestrator for proxy management.

```typescript
interface ProxyManager {
  // Get a proxy for a request
  getProxy(options: ProxyRequest): Promise<ProxyInstance>;

  // Report request outcome
  reportSuccess(proxyId: string, domain: string, latencyMs: number): void;
  reportFailure(proxyId: string, domain: string, reason: FailureReason): void;

  // Pool management
  addProxyPool(config: ProxyPoolConfig): void;
  removeProxyPool(poolId: string): void;
  getPoolStats(): ProxyPoolStats[];

  // Health monitoring
  getProxyHealth(proxyId: string): ProxyHealth;
  getBlockedProxies(domain?: string): ProxyHealth[];
}
```

### 2. ProxyHealthTracker (`packages/api/src/services/proxy-health.ts`)

Tracks proxy health and performance metrics.

```typescript
interface ProxyHealth {
  proxyId: string;
  poolId: string;

  // Overall health
  successRate: number;           // 0-1, based on last 100 requests
  avgLatencyMs: number;
  lastUsed: Date;

  // Per-domain tracking
  domainStats: Map<string, DomainStats>;
  blockedDomains: string[];

  // Cooldown management
  cooldownUntil: Date | null;
  cooldownReason: string | null;

  // Lifecycle
  createdAt: Date;
  totalRequests: number;
  totalFailures: number;
}

interface DomainStats {
  domain: string;
  successCount: number;
  failureCount: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  isBlocked: boolean;
  blockDetectedAt: Date | null;
}
```

### 3. DomainRiskClassifier (`packages/api/src/services/domain-risk.ts`)

Classifies domains by protection level and blocking risk.

```typescript
type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

interface DomainRisk {
  domain: string;
  riskLevel: RiskLevel;
  confidence: number;           // 0-1

  // Risk factors
  factors: {
    knownProtection: string[];   // ['cloudflare', 'datadome', etc.]
    historicalBlockRate: number; // 0-1
    requiresResidential: boolean;
    requiresSession: boolean;
    geoRestrictions: string[];   // Country codes
  };

  // Recommendations
  recommendedProxyTier: ProxyTier;
  recommendedDelayMs: number;
  specialHandling: string[];
}
```

**Risk Classification Sources:**
1. **Static rules** - Known high-protection sites (Google, Amazon, banks)
2. **Historical data** - Block rates from past requests
3. **Real-time detection** - Challenge pages, 403s, CAPTCHAs
4. **Protection fingerprinting** - Cloudflare, DataDome, PerimeterX signatures

### 4. ProxySelector (`packages/api/src/services/proxy-selector.ts`)

Selects optimal proxy based on risk and tenant tier.

```typescript
interface ProxySelector {
  // Main selection method
  selectProxy(request: SelectionRequest): Promise<ProxyInstance>;

  // Fallback handling
  selectFallback(originalProxy: ProxyInstance, domain: string): Promise<ProxyInstance | null>;
}

interface SelectionRequest {
  domain: string;
  tenantId: string;
  tenantPlan: Plan;

  // Optional preferences
  preferredCountry?: string;
  requireFresh?: boolean;        // Avoid recently-used proxies
  stickySession?: string;        // Use same proxy for session
}
```

## Proxy Tiers

| Tier | Provider | Cost | Use Case | Block Resistance |
|------|----------|------|----------|------------------|
| **Datacenter** | Internal pool / cheap provider | $ | News, docs, public APIs | Low |
| **ISP** | Residential ISP proxies | $$ | E-commerce, social | Medium |
| **Residential** | Bright Data residential | $$$ | Protected sites | High |
| **Premium** | Bright Data unlocker | $$$$ | Extreme protection | Very High |

## Configuration

### Environment Variables

```bash
# Proxy pool configuration
PROXY_DATACENTER_URLS=http://user:pass@dc1.proxy.com:8080,http://user:pass@dc2.proxy.com:8080
PROXY_ISP_URLS=http://user:pass@isp1.proxy.com:8080
PROXY_RESIDENTIAL_ENABLED=true
BRIGHTDATA_AUTH=customer_id:password
BRIGHTDATA_ZONE=residential

# Health tracking
PROXY_HEALTH_WINDOW=100          # Requests to track per proxy
PROXY_COOLDOWN_MINUTES=60        # Cooldown after blocking
PROXY_BLOCK_THRESHOLD=0.3        # Block rate to trigger cooldown

# Domain risk
DOMAIN_RISK_CACHE_MINUTES=60     # Cache risk assessments
DOMAIN_RISK_LEARNING=true        # Learn from failures
```

### Tenant Plan Limits

```typescript
const PLAN_PROXY_ACCESS: Record<Plan, ProxyTier[]> = {
  FREE: ['datacenter'],
  STARTER: ['datacenter', 'isp'],
  TEAM: ['datacenter', 'isp', 'residential'],
  ENTERPRISE: ['datacenter', 'isp', 'residential', 'premium'],
};
```

## Implementation Phases

### Phase 1: Core Infrastructure (This PR)
- [x] ProxyManager interface and basic implementation
- [x] ProxyHealthTracker with in-memory storage
- [x] DomainRiskClassifier with static rules
- [x] ProxySelector with tier-based selection
- [x] Integration with browse endpoints

### Phase 2: External Providers (Future)
- [ ] Datacenter proxy pool integration
- [ ] ISP proxy provider integration
- [ ] Enhanced Bright Data integration
- [ ] Proxy rotation within pools

### Phase 3: Persistence & Learning (Future)
- [ ] Redis/database for health tracking
- [ ] Historical risk data persistence
- [ ] Machine learning for risk prediction
- [ ] Cross-tenant pattern sharing

### Phase 4: Advanced Features (Future)
- [ ] Geographic targeting per request
- [ ] Session stickiness across requests
- [ ] Automatic pool scaling
- [ ] Cost optimization algorithms

## API Changes

### Browse Request Options

```typescript
interface BrowseRequest {
  url: string;
  options?: {
    // ... existing options ...

    // New proxy options
    proxy?: {
      preferredTier?: ProxyTier;
      preferredCountry?: string;
      requireFresh?: boolean;
      stickySessionId?: string;
    };
  };
}
```

### Response Metadata

```typescript
interface BrowseResponse {
  // ... existing fields ...

  metadata: {
    // ... existing metadata ...

    proxy?: {
      tier: ProxyTier;
      country: string;
      latencyMs: number;
      fromPool: string;
    };
  };
}
```

## Error Handling

### Graceful Degradation

1. **Primary proxy fails** → Try next proxy in same tier
2. **Tier exhausted** → Escalate to higher tier (if plan allows)
3. **All proxies fail** → Return error with retry guidance
4. **Block detected** → Mark proxy blocked for domain, try different proxy

### Error Responses

```typescript
interface ProxyError {
  code: 'PROXY_BLOCKED' | 'PROXY_EXHAUSTED' | 'TIER_UNAVAILABLE';
  message: string;
  domain: string;
  attemptedTiers: ProxyTier[];
  recommendation: {
    retryAfterMs?: number;
    upgradePlan?: boolean;
    alternativeApproach?: string;
  };
}
```

## Monitoring & Observability

### Metrics to Track

- Proxy success rate by tier
- Block rate by domain
- Proxy rotation frequency
- Tier escalation frequency
- Cost per request by tier
- Latency percentiles by tier

### Logging

```typescript
// Request routing
logger.info('Proxy selected', {
  domain,
  tenantId,
  riskLevel,
  selectedTier,
  proxyId,
});

// Health events
logger.warn('Proxy blocked', {
  proxyId,
  domain,
  blockRate,
  cooldownMinutes,
});

// Cost tracking
logger.info('Request completed', {
  domain,
  proxyTier,
  cost: TIER_COSTS[tier],
  latencyMs,
});
```

## Security Considerations

1. **Credential storage** - Proxy credentials in env vars, never logged
2. **Tenant isolation** - Proxy health is global, but selection considers tenant
3. **Abuse prevention** - Rate limiting prevents proxy pool exhaustion
4. **Audit logging** - Track which tenant used which proxy

## Success Criteria

1. **Block rate < 5%** for supported sites
2. **Automatic recovery** within 1 hour of blocks
3. **Cost efficiency** - 80% of requests on datacenter proxies
4. **Transparent escalation** - Users see tier in response metadata
5. **Zero credential exposure** in logs or responses

## Files to Create

```
packages/api/src/services/
├── proxy-manager.ts        # Main orchestrator
├── proxy-health.ts         # Health tracking
├── proxy-selector.ts       # Selection logic
├── domain-risk.ts          # Risk classification
└── proxy-types.ts          # Shared types

packages/api/src/middleware/
└── proxy.ts               # Request middleware

tests/api/services/
├── proxy-manager.test.ts
├── proxy-health.test.ts
├── proxy-selector.test.ts
└── domain-risk.test.ts
```
