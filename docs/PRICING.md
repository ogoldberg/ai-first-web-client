# Unbrowser Pricing & Packaging

**Version:** 1.0
**Last Updated:** 2025-12-21

---

## Overview

Unbrowser offers flexible pricing designed for LLM application builders, data pipeline teams, and enterprises. Pay for what you use, with predictable scaling.

---

## Tiers

### Free Tier

**For:** Evaluation and development

| Feature | Limit |
|---------|-------|
| Requests per day | 100 |
| Playwright tier | Disabled |
| Pattern storage | 10 patterns |
| Sessions | 1 |
| Support | Community |

**Price:** $0/month

---

### Starter

**For:** Indie developers and early-stage teams

| Feature | Limit |
|---------|-------|
| Requests per day | 1,000 |
| Requests per minute | 60 |
| Playwright tier | Enabled |
| Pattern storage | 100 patterns |
| Sessions | 5 |
| Analytics | Basic |
| Support | Email (48h response) |

**Price:** $29-99/month (usage-based)

**Best for:**
- Solo developers building AI agents
- Small projects with predictable usage
- Prototyping and MVPs

---

### Team

**For:** Small to mid-sized teams

| Feature | Limit |
|---------|-------|
| Requests per day | 10,000 |
| Requests per minute | 300 |
| Playwright tier | Enabled |
| Pattern storage | 1,000 patterns |
| Sessions | 20 per project |
| Projects | 5 |
| Team members | 10 |
| Shared pattern pools | Enabled |
| Analytics | Advanced |
| Support | Email (24h response) |

**Price:** $250-1,000/month (usage-based)

**Best for:**
- Teams building production AI applications
- Multiple projects with shared patterns
- Moderate-scale data pipelines

---

### Enterprise

**For:** Large organizations with compliance requirements

| Feature | Limit |
|---------|-------|
| Requests per day | Custom |
| Requests per minute | Custom |
| Playwright tier | Dedicated pool |
| Pattern storage | Unlimited |
| Sessions | Unlimited |
| Projects | Unlimited |
| Team members | Unlimited |
| Shared pattern pools | Private or shared |
| Analytics | Full + custom reports |
| Audit logs | Enabled |
| SSO/SAML | Enabled |
| VPC/On-prem | Available |
| SLA | 99.9% uptime |
| Support | Dedicated (1h response) |

**Price:** Custom ($20,000+ ARR)

**Best for:**
- Enterprise AI deployments
- Compliance-sensitive industries (finance, healthcare, government)
- High-volume data pipelines
- Custom integration requirements

---

## Pricing Model

### Base + Usage

All paid tiers combine a base subscription with usage-based pricing:

```text
Monthly Cost = Base Fee + (Request Units * Rate)
```

### Request Units

Requests are billed in units based on the rendering tier used:

| Tier | Cost (Units) | Typical Latency | Use Case |
|------|--------------|-----------------|----------|
| Intelligence | 1 | 50-200ms | Static content, cached patterns |
| Lightweight | 5 | 200-500ms | Basic JavaScript |
| Playwright | 25 | 2-5s | Complex SPAs, interactions |

**Example:** 10,000 requests/month
- 70% Intelligence tier = 7,000 units
- 25% Lightweight tier = 1,250 units (250 * 5)
- 5% Playwright tier = 1,250 units (50 * 25)
- **Total:** 9,500 units

### Unit Rates

| Tier | Rate per 1,000 Units |
|------|---------------------|
| Starter | $0.50 |
| Team | $0.40 |
| Enterprise | Custom |

---

## Feature Comparison

| Feature | Free | Starter | Team | Enterprise |
|---------|------|---------|------|------------|
| **Requests** |
| Daily limit | 100 | 1,000 | 10,000 | Custom |
| Rate limit (RPM) | 10 | 60 | 300 | Custom |
| **Rendering** |
| Intelligence tier | Yes | Yes | Yes | Yes |
| Lightweight tier | Yes | Yes | Yes | Yes |
| Playwright tier | No | Yes | Yes | Dedicated |
| **Storage** |
| Patterns | 10 | 100 | 1,000 | Unlimited |
| Sessions | 1 | 5 | 20/project | Unlimited |
| **Collaboration** |
| Team members | 1 | 1 | 10 | Unlimited |
| Projects | 1 | 1 | 5 | Unlimited |
| Shared patterns | No | No | Yes | Yes |
| **Analytics** |
| Usage dashboard | Basic | Basic | Advanced | Full |
| Custom reports | No | No | No | Yes |
| **Security** |
| Session encryption | Yes | Yes | Yes | Yes |
| Audit logs | No | No | No | Yes |
| SSO/SAML | No | No | No | Yes |
| VPC/On-prem | No | No | No | Yes |
| **Support** |
| Response time | Community | 48h | 24h | 1h |
| Dedicated CSM | No | No | No | Yes |
| SLA | None | None | None | 99.9% |

---

## Add-Ons

Available for Team and Enterprise tiers:

| Add-On | Description | Price |
|--------|-------------|-------|
| Additional Playwright browsers | Dedicated browser pool expansion | $100/browser/month |
| Pattern marketplace access | Pre-built patterns for common sites | $50/month |
| Priority support | 4h response time | $200/month |
| Custom integrations | Dedicated engineering support | Custom |

---

## Usage Tracking

Monitor your usage in real-time via:

1. **MCP Tools:** `get_usage_summary`, `get_cost_breakdown`
2. **Analytics Dashboard:** `get_analytics_dashboard`
3. **API:** Programmatic access to usage data

### Alerts

Set up alerts for:
- 80% of daily request limit
- 90% of monthly budget
- Unusual usage patterns

---

## Billing

### Payment Methods

- Credit card (all tiers)
- Invoice (Team, Enterprise)
- ACH/Wire (Enterprise)

### Billing Cycle

- Monthly (Starter, Team)
- Annual (all tiers, 2 months free)
- Custom (Enterprise)

### Overages

When you exceed your tier limits:

| Tier | Overage Policy |
|------|----------------|
| Free | Requests blocked |
| Starter | 1.5x unit rate for overages |
| Team | 1.25x unit rate for overages |
| Enterprise | Per contract |

---

## Getting Started

### Free Tier

1. Sign up at [llm-browser.com](https://llm-browser.com)
2. Get your API key
3. Start browsing

### Paid Tiers

1. Create account
2. Choose tier
3. Add payment method
4. Access advanced features

### Enterprise

1. Contact sales: sales@llm-browser.com
2. Requirements discussion
3. Custom proposal
4. Contract and onboarding

---

## FAQ

### How do I estimate my costs?

Use our [interactive pricing calculator](/pricing) to estimate costs based on your expected usage. The calculator allows you to:
- Adjust request counts for each tier with sliders
- Apply presets for common usage patterns (Hobby, Startup, Growth, Enterprise)
- See real-time cost breakdowns for all pricing tiers
- Get a recommended tier based on your usage

You can also use the programmatic API at `POST /pricing/calculate` with a JSON body containing `intelligenceRequests`, `lightweightRequests`, and `playwrightRequests`.

**Formula:**
```text
Monthly Cost = Base + (Intelligence * 0.001 + Lightweight * 0.005 + Playwright * 0.025) * Rate
```

### Can I change tiers?

Yes, upgrade or downgrade at any time. Changes take effect on the next billing cycle.

### What happens to my patterns if I downgrade?

Patterns are preserved but may become read-only if you exceed the new tier's limit. Upgrade again to regain write access.

### Is there a self-hosted option?

Yes, the open-source version runs locally. Enterprise customers can request on-premise deployment.

### Do you offer discounts?

- Annual billing: 2 months free (17% discount)
- Startups: Apply for our startup program
- Non-profits: 50% discount (contact sales)
- Open source projects: Free Team tier

---

## Support

| Tier | Channel | Response Time |
|------|---------|---------------|
| Free | GitHub Issues, Discord | Community |
| Starter | Email | 48 hours |
| Team | Email, Slack | 24 hours |
| Enterprise | Email, Slack, Phone | 1 hour |

---

## References

- [Hosted Alpha Checklist](HOSTED_ALPHA_CHECKLIST.md) - Infrastructure requirements
- [GO_TO_MARKET.md](GO_TO_MARKET.md) - Strategy and positioning
- [VISION.md](VISION.md) - Product vision
