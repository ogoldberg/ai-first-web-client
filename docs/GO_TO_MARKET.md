# LLM Browser - Go-To-Market Plan & Pricing

**Date:** 2025-12-20
**Goal:** Turn the LLM Browser into a sustainable business while preserving open-source adoption.

---

## Positioning

**Category:** LLM-native web access and API discovery.

**Core value:** Faster, cheaper, and more reliable web access for LLM agents through learning and tiered rendering.

**Differentiator:** Learns from usage, bypasses rendering, and exposes structured outputs for LLM consumption.

---

## Open-Core Strategy

**Open source (core):**
- Tiered fetching
- Learning engine and basic memory
- MCP tools
- Content extraction and API discovery

**Paid (hosted + enterprise):**
- Multi-tenant isolation and shared pattern pools
- Analytics, monitoring, and SLAs
- Managed session storage with rotation
- Team features and access controls
- Pattern marketplace + verified patterns

---

## Target Customers

1. **LLM App Builders** (agents, RAG, automations)
2. **Data Pipeline Teams** (web ingestion at scale)
3. **Research/Analyst Orgs** (repeatable web access)
4. **Enterprises** (compliance, reliability, private deployments)

---

## MVP Commercial Offering (Hosted)

### Tier 1: Starter
- **Who:** Indie devs, early-stage teams
- **Includes:** Managed MCP endpoint, basic analytics, limited stored patterns
- **Value:** Zero infra setup, consistent performance
- **Price anchor:** Low monthly ($29–$99)

### Tier 2: Team
- **Who:** Small to mid teams
- **Includes:** Multi-tenant projects, shared pattern pools, access controls, alerts
- **Value:** Collaboration + reliability
- **Price anchor:** Mid monthly ($250–$1,000)

### Tier 3: Enterprise
- **Who:** Large orgs, compliance-driven teams
- **Includes:** SLA, dedicated support, custom domains, VPC/On-prem, audit logs
- **Value:** Security and governance
- **Price anchor:** Custom ($20k+ ARR)

---

## Pricing Model Options

1. **Usage-based:** Per request or per 1k pages
2. **Compute-based:** Meter by tier (intelligence vs. lightweight vs. Playwright)
3. **Seat-based add-on:** For shared tools, analytics, and support

Recommended: **Hybrid** (base subscription + usage for tiered compute).

---

## Product-Led Growth Loop

1. Open-source adoption via MCP integrations
2. Hosted “instant start” for production reliability
3. Add premium features for teams (patterns, monitoring, compliance)

---

## Sales Motion

**Self-serve:** Starter and Team tiers via web signup.

**Sales-led:** Enterprise with longer-term contracts and custom integrations.

---

## Near-Term Launch Plan (90 days)

1. **Month 1:**
   - Ship response contract + decision trace (CX-001 to CX-004)
   - Add minimal analytics endpoints
2. **Month 2:**
   - Release hosted alpha with limited capacity
   - Add usage metering and tier cost reporting
3. **Month 3:**
   - Launch Team tier with shared pattern pools
   - Start enterprise pipeline with 3–5 pilot customers

---

## Metrics to Track

- % requests resolved without Playwright
- Median response latency per tier
- Pattern reuse rate
- Retention per customer tier
- Support tickets per 1k requests

---

## Risks & Mitigations

- **Anti-bot / blocking:** Add retries, session health, and fallback tiers.
- **Learning drift:** Add provenance and decay tracing (CX-006).
- **Trust:** Publish response contract and error taxonomy.

---

## Decision Point

**Recommendation:** Open-source the core and monetize hosting + enterprise features. This builds trust and adoption while keeping a clear paid path.

