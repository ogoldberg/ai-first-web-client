# DMCA Agent Registration Guide

This guide walks you through registering your DMCA agent with the U.S. Copyright Office.

---

## Why Register a DMCA Agent?

**Legal Protection:** Registering a DMCA agent provides "safe harbor" protection under 17 U.S.C. § 512. This means:
- You're not liable for user copyright infringement (if you follow procedures)
- You must respond to valid takedown notices
- You must terminate repeat infringers

**Requirement:** Registration is **required** to claim safe harbor protection.

---

## Step 1: Prepare Your Information

You'll need the following information:

### Company Information
- **Service Provider Name:** Unbrowser (or your legal entity name)
- **Type of Organization:** Corporation / LLC / Individual
- **Address:** Your physical mailing address (P.O. boxes not allowed)
- **Website:** https://unbrowser.ai

### Designated Agent Information
- **Full Name:** [Your name or Legal Counsel's name]
- **Mailing Address:** [Same as company or separate office]
- **Telephone:** [10-digit phone number]
- **Email:** dmca@unbrowser.ai
- **Alternative Email (optional):** legal@unbrowser.ai

---

## Step 2: Register Online

### Official Registration Portal

**URL:** https://www.copyright.gov/dmca-directory/

**Process:**

1. **Create an account:**
   - Go to: https://dmca.copyright.gov/osp/
   - Click "Register for a public account"
   - Verify your email address

2. **Start a new designation:**
   - Log in to your account
   - Click "Designate a new agent"
   - Select "Service Provider" (you are NOT an OSP/ISP like Comcast)

3. **Fill out the form:**
   - **Service Provider Information:**
     - Legal Name: Unbrowser, Inc. (or your legal entity)
     - Doing Business As (DBA): Unbrowser
     - Type of Organization: [Corporation/LLC/etc.]
     - Address: [Your physical address]
     - Country: United States
     - Telephone: [Your number]
     - Alternate Contact Info: [Optional]

   - **Primary Designated Agent:**
     - Full Name: [Your name]
     - Mailing Address: [Physical address]
     - Telephone: [10-digit phone]
     - Email: dmca@unbrowser.ai
     - Fax (optional): [Leave blank if none]

   - **Alternate Designated Agent (Optional but Recommended):**
     - Add a backup contact (e.g., your legal counsel or co-founder)

   - **Nature of Service:**
     - Select: "Other" → Describe: "Web browsing API for AI agents"
     - Description: "Unbrowser provides an intelligent web browsing API that allows developers to programmatically access publicly available websites. Users control what sites are accessed."

4. **Review and submit:**
   - Review all information carefully
   - Agree to the terms
   - Pay the filing fee: **$6 per service**

5. **Receive confirmation:**
   - You'll receive an email confirmation within 1-2 business days
   - Your agent will appear in the public directory: https://dmca.copyright.gov/osp/

---

## Step 3: Update Your Website

Add a DMCA notice page to your website (already in your Terms of Service, but also create a standalone page):

**Create:** `https://unbrowser.ai/dmca`

```markdown
# DMCA Copyright Policy

Unbrowser respects intellectual property rights and complies with the DMCA.

## Designated Agent

**DMCA Agent:**
Email: dmca@unbrowser.ai
Phone: [YOUR PHONE]
Address:
[YOUR COMPANY NAME]
[STREET ADDRESS]
[CITY, STATE ZIP]

## Filing a DMCA Notice

To report copyright infringement, send a notice to the address above including:

1. Identification of the copyrighted work
2. Identification of the infringing material (URLs, API keys, tenant IDs)
3. Your contact information
4. Good faith statement
5. Statement of accuracy
6. Physical or electronic signature

See our full [Terms of Service](TERMS_OF_SERVICE.md) for details.
```

---

## Step 4: Set Up Email Handling

### Create dmca@unbrowser.ai Mailbox

**Option A: Shared mailbox (Recommended)**
- Create dmca@unbrowser.ai forwarding to your legal team
- Use a ticketing system (e.g., Zendesk, Help Scout)
- Ensure 24-hour monitoring

**Option B: Google Workspace / Microsoft 365**
- Add dmca@unbrowser.ai as a group
- Members: You, legal counsel, co-founders
- Set up auto-responder:

```
Subject: DMCA Notice Received - [Ticket #XXXXX]

Thank you for your DMCA takedown notice. We have received your request and assigned it ticket #XXXXX.

We will review your notice and respond within 24 hours.

If your notice is valid, we will:
1. Remove or disable access to the allegedly infringing material
2. Notify the user who made the request
3. Provide the user an opportunity to submit a counter-notice

Unbrowser DMCA Team
dmca@unbrowser.ai
```

---

## Step 5: Implement Takedown Procedures

You MUST respond to valid DMCA notices within a reasonable time (typically 24-48 hours).

### Internal Process

**1. Receive Notice (dmca@unbrowser.ai)**
- Log the notice in a tracking system (spreadsheet or ticketing system)
- Acknowledge receipt within 24 hours

**2. Validate the Notice**

Check if the notice includes all required elements:
- ✅ Identification of copyrighted work
- ✅ Identification of infringing material (URL, API key, tenant ID)
- ✅ Contact information (name, address, phone, email)
- ✅ Good faith statement
- ✅ Statement of accuracy
- ✅ Physical or electronic signature

**Invalid notices:** Respond and ask for missing information

**3. Investigate**
- Identify the tenant/user
- Review their usage (URLs accessed, content type)
- Determine if it's a valid claim

**4. Take Action**

If valid:
```sql
-- Temporarily suspend the tenant's access
UPDATE tenants SET suspended = true WHERE id = 'tenant_xxx';

-- Revoke their API keys
UPDATE api_keys SET revoked_at = NOW() WHERE tenant_id = 'tenant_xxx';

-- Log the DMCA incident
INSERT INTO dmca_incidents (tenant_id, notice_date, copyright_holder, outcome)
VALUES ('tenant_xxx', NOW(), 'Acme Corp', 'suspended');
```

If invalid:
- Respond to sender explaining why
- Do not take action against the user

**5. Notify the User**

Email template:
```
Subject: DMCA Takedown Notice - Action Required

Dear [User],

We received a DMCA takedown notice alleging that your use of Unbrowser
infringes copyright owned by [Copyright Holder].

Details:
- Copyrighted work: [Description]
- Allegedly infringing use: [URLs accessed]
- Notice date: [Date]

We have temporarily suspended your account while we investigate.

You may file a counter-notice if you believe this is an error. See:
https://unbrowser.ai/dmca-counter-notice

If you do not file a counter-notice within 10 business days, your
account will be permanently terminated.

Unbrowser DMCA Team
```

**6. Track Repeat Infringers**

After **3 valid DMCA notices**, permanently terminate the account:

```sql
-- Check number of incidents
SELECT COUNT(*) FROM dmca_incidents WHERE tenant_id = 'tenant_xxx';

-- If >= 3, permanently terminate
UPDATE tenants SET deleted_at = NOW(), deleted_reason = 'DMCA repeat infringer'
WHERE id = 'tenant_xxx';
```

---

## Step 6: Handle Counter-Notices

If a user believes the takedown was in error, they may file a **counter-notice**.

### Counter-Notice Requirements

The user must provide:
1. Identification of the removed material
2. Statement under penalty of perjury that material was removed by mistake
3. Consent to jurisdiction (in the copyright holder's district)
4. Physical or electronic signature

### Your Response

**1. Validate the counter-notice** (same as original notice validation)

**2. Forward to copyright holder:**
```
Subject: DMCA Counter-Notice Received

[Copyright Holder],

We received a counter-notice from the user you filed a DMCA notice against.
Attached is their counter-notice.

Under DMCA § 512(g), we are required to restore the material in 10-14 business
days unless you file a lawsuit seeking a court order.

If you file a lawsuit, please notify us immediately at dmca@unbrowser.ai.

Unbrowser DMCA Team
```

**3. Wait 10-14 business days**

If no lawsuit is filed:
- Restore the user's access
- Notify the user that access has been restored

If lawsuit is filed:
- Keep the account suspended
- Comply with court orders

---

## Step 7: Annual Renewal

DMCA agent registrations expire after **3 years**. The Copyright Office will send renewal notices.

**To renew:**
1. Log in to https://dmca.copyright.gov/osp/
2. Click "Renew designation"
3. Update any changed information
4. Pay the $6 renewal fee

**Calendar reminder:** Set a reminder for 2.5 years from registration date.

---

## Step 8: Maintain Records

Keep records of all DMCA activity for **at least 3 years**:

### Required Documentation

**For each notice:**
- Original DMCA notice (email, PDF)
- Date received
- Validation checklist
- Action taken (suspended, restored, etc.)
- User notification (email sent)
- Counter-notice (if any)
- Final resolution

**Store in:**
- Google Drive / Dropbox folder: `Legal/DMCA/`
- Database table: `dmca_incidents`
- Spreadsheet: `DMCA_Tracker.xlsx`

**Example spreadsheet columns:**
| Date | Tenant ID | Copyright Holder | Work | Action | Counter-Notice? | Resolution |
|------|-----------|------------------|------|--------|-----------------|------------|
| 2025-01-15 | tenant_abc | Acme Corp | Logo | Suspended | No | Terminated (3rd strike) |

---

## Quick Reference

### Key Deadlines

| Event | Deadline |
|-------|----------|
| Acknowledge DMCA notice | 24 hours |
| Take action on valid notice | 24-48 hours |
| User files counter-notice | 10 business days |
| Restore access after counter-notice | 10-14 business days (if no lawsuit) |
| Renew DMCA registration | Every 3 years |

### Contact Info to Include in All DMCA Communications

```
DMCA Agent
Email: dmca@unbrowser.ai
Phone: [YOUR PHONE]
Address:
[YOUR COMPANY NAME]
[STREET ADDRESS]
[CITY, STATE ZIP]
```

### Legal References

- **DMCA Text:** 17 U.S.C. § 512
- **Copyright Office:** https://www.copyright.gov/dmca/
- **Registration Portal:** https://dmca.copyright.gov/osp/
- **Public Directory:** https://dmca.copyright.gov/osp/

---

## Resources

**Official:**
- [Copyright Office DMCA Page](https://www.copyright.gov/dmca/)
- [DMCA Section 512 Text](https://www.copyright.gov/title17/92chap5.html#512)
- [Designation Tutorial](https://www.copyright.gov/dmca-directory/)

**Guides:**
- [EFF DMCA Guide](https://www.eff.org/issues/dmca)
- [Chilling Effects Database](https://www.lumendatabase.org/)

**Legal Help:**
- If you receive a complex notice, consult with an IP attorney
- For repeat issues, consider retaining legal counsel

---

## Implementation Checklist

- [ ] Decide who will be the designated agent (yourself, legal counsel, etc.)
- [ ] Gather all required information (company name, address, phone, email)
- [ ] Create dmca@unbrowser.ai email address
- [ ] Register at https://dmca.copyright.gov/osp/
- [ ] Pay $6 filing fee
- [ ] Add DMCA notice page to website (unbrowser.ai/dmca)
- [ ] Update Terms of Service with DMCA policy (already done ✅)
- [ ] Set up internal tracking system (spreadsheet or database)
- [ ] Create email templates for acknowledgment, suspension, restoration
- [ ] Document takedown procedures for your team
- [ ] Set calendar reminder for 3-year renewal
- [ ] Test the dmca@unbrowser.ai email (send test message)

---

**Questions?** Contact support@unbrowser.ai or consult with an intellectual property attorney.
