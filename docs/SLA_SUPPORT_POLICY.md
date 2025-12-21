# LLM Browser SLA & Support Policy

**Version:** 1.0
**Last Updated:** 2025-12-21
**Effective Date:** TBD (upon alpha launch)

---

## Overview

This document defines the Service Level Agreement (SLA) and support policies for the LLM Browser hosted service. It outlines uptime commitments, support response times, escalation procedures, and service credit policies.

---

## Service Level Agreement (SLA)

### Uptime Commitments

| Tier | Monthly Uptime Target | Maximum Downtime/Month |
|------|----------------------|------------------------|
| Free | Best effort | N/A |
| Starter | 99.0% | 7 hours 18 minutes |
| Team | 99.5% | 3 hours 39 minutes |
| Enterprise | 99.9% | 43 minutes |

**Uptime Calculation:**
```text
Uptime % = ((Total Minutes - Downtime Minutes) / Total Minutes) * 100
```

**Exclusions from Downtime:**
- Scheduled maintenance (with 72-hour notice)
- Force majeure events
- Customer-caused issues
- Third-party service outages (cloud providers, DNS)
- Features in beta or preview

### Service Credit Schedule

When uptime falls below the committed level, Enterprise customers receive service credits:

| Monthly Uptime | Service Credit |
|----------------|----------------|
| 99.0% - 99.9% | 10% of monthly fee |
| 95.0% - 99.0% | 25% of monthly fee |
| 90.0% - 95.0% | 50% of monthly fee |
| Below 90.0% | 100% of monthly fee |

**Claiming Credits:**
1. Submit request within 30 days of incident
2. Include incident date, duration, and impact
3. Credits applied to next billing cycle
4. Maximum credit: 100% of monthly fee
5. Credits are non-refundable and non-transferable

---

## Support Tiers

### Free Tier

| Aspect | Details |
|--------|---------|
| Channels | GitHub Issues, Discord community |
| Response time | Best effort (community-driven) |
| Hours | N/A |
| Scope | Bug reports, general questions |

### Starter Tier

| Aspect | Details |
|--------|---------|
| Channels | Email (support@llm-browser.com) |
| Initial response | 48 business hours |
| Resolution target | 5 business days |
| Hours | Monday-Friday, 9am-5pm PT |
| Scope | Technical issues, configuration help |

### Team Tier

| Aspect | Details |
|--------|---------|
| Channels | Email, Slack (shared channel) |
| Initial response | 24 hours (P1), 48 hours (P2/P3) |
| Resolution target | 3 business days |
| Hours | Monday-Friday, 8am-6pm PT |
| Scope | Technical issues, architecture guidance, onboarding |

### Enterprise Tier

| Aspect | Details |
|--------|---------|
| Channels | Email, Slack, Phone, Dedicated CSM |
| Initial response | 1 hour (P1), 4 hours (P2), 24 hours (P3) |
| Resolution target | Same business day (P1) |
| Hours | 24/7 for P1 incidents |
| Scope | Full technical support, custom integrations, strategic guidance |

---

## Issue Priority Levels

### P1: Critical

**Definition:** Service is completely unavailable or severely degraded for all users.

**Examples:**
- Complete service outage
- Data loss or corruption
- Security breach

**Response:**
- Enterprise: 1-hour initial response, 24/7 attention until resolved
- All hands on deck approach
- Executive escalation after 2 hours

### P2: High

**Definition:** Major functionality impaired, significant business impact, no workaround.

**Examples:**
- Playwright tier completely failing
- Authentication system down
- Analytics not recording

**Response:**
- Enterprise: 4-hour initial response
- Team: 24-hour initial response
- Dedicated engineer assigned

### P3: Medium

**Definition:** Functionality impaired but workaround available, limited business impact.

**Examples:**
- Intermittent failures on specific domains
- Performance degradation
- UI/dashboard issues

**Response:**
- Enterprise: 24-hour initial response
- Team: 48-hour initial response
- Scheduled for next sprint if no quick fix

### P4: Low

**Definition:** Minor issue, cosmetic, or feature request.

**Examples:**
- Documentation errors
- Minor UI inconsistencies
- Feature suggestions

**Response:**
- Addressed in regular release cycle
- Added to backlog for prioritization

---

## Escalation Procedures

### Internal Escalation Path

```text
Level 1: Support Engineer (initial contact)
   |
   v (30 min without resolution for P1)
Level 2: Senior Engineer / On-call
   |
   v (2 hours without resolution for P1)
Level 3: Engineering Lead
   |
   v (4 hours without resolution for P1)
Level 4: VP Engineering / Executive
```

### Customer Escalation

Enterprise customers may request escalation by:
1. Contacting their dedicated CSM
2. Emailing escalations@llm-browser.com
3. Using the emergency phone line (provided at onboarding)

---

## Scheduled Maintenance

### Maintenance Windows

| Type | Frequency | Duration | Notice |
|------|-----------|----------|--------|
| Regular maintenance | Weekly | Up to 30 minutes | 72 hours |
| Major upgrades | Monthly | Up to 2 hours | 1 week |
| Emergency patches | As needed | As required | Best effort |

**Preferred Window:** Sundays, 2:00-4:00 AM PT

### Maintenance Notifications

- Email notification to all affected customers
- Status page update (status.llm-browser.com)
- In-product banner for logged-in users

---

## Incident Communication

### Status Page

**URL:** status.llm-browser.com (TBD)

**Components Tracked:**
- API availability
- Intelligence tier
- Lightweight tier
- Playwright tier
- Dashboard/Analytics
- Authentication

**Status Levels:**
- Operational (green)
- Degraded Performance (yellow)
- Partial Outage (orange)
- Major Outage (red)

### Incident Updates

| Time Since Incident | Update Frequency |
|--------------------|------------------|
| 0-30 minutes | Every 10 minutes |
| 30 min - 2 hours | Every 30 minutes |
| 2+ hours | Every hour |

### Post-Incident Reports

For P1 and P2 incidents affecting Enterprise customers:

- **Published within:** 5 business days
- **Contents:**
  - Timeline of events
  - Root cause analysis
  - Impact assessment
  - Remediation steps taken
  - Prevention measures

---

## Data Handling

### Retention

| Data Type | Retention Period |
|-----------|------------------|
| Request logs | 30 days |
| Usage metrics | 90 days |
| Learned patterns | Indefinite (until deleted) |
| Session data | Until manually deleted |
| Audit logs (Enterprise) | 1 year |

### Backup & Recovery

| Tier | Backup Frequency | Recovery Time Objective |
|------|------------------|------------------------|
| Free | Daily | Best effort |
| Starter | Daily | 24 hours |
| Team | Daily | 12 hours |
| Enterprise | Hourly | 4 hours |

### Data Export

All tiers can export their data:
- Learned patterns (JSON)
- Usage history (CSV)
- Session configurations (JSON)

Enterprise customers receive:
- Full audit log export
- Custom data format support
- Scheduled automated exports

---

## Security Incident Response

### Response Timeline

| Phase | Timeline |
|-------|----------|
| Detection | Continuous monitoring |
| Initial assessment | Within 1 hour |
| Customer notification | Within 24 hours (if affected) |
| Containment | Within 4 hours |
| Remediation | Within 72 hours |
| Post-mortem | Within 7 days |

### Notification Requirements

For security incidents affecting customer data:
- Email notification to account admins
- Detailed description of incident
- Affected data scope
- Remediation steps taken
- Recommended customer actions

---

## Service Modifications

### API Changes

| Change Type | Notice Period |
|-------------|---------------|
| New features | Immediate |
| Deprecation | 90 days |
| Breaking changes | 180 days |
| Emergency security fixes | Immediate |

### Pricing Changes

- 30-day notice for increases
- Effective at next billing cycle
- Existing contracts honored until renewal

---

## Limitations

### Fair Use

The service is subject to fair use guidelines:
- No automated abuse or DoS-style patterns
- No scraping for competitive intelligence against LLM Browser
- No reselling without partnership agreement

### Rate Limits

Rate limits are enforced per tier (see PRICING.md). Exceeding limits may result in:
1. Throttled requests (429 responses)
2. Temporary suspension for extreme abuse
3. Account termination for repeated violations

---

## Contact Information

| Purpose | Contact |
|---------|---------|
| General support | support@llm-browser.com |
| Sales inquiries | sales@llm-browser.com |
| Security reports | security@llm-browser.com |
| Escalations | escalations@llm-browser.com |
| Status updates | status.llm-browser.com |

---

## Policy Updates

This policy may be updated periodically. Changes will be:
- Posted to the documentation site
- Announced via email to Enterprise customers
- Effective 30 days after posting (except security-related updates)

---

## References

- [PRICING.md](PRICING.md) - Tier definitions and pricing
- [HOSTED_ALPHA_CHECKLIST.md](HOSTED_ALPHA_CHECKLIST.md) - Infrastructure requirements
- [LLM_ONBOARDING_SPEC.md](LLM_ONBOARDING_SPEC.md) - Technical onboarding
