# Form & Protocol Coverage Analysis

**Date:** 2025-12-26
**Related:** CAPABILITY_GAPS_ANALYSIS.md, FORM_AUTOMATION_IMPLEMENTATION.md

## Overview

This document analyzes form submission and protocol coverage to identify what the FormSubmissionLearner currently handles vs. what it's missing.

---

## ✅ Currently Supported

### 1. **Standard HTML Forms**
- ✅ `<form>` elements with POST/PUT/PATCH/DELETE
- ✅ `application/x-www-form-urlencoded` (default form encoding)
- ✅ All input types: text, email, password, hidden, checkbox, radio, select, textarea
- ✅ CSRF tokens (hidden fields, meta tags)
- ✅ Dynamic fields (user IDs, session tokens, nonces, timestamps)

### 2. **REST APIs**
- ✅ JSON payloads (`application/json`)
- ✅ POST, PUT, PATCH, DELETE methods
- ✅ REST-compliant status codes (201, 204)
- ✅ Standard auth (Bearer, API keys, cookies)

---

## ⚠️ Partially Supported (Exists Elsewhere, Not Integrated)

### 1. **GraphQL Mutations**
**Status:** GraphQL introspection exists (`src/core/graphql-introspection.ts`) but NOT integrated with FormSubmissionLearner

**What's Missing:**
FormSubmissionLearner doesn't recognize GraphQL mutations as "form submissions"

**Example GraphQL Mutation:**
```graphql
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    email
    name
  }
}
```

**How it works:**
```typescript
POST /graphql
Content-Type: application/json

{
  "query": "mutation CreateUser($input: CreateUserInput!) { ... }",
  "variables": {
    "input": {
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

**Gap:** FormSubmissionLearner should detect GraphQL mutations and learn them as form patterns

### 2. **AsyncAPI / WebSockets**
**Status:** AsyncAPI discovery exists (`src/core/asyncapi-discovery.ts`) but no WebSocket form handling

**What's Missing:**
- No support for forms that submit via WebSocket
- No support for Socket.IO emit patterns
- No support for real-time form validation via WebSocket

**Example WebSocket Form:**
```javascript
// Modern chat/form submissions
socket.emit('form:submit', {
  formId: 'contact',
  fields: { name: '...', email: '...' }
});
```

**Gap:** Detect and learn WebSocket emission patterns

---

## ❌ Not Supported (Major Gaps)

### 1. **File Uploads (multipart/form-data)**
**Status:** ❌ **COMPLETELY MISSING**

**What's Missing:**
- No detection of `<input type="file">`
- No handling of `multipart/form-data` encoding
- No file upload to API pattern learning

**Example:**
```html
<form enctype="multipart/form-data" method="POST">
  <input type="file" name="avatar">
  <input type="text" name="description">
  <button type="submit">Upload</button>
</form>
```

**What happens:**
```
POST /api/upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="avatar"; filename="photo.jpg"
Content-Type: image/jpeg

[binary data]
------WebKitFormBoundary
Content-Disposition: form-data; name="description"

My profile photo
------WebKitFormBoundary--
```

**Impact:** File upload forms cannot be learned or automated

**Priority:** HIGH - Very common in real-world apps

### 2. **Server Actions (Next.js 13+, Remix)**
**Status:** ❌ **NOT DETECTED**

**What's Missing:**
Modern frameworks use server actions instead of traditional forms

**Example (Next.js Server Action):**
```typescript
// app/actions.ts
'use server'
export async function createUser(formData: FormData) {
  const name = formData.get('name');
  const email = formData.get('email');
  // ... server-side logic
}

// Component
<form action={createUser}>
  <input name="name" />
  <input name="email" />
  <button type="submit">Submit</button>
</form>
```

**What happens:**
```
POST /path/to/page
Content-Type: application/x-www-form-urlencoded
Next-Action: <action-id>

name=John&email=john%40example.com
```

**Gap:** Need to detect `Next-Action` header and learn server action patterns

### 3. **JSON-RPC**
**Status:** ❌ **NOT SUPPORTED**

**What's Missing:**
No detection of JSON-RPC method calls

**Example:**
```javascript
POST /api/rpc
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "user.create",
  "params": { "name": "John", "email": "john@example.com" },
  "id": 1
}
```

**Gap:** Detect `jsonrpc` field and learn RPC patterns

### 4. **gRPC-Web**
**Status:** ❌ **NOT SUPPORTED**

**What's Missing:**
Binary protocol used in modern SPAs

**Example:**
```
POST /api/UserService/CreateUser
Content-Type: application/grpc-web+proto

[binary protobuf data]
```

**Gap:** Detect `application/grpc-web` and learn proto schemas

### 5. **SOAP (XML-based)**
**Status:** ❌ **NOT SUPPORTED**

**What's Missing:**
Legacy but still used in enterprise

**Example:**
```xml
POST /api/soap
Content-Type: text/xml

<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <CreateUser>
      <name>John Doe</name>
      <email>john@example.com</email>
    </CreateUser>
  </soap:Body>
</soap:Envelope>
```

**Priority:** LOW - Legacy, declining usage

### 6. **Two-Factor Authentication (2FA/OTP)**
**Status:** ❌ **NOT HANDLED**

**What's Missing:**
Multi-step auth flows with OTP codes

**Example Flow:**
```
Step 1: Submit username/password
Step 2: System sends OTP via SMS/email
Step 3: User enters OTP code
Step 4: Authentication complete
```

**Gap:** Cannot automate OTP entry (requires user intervention)

**Solution:** Detect OTP challenge, pause workflow, prompt user, resume

### 7. **OAuth/OIDC Flows**
**Status:** ❌ **NOT AUTOMATED**

**What's Missing:**
Authorization flows with redirects

**Example (OAuth Authorization Code Flow):**
```
1. Redirect to /oauth/authorize
2. User grants permission
3. Redirect back with code
4. Exchange code for token
```

**Gap:** Multi-redirect flows not tracked as single workflow

### 8. **Progressive Enhancement / Optimistic Updates**
**Status:** ❌ **NOT DETECTED**

**What's Missing:**
Modern SPAs submit forms optimistically

**Example:**
```javascript
// Form submits immediately, shows optimistic UI
const optimisticUpdate = { id: 'temp-123', ...data };
setUsers([...users, optimisticUpdate]);

// Then makes API call in background
const result = await submitForm(data);

// Updates with real data
setUsers(users.map(u => u.id === 'temp-123' ? result : u));
```

**Gap:** Need to detect optimistic patterns and learn the actual API call

### 9. **Form Validation Standards**
**Status:** ⚠️ **PARTIALLY SUPPORTED**

**What's Supported:**
- ✅ HTML5 required attribute
- ✅ Basic type validation (email, number)

**What's Missing:**
- ❌ Complex validation patterns (regex, custom validators)
- ❌ Server-side validation error handling
- ❌ Field-level error messages
- ❌ Conditional validation (field X required if field Y is set)

### 10. **Rate Limiting & Retry Logic**
**Status:** ❌ **NOT IMPLEMENTED**

**What's Missing:**
- No detection of 429 (Too Many Requests)
- No automatic retry with exponential backoff
- No rate limit header parsing (`X-RateLimit-*`)

**Impact:** Form submissions may fail silently on rate limits

---

## 📊 Priority Matrix

### P0: Critical (Blocks Common Use Cases)

| Gap | Impact | Frequency | Difficulty |
|-----|--------|-----------|------------|
| **File Uploads** | HIGH | Very Common | Medium |
| **GraphQL Mutations** | HIGH | Common (growing) | Medium |
| **2FA/OTP** | HIGH | Common | High |

### P1: High Priority (Common Patterns)

| Gap | Impact | Frequency | Difficulty |
|-----|--------|-----------|------------|
| **Server Actions** (Next.js/Remix) | MEDIUM | Growing | Medium |
| **WebSocket Forms** | MEDIUM | Common (chat, real-time) | Medium |
| **OAuth Flows** | MEDIUM | Common | High |
| **Rate Limiting** | MEDIUM | Very Common | Low |

### P2: Medium Priority (Nice to Have)

| Gap | Impact | Frequency | Difficulty |
|-----|--------|-----------|------------|
| **JSON-RPC** | LOW | Uncommon | Low |
| **Validation Handling** | MEDIUM | Common | Medium |
| **Optimistic Updates** | LOW | Modern SPAs | Medium |

### P3: Low Priority (Edge Cases)

| Gap | Impact | Frequency | Difficulty |
|-----|--------|-----------|------------|
| **gRPC-Web** | LOW | Rare | High |
| **SOAP** | LOW | Legacy/declining | Medium |

---

## 🎯 Recommended Implementation Order

### Phase 1: File Uploads (Next Sprint)
**Task:** GAP-012: File Upload Support

**What to build:**
1. Detect `enctype="multipart/form-data"`
2. Detect `<input type="file">` fields
3. Capture file metadata (name, type, size)
4. Learn multipart patterns for replay
5. Handle file field separately (can't learn file content, only metadata)

**Key insight:** Learn the *structure* of file upload, prompt user for file on replay

```typescript
{
  fieldMapping: {
    description: 'description',
    avatar: 'avatar'  // File field
  },
  fileFields: [{
    name: 'avatar',
    accept: 'image/*',
    required: true,
    uploadEndpoint: '/api/upload'
  }]
}
```

### Phase 2: GraphQL Mutations
**Task:** GAP-013: GraphQL Mutation Learning

**What to build:**
1. Detect `POST /graphql` with mutation query
2. Parse GraphQL query to extract mutation name
3. Map form fields to GraphQL variables
4. Store as specialized GraphQL pattern
5. Integrate with existing GraphQL introspection

**Leverage existing:** `src/core/graphql-introspection.ts`

### Phase 3: 2FA/OTP Handling
**Task:** GAP-014: Two-Factor Authentication Support

**What to build:**
1. Detect OTP challenges (status code, response structure)
2. Pause workflow execution
3. Prompt user for OTP code
4. Resume workflow with OTP
5. Learn OTP endpoints for future detection

**User experience:**
```
[Form submission starts]
→ Detects 2FA challenge
→ "Please enter the code sent to your email: ____"
→ User enters code
→ Submission continues
```

### Phase 4: WebSocket Forms
**Task:** GAP-015: WebSocket Submission Support

**What to build:**
1. Detect WebSocket connections during form interaction
2. Capture `socket.emit()` patterns
3. Learn event names and payload structures
4. Replay via WebSocket on future submissions

**Leverage existing:** `src/core/asyncapi-discovery.ts`

### Phase 5: Server Actions
**Task:** GAP-016: Next.js/Remix Server Action Support

**What to build:**
1. Detect `Next-Action` header
2. Detect `action={serverAction}` in forms
3. Learn action IDs and endpoints
4. Handle server action responses

---

## 🔧 Implementation Notes

### File Uploads
**Challenge:** Can't learn file contents, only structure

**Solution:**
```typescript
{
  type: 'file_upload',
  pattern: {
    endpoint: '/api/upload',
    fileField: 'avatar',
    additionalFields: { description: '...' }
  },
  replayStrategy: 'prompt_user' // Prompt for file on replay
}
```

### GraphQL
**Challenge:** Complex query structures

**Solution:** Use existing GraphQL introspection to validate variables

### 2FA/OTP
**Challenge:** Requires real-time user input

**Solution:**
```typescript
{
  type: 'two_factor',
  pausePoint: 'otp_required',
  resumeStrategy: 'user_input',
  otpEndpoint: '/api/verify-otp'
}
```

### WebSockets
**Challenge:** Persistent connection required

**Solution:** Detect and upgrade connection before form submission

---

## 📝 Summary

**Current Coverage:**
- ✅ Standard HTML forms (POST/PUT/PATCH/DELETE)
- ✅ REST APIs with JSON
- ✅ CSRF tokens and dynamic fields
- ⚠️ GraphQL/AsyncAPI (exists but not integrated)

**Major Gaps:**
- ❌ File uploads (multipart/form-data)
- ❌ GraphQL mutations integration
- ❌ 2FA/OTP flows
- ❌ Server actions (Next.js/Remix)
- ❌ WebSocket submissions
- ❌ OAuth flows

**Estimated Impact:**
- File uploads: Blocks ~30% of real-world forms
- GraphQL: Blocks ~15% of modern APIs
- 2FA: Blocks ~50% of auth flows
- Combined: Missing coverage for ~40% of real-world scenarios

**Next Steps:**
1. Implement GAP-012 (File Uploads) - Highest impact
2. Implement GAP-013 (GraphQL Integration) - Growing adoption
3. Implement GAP-014 (2FA Support) - Critical for auth workflows
4. Update BACKLOG.md with new GAP tasks
