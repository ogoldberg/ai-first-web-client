# GraphQL Form Submission Support (GAP-013)

**Status:** ✅ **Implemented**
**Date:** 2025-12-26

## Overview

FormSubmissionLearner now detects and learns GraphQL mutations, enabling forms that submit to GraphQL APIs to be automated with direct API calls.

## How It Works

### Detection

When a form is submitted, the system:
1. Monitors network requests during submission
2. Detects POST requests to `/graphql`, `/gql`, or `/query` endpoints
3. Captures the GraphQL mutation query and variables
4. Extracts the mutation name from the query

### Learning

The system creates a specialized GraphQL pattern:
```typescript
{
  patternType: 'graphql',
  graphqlMutation: {
    mutationName: 'CreateUser',
    query: 'mutation CreateUser($input: CreateUserInput!) { ... }',
    variableMapping: {
      name: 'name',      // formField → GraphQL variable
      email: 'email'
    }
  }
}
```

### Replay

Future submissions:
1. Map form fields to GraphQL variables
2. Construct GraphQL mutation request:
   ```json
   {
     "query": "mutation CreateUser(...)",
     "variables": {
       "name": "John Doe",
       "email": "john@example.com"
     }
   }
   ```
3. POST directly to GraphQL endpoint
4. No browser rendering needed!

## Example

### First Submission (Learning Mode)

**HTML Form:**
```html
<form action="/submit" method="POST">
  <input name="name" value="John Doe">
  <input name="email" value="john@example.com">
  <button type="submit">Create Account</button>
</form>
```

**Behind the scenes:**
```
Browser submits → Triggers JavaScript → Posts to /graphql

POST /graphql
{
  "query": "mutation CreateUser($name: String!, $email: String!) {
    createUser(input: { name: $name, email: $email }) {
      id
      name
      email
    }
  }",
  "variables": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**System learns:**
- GraphQL endpoint: `/graphql`
- Mutation: `CreateUser`
- Variable mapping: `name → name`, `email → email`

### Second Submission (Direct API)

**Same form, different values:**
```javascript
await learner.submitForm({
  url: 'https://example.com/signup',
  fields: {
    name: 'Jane Smith',
    email: 'jane@example.com'
  }
});
```

**System does:**
```
POST /graphql (directly, no browser!)
{
  "query": "mutation CreateUser(...)",
  "variables": {
    "name": "Jane Smith",
    "email": "jane@example.com"
  }
}

Duration: ~200ms (vs ~5s first time)
Speedup: 25x faster! 🚀
```

## Integration with Existing GraphQL Infrastructure

The system integrates with existing GraphQL capabilities:
- **GraphQL Introspection** (`src/core/graphql-introspection.ts`) - Schema discovery
- **ApiAnalyzer** - Now properly detects and scores GraphQL endpoints
- **FormSubmissionLearner** - Handles both REST and GraphQL patterns

## API Changes

### LearnedFormPattern Interface

Added optional fields:
```typescript
interface LearnedFormPattern {
  patternType?: 'rest' | 'graphql' | 'json-rpc';
  graphqlMutation?: {
    mutationName: string;
    query: string;
    variableMapping: Record<string, string>;
  };
  // ... other fields
}
```

### Network Monitoring

Enhanced to capture request bodies:
```typescript
// Now captures POST data for mutation analysis
const requestBody = request.postDataJSON();
(req as any).requestBody = requestBody;
```

## Coverage

### ✅ Supported

- GraphQL mutations via POST to `/graphql`, `/gql`, `/query`
- Variable mapping from form fields
- JSON response handling
- Standard authentication (Bearer, cookies)
- CSRF token handling

### ⚠️ Partial Support

- Complex nested input types (basic mapping only)
- Fragments (stored in query but not analyzed)
- Aliases (handled transparently)

### ❌ Not Yet Supported

- GraphQL subscriptions (WebSocket-based)
- File uploads via GraphQL (multipart requests)
- Batch mutations
- Custom scalars validation

## Benefits

1. **10-25x speedup** after first learning pass
2. **Automatic detection** - no configuration needed
3. **Leverages existing code** - integrates with GraphQL introspection
4. **Growing adoption** - GraphQL usage is increasing

## Testing

To test GraphQL form submission learning:

```typescript
// First submission (learns pattern)
const result1 = await formLearner.submitForm({
  url: 'https://api.example.com/create-user-form',
  fields: {
    name: 'Test User',
    email: 'test@example.com'
  }
}, page);

console.log(result1.learned); // true
console.log(result1.method);  // 'browser'

// Second submission (uses learned pattern)
const result2 = await formLearner.submitForm({
  url: 'https://api.example.com/create-user-form',
  fields: {
    name: 'Another User',
    email: 'another@example.com'
  }
}, page);

console.log(result2.learned); // false
console.log(result2.method);  // 'api' (GraphQL mutation!)
```

## Related

- **GAP-001**: Form Submission Learning (base feature)
- **GAP-002**: POST/PUT/DELETE Learning
- **GAP-015**: WebSocket Forms (for GraphQL subscriptions)
- **D-001**: GraphQL Introspection (existing capability)

## Future Enhancements

1. **Query Validation** - Use GraphQL introspection to validate variables
2. **Input Type Inference** - Better handling of complex nested inputs
3. **Subscription Support** - WebSocket-based GraphQL subscriptions (GAP-015)
4. **Batch Mutations** - Submit multiple mutations in one request
5. **Fragment Support** - Analyze and optimize fragment usage
