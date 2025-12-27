# Privacy Policy

**Effective Date:** [DATE]
**Last Updated:** [DATE]

---

## Introduction

Unbrowser ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our web browsing API service.

**Key Principles:**
- We collect only what's necessary to provide the Service
- We do **not** store scraped content from websites you browse
- We do **not** sell or share your personal data with third parties
- You have rights to access, export, and delete your data

This Privacy Policy applies to all users of Unbrowser, including individuals and businesses using our API, SDK, or MCP server.

---

## 1. Information We Collect

### 1.1 Account Information

When you create an account, we collect:
- **Email address** (for account identification and communications)
- **API keys** (stored as SHA-256 hashes for security)
- **Company name** (optional, for Enterprise accounts)
- **Billing information** (processed by Stripe, not stored by us)

### 1.2 Usage Data

When you use the Service, we automatically collect:
- **Request metadata:** URLs accessed, timestamps, tier used (intelligence/lightweight/playwright)
- **Performance metrics:** Response times, success/failure rates, tier fallback events
- **Domain patterns:** Domains you frequently access (for learning optimization)
- **Usage statistics:** Request counts, daily/monthly totals, quota consumption

### 1.3 Session Data (From Websites You Browse)

**IMPORTANT:** This data comes from websites **you** browse, not from you directly.

We temporarily store:
- **Cookies:** Session cookies from websites you browse (7-day TTL)
- **localStorage/sessionStorage:** Browser storage from websites you browse (7-day TTL)
- **Authentication tokens:** Auth headers and bearer tokens (7-day TTL)

**Purpose:** To maintain authenticated sessions across multiple requests.

**Retention:** Auto-deleted after **7 days** (configurable per session).

**Your Responsibility:** You are responsible for compliance with privacy laws (GDPR, CCPA) when scraping websites containing personal data. See Section 7 below.

### 1.4 Learning Data (Anonymized)

We store anonymized learning patterns to improve performance:
- **API patterns:** Discovered API endpoints, HTTP methods, response types
- **CSS selectors:** Successful selectors for extracting content
- **Browsing skills:** Action sequences (click, scroll, fill) for common workflows
- **Domain groups:** Similar domains for pattern transfer

**What we DON'T store:**
- Raw HTML, markdown, or text from scraped pages
- Personal data from websites you browse (names, emails, addresses, etc.)
- Your proprietary data or business logic

### 1.5 Technical Data

We collect standard technical information:
- **IP addresses:** Logged temporarily for security and abuse prevention (7-day retention)
- **User-agent strings:** To detect automation and prevent abuse
- **Request headers:** For authentication and rate limiting

---

## 2. How We Use Your Information

### 2.1 To Provide the Service

- Authenticate API requests
- Route requests through appropriate rendering tiers
- Maintain authenticated sessions across requests
- Learn browsing patterns to improve performance
- Enforce rate limits and quotas

### 2.2 To Improve the Service

- Analyze usage patterns to optimize tier selection
- Identify common domains for pattern sharing
- Debug errors and improve reliability
- Develop new features based on usage trends

### 2.3 To Communicate with You

- Send service announcements (downtime, maintenance)
- Notify you of account issues (quota exceeded, payment failed)
- Respond to support requests
- Send billing invoices and receipts

### 2.4 For Security & Compliance

- Detect and prevent abuse (spam, DoS attacks, scraping violations)
- Investigate DMCA takedown notices
- Comply with legal obligations (subpoenas, court orders)
- Enforce our Terms of Service

### 2.5 What We DON'T Do

- ❌ We do **not** sell your personal data
- ❌ We do **not** share your data with advertisers
- ❌ We do **not** use your data for marketing (except service-related emails)
- ❌ We do **not** train AI models on your scraped content

---

## 3. Data Storage & Retention

### 3.1 Where We Store Data

**United States (Primary):**
- PostgreSQL (Supabase) - US region: Account data, API keys, usage stats
- Redis (Upstash/AWS ElastiCache) - US region: Session data, rate limits

**European Union (Optional for Enterprise):**
- PostgreSQL (Supabase) - EU region: Account data (GDPR compliance)
- Redis - EU region: Session data

Your data residency can be configured in your account settings (Enterprise only).

### 3.2 How Long We Retain Data

| Data Type | Retention Period | Reason |
|-----------|------------------|--------|
| **Account info** | Until account deletion | Required for service |
| **API keys (hashed)** | Until revoked/deleted | Authentication |
| **Session data** | 7 days (auto-delete) | Authenticated browsing |
| **Usage statistics** | 13 months | Billing, analytics |
| **Learning patterns** | Indefinite | Service optimization |
| **IP logs** | 7 days | Security, abuse prevention |
| **Support tickets** | 3 years | Legal compliance |

### 3.3 Data Deletion

When you delete your account:
- Account data is deleted within **30 days**
- Session data is deleted **immediately**
- API keys are revoked **immediately**
- Learning patterns are anonymized (cannot be traced back to you)
- Backups are purged within **90 days**

You can also request immediate deletion via `DELETE /v1/tenants/:id/data` (see Section 5 below).

---

## 4. Data Sharing & Disclosure

### 4.1 With Service Providers

We share data with trusted third-party providers:

| Provider | Purpose | Data Shared | Location |
|----------|---------|-------------|----------|
| **Supabase** | Database hosting | Account data, usage stats | US/EU |
| **Upstash** | Session storage (Redis) | Cookies, auth tokens | US/EU |
| **Stripe** | Payment processing | Billing info (you → Stripe direct) | US |
| **AWS** | Infrastructure (optional) | All data (if you choose AWS hosting) | US/EU |

All providers are GDPR-compliant and have signed Data Processing Agreements (DPAs).

### 4.2 With Other Users (Opt-In Only)

**Collective Learning (Optional):**
- You can opt-in to share anonymized learning patterns with other Unbrowser users
- Shared patterns improve performance for everyone
- **Default:** OFF (you must explicitly enable this)
- Shared patterns include: API endpoints, selectors, skills
- Shared patterns do **not** include: Your data, auth tokens, or personal info

Enable/disable in your account settings: `sharePatterns: true/false`

### 4.3 For Legal Compliance

We may disclose your information if required by law:
- **Subpoenas or court orders** (we notify you unless prohibited)
- **DMCA takedown notices** (if you're accused of copyright infringement)
- **Law enforcement requests** (we comply with valid legal process)
- **National security requests** (we publish transparency reports annually)

We will resist overly broad or unlawful requests and notify you when legally permitted.

### 4.4 Business Transfers

If Unbrowser is acquired or merged:
- Your data may be transferred to the new owner
- You will be notified 30 days in advance
- The new owner must honor this Privacy Policy or obtain your consent for changes

---

## 5. Your Privacy Rights

### 5.1 GDPR Rights (EU Users)

If you are in the European Union, you have the following rights:

**Right to Access:**
- Request a copy of your data: `GET /v1/tenants/:id/data`
- We will provide your data in JSON format within **30 days**

**Right to Rectification:**
- Update your account information in your account settings
- Contact privacy@unbrowser.ai to correct inaccuracies

**Right to Erasure ("Right to be Forgotten"):**
- Delete your account: `DELETE /v1/tenants/:id/data`
- We will delete your data within **30 days** (backups within 90 days)

**Right to Data Portability:**
- Export your data in machine-readable JSON format: `GET /v1/tenants/:id/data`
- Includes: Account info, usage stats, workflows, learning patterns

**Right to Object:**
- Opt-out of collective learning pattern sharing (default: OFF)
- Opt-out of service emails (except critical account notifications)

**Right to Restrict Processing:**
- Request temporary suspension of data processing (contact privacy@unbrowser.ai)

**Right to Lodge a Complaint:**
- File a complaint with your national Data Protection Authority
- EU users can contact their local [DPA](https://edpb.europa.eu/about-edpb/board/members_en)

### 5.2 CCPA Rights (California Users)

If you are a California resident, you have the following rights:

**Right to Know:**
- Request disclosure of personal information collected: `GET /v1/tenants/:id/data`
- We will provide details on categories collected, sources, purposes, and third parties

**Right to Delete:**
- Request deletion of personal information: `DELETE /v1/tenants/:id/data`
- Exceptions: We may retain data required for legal compliance or fraud prevention

**Right to Opt-Out of Sale:**
- ✅ **Not applicable:** We do **not** sell personal information

**Right to Non-Discrimination:**
- We will not discriminate against you for exercising your CCPA rights
- You will receive the same service quality regardless of requests

**Authorized Agent:**
- You may designate an authorized agent to make requests on your behalf
- Agent must provide proof of authorization

### 5.3 How to Exercise Your Rights

**API Endpoints:**
- Export data: `GET /v1/tenants/:id/data` (requires authentication)
- Delete data: `DELETE /v1/tenants/:id/data` (requires confirmation)

**Email:**
- Send requests to: privacy@unbrowser.ai
- Include: Your email, tenant ID, and specific request
- We will respond within **30 days** (GDPR) or **45 days** (CCPA)

**Verification:**
- We will verify your identity before processing requests
- You may be asked to confirm your email or provide API key

---

## 6. Security Measures

We implement industry-standard security measures to protect your data:

### 6.1 Technical Safeguards

- **Encryption in transit:** TLS 1.3 for all API requests
- **Encryption at rest:** AES-256 for database storage
- **API key hashing:** SHA-256 hashing (keys are never stored in plaintext)
- **Access controls:** Role-based access control (RBAC) for internal systems
- **Network security:** VPC isolation, firewalls, DDoS protection

### 6.2 Organizational Safeguards

- **Least privilege:** Employees have access only to data they need
- **Background checks:** All employees undergo security screening
- **Training:** Regular security and privacy training
- **Incident response:** 72-hour breach notification (GDPR requirement)

### 6.3 Third-Party Audits

- **SOC 2 Type II:** Annual compliance audit (via Supabase)
- **Penetration testing:** Quarterly security assessments
- **Vulnerability scanning:** Continuous monitoring

### 6.4 Data Breach Notification

If a data breach occurs:
- We will notify you within **72 hours** (GDPR requirement)
- Notification includes: Nature of breach, data affected, mitigation steps
- We will notify relevant authorities (EU DPAs, FTC, state AGs)

---

## 7. Scraping Third-Party Websites: Your Responsibilities

**CRITICAL:** When you use Unbrowser to scrape websites, **you** are the data controller under GDPR/CCPA, and **we** are the data processor.

### 7.1 Your Obligations

If you scrape websites containing personal data (names, emails, addresses, etc.), you must:

**Establish a Lawful Basis (GDPR Article 6):**
- **Consent:** Obtain explicit consent from data subjects
- **Contract:** Scraping is necessary to fulfill a contract
- **Legitimate Interest:** You have a legitimate interest (and conduct balancing test)
- **Legal Obligation:** Required by law
- **Vital Interests:** Necessary to protect life
- **Public Task:** Performing a task in the public interest

**Provide Privacy Notices:**
- Inform data subjects that their data is being collected
- Explain the purpose, legal basis, and retention period
- Provide contact information for data subject requests

**Honor Data Subject Rights:**
- Respond to access, deletion, and portability requests
- Implement processes for opt-out and consent withdrawal

**Minimize Data Collection:**
- Collect only what's necessary for your purpose
- Avoid collecting sensitive data (health, race, religion, etc.) unless essential

**Secure Scraped Data:**
- Store scraped data securely (encryption, access controls)
- Delete data when no longer needed

### 7.2 Unbrowser's Role

As a data processor, Unbrowser:
- Processes data only per your instructions (API requests)
- Does **not** store scraped content long-term
- Does **not** use your scraped data for our own purposes
- Provides tools to help you comply (session expiry, data deletion)

### 7.3 Data Processing Agreement (DPA)

**Enterprise customers:** We offer a Data Processing Agreement (DPA) that outlines our obligations as a processor and your obligations as a controller.

Contact sales@unbrowser.ai to request a DPA.

---

## 8. Cookies & Tracking

### 8.1 Our Website

We use cookies on unbrowser.ai for:
- **Authentication:** Session cookies to keep you logged in
- **Analytics:** Google Analytics (anonymized IPs)
- **Preferences:** Remember your settings (theme, language)

You can disable cookies in your browser settings.

### 8.2 API Service

The Unbrowser API does **not** use cookies or tracking. API requests are authenticated via API keys.

### 8.3 Cookies from Scraped Sites

When you use Unbrowser to browse websites:
- We temporarily store cookies from those websites (7-day TTL)
- These cookies are **not** used to track you
- These cookies are stored to maintain authenticated sessions for your API requests

---

## 9. Children's Privacy

Unbrowser is not intended for users under 18 years of age. We do not knowingly collect personal information from children.

If you believe a child under 18 has provided us with personal information, contact privacy@unbrowser.ai and we will delete it immediately.

---

## 10. International Data Transfers

### 10.1 US-EU Data Transfers

If you are in the EU and your data is stored in the US:
- We rely on **Standard Contractual Clauses (SCCs)** approved by the European Commission
- Our subprocessors (Supabase, Upstash) have signed SCCs
- You may request EU data residency (Enterprise plans)

### 10.2 Other Jurisdictions

If you are in another country:
- Your data may be transferred to the US or EU for processing
- We ensure adequate safeguards (SCCs, Privacy Shield alternatives)
- Contact privacy@unbrowser.ai for jurisdiction-specific questions

---

## 11. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. When we do:
- We will update the "Last Updated" date at the top
- We will notify you via email for material changes
- Continued use of the Service after changes constitutes acceptance

You can view the history of changes at: [GitHub Repository URL]

---

## 12. Contact Information

**Privacy Officer:** privacy@unbrowser.ai

**General Inquiries:** support@unbrowser.ai

**Data Protection Officer (EU):** dpo@unbrowser.ai

**Mailing Address:**
[YOUR COMPANY NAME]
[STREET ADDRESS]
[CITY, STATE ZIP]
[COUNTRY]

**Data Subject Requests:**
- EU users: Contact your [local DPA](https://edpb.europa.eu/about-edpb/board/members_en)
- California users: Contact [California Attorney General](https://oag.ca.gov/privacy)

---

## 13. Transparency Report

We publish an annual transparency report detailing:
- Number of legal requests received (subpoenas, court orders)
- Number of DMCA takedown notices
- Data breaches (if any)
- Number of accounts suspended for abuse

View our transparency report at: [URL]

---

## Appendix: Data Inventory

For transparency, here's a complete inventory of personal data we process:

| Data Category | Examples | Purpose | Retention | Legal Basis (GDPR) |
|---------------|----------|---------|-----------|-------------------|
| **Account data** | Email, company name | Authentication, billing | Until deletion | Contract (Art. 6(1)(b)) |
| **API keys** | SHA-256 hashes | Authentication | Until revoked | Contract (Art. 6(1)(b)) |
| **Usage stats** | Request counts, domains | Billing, analytics | 13 months | Contract (Art. 6(1)(b)) |
| **Session cookies** | Cookies from scraped sites | Authenticated browsing | 7 days | Legitimate interest (Art. 6(1)(f)) |
| **IP addresses** | Request IPs | Security, abuse prevention | 7 days | Legitimate interest (Art. 6(1)(f)) |
| **Learning patterns** | API endpoints, selectors | Service optimization | Indefinite (anonymized) | Legitimate interest (Art. 6(1)(f)) |
| **Support tickets** | Email, issue details | Customer support | 3 years | Legitimate interest (Art. 6(1)(f)) |

---

**By using Unbrowser, you acknowledge that you have read and understood this Privacy Policy.**

For questions, contact privacy@unbrowser.ai
