# Unbrowser Skill Templates

This document defines Claude skill templates for the Unbrowser MCP server. Skills are prompt templates that guide Claude to accomplish specific research and browsing tasks.

## Overview

### What Are Skills?

Skills are structured prompt templates that:
1. Define a clear objective for a type of task
2. Specify which MCP tools to use and how
3. Guide output format and quality standards
4. Handle common edge cases

### Available MCP Tools

Skills work with these 5 primary Unbrowser tools:

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `smart_browse` | Browse URL with learning | url, contentType, followPagination, maxChars |
| `batch_browse` | Browse multiple URLs | urls[], options |
| `execute_api_call` | Call discovered APIs | endpoint, method, params |
| `session_management` | Handle auth sessions | action, profile, credentials |
| `api_auth` | Configure API auth | domain, authType, credentials |

### Skill Structure

Each skill follows this template:

```yaml
name: Skill Name
description: One-line description
objective: What the skill accomplishes
inputs:
  - name: Input name
    type: Type (url, text, list)
    required: true/false
    description: What this input is for
workflow:
  - step: Step description
    tool: Tool to use
    parameters: Tool parameters
output_format: Expected output structure
error_handling: How to handle failures
```

---

## Skill 1: Research Product Information

**ID:** `research_product`

### Description
Research product information across multiple sources, extracting structured data like pricing, features, reviews, and availability.

### Objective
Given a product name or URL, gather comprehensive product information from multiple sources and present a unified comparison.

### Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| product | text | yes | Product name, model number, or URL |
| sources | list | no | Specific sites to check (default: auto-discover) |
| fields | list | no | Specific fields to extract (default: price, features, reviews) |

### Workflow

1. **Initial Browse**
   - Tool: `smart_browse`
   - If `product` is URL: Browse directly
   - If `product` is text: Search for product page
   - Extract: title, price, features, availability

2. **Multi-Source Comparison**
   - Tool: `batch_browse`
   - Browse additional retailer pages
   - Compare prices across sources
   - Note availability differences

3. **API Discovery (Optional)**
   - Tool: `smart_browse` with API discovery
   - Check for price APIs
   - Extract review data from APIs when available

### Output Format

```json
{
  "product": {
    "name": "Product Name",
    "model": "Model Number",
    "category": "Category"
  },
  "pricing": [
    {
      "source": "Site Name",
      "url": "https://...",
      "price": "$X.XX",
      "currency": "USD",
      "inStock": true,
      "shipping": "Free",
      "lastChecked": "ISO timestamp"
    }
  ],
  "features": ["Feature 1", "Feature 2"],
  "reviews": {
    "averageRating": 4.5,
    "totalReviews": 1234,
    "summary": "Brief review summary"
  },
  "recommendations": "Analysis and recommendations"
}
```

### Error Handling

- If product not found: Suggest alternative search terms
- If price unavailable: Note as "Price on request" with contact info
- If site blocks access: Use session_management for authenticated access

---

## Skill 2: Monitor Website Changes

**ID:** `monitor_changes`

### Description
Track a URL for content changes and provide detailed diff summaries when changes are detected.

### Objective
Monitor one or more URLs for changes, comparing current content to previous versions and highlighting what changed.

### Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| urls | list | yes | URL(s) to monitor |
| sections | list | no | Specific sections to watch (CSS selectors) |
| ignorePatterns | list | no | Patterns to ignore (timestamps, ads) |

### Workflow

1. **Initial Capture**
   - Tool: `smart_browse` with `checkForChanges: true`
   - Capture current content state
   - Store baseline for comparison

2. **Change Detection**
   - Tool: `smart_browse` with `checkForChanges: true`
   - Compare against stored baseline
   - Identify added, removed, modified content

3. **Diff Analysis**
   - Categorize changes by importance
   - Filter out noise (timestamps, session IDs)
   - Generate human-readable diff summary

### Output Format

```json
{
  "url": "https://...",
  "status": "changed|unchanged|error",
  "lastChecked": "ISO timestamp",
  "changes": {
    "summary": "Brief description of changes",
    "importance": "high|medium|low",
    "sections": [
      {
        "location": "Section name or selector",
        "type": "added|removed|modified",
        "before": "Previous content (if modified/removed)",
        "after": "New content (if added/modified)"
      }
    ]
  },
  "nextCheck": "Recommended next check time"
}
```

### Error Handling

- If page structure changed significantly: Note as "major restructure"
- If page returns error: Retry with exponential backoff, report if persistent
- If content is dynamic/personalized: Use session to get consistent view

---

## Skill 3: Scrape Product Catalog

**ID:** `scrape_catalog`

### Description
Systematically extract all items from a product catalog, handling pagination and rate limiting.

### Objective
Given a catalog or listing page, extract all products with consistent data fields, respecting site limits.

### Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| catalogUrl | url | yes | Starting catalog URL |
| fields | list | no | Fields to extract (default: name, price, url, image) |
| maxItems | number | no | Maximum items to extract (default: 100) |
| filters | object | no | Filter criteria (category, price range) |

### Workflow

1. **Catalog Analysis**
   - Tool: `smart_browse` with `contentType: 'table'`
   - Identify pagination pattern
   - Detect total items available
   - Find consistent product selectors

2. **Paginated Extraction**
   - Tool: `smart_browse` with `followPagination: true`, `maxPages: N`
   - Extract items page by page
   - Respect rate limits (built into MCP)

3. **API Discovery**
   - Tool: `smart_browse` with API discovery enabled
   - Check for catalog API (often faster/more complete)
   - Use `execute_api_call` if API found

4. **Data Normalization**
   - Clean and standardize extracted data
   - Validate required fields
   - Handle missing values

### Output Format

```json
{
  "catalog": {
    "source": "Site Name",
    "url": "https://...",
    "totalItems": 1234,
    "extractedItems": 100
  },
  "items": [
    {
      "id": "unique-id",
      "name": "Product Name",
      "price": "$X.XX",
      "url": "https://...",
      "image": "https://...",
      "category": "Category",
      "inStock": true,
      "customFields": {}
    }
  ],
  "pagination": {
    "totalPages": 50,
    "pagesProcessed": 10,
    "hasMore": true
  },
  "apiDiscovered": {
    "available": true,
    "endpoint": "/api/products",
    "recommendation": "Use API for faster extraction"
  }
}
```

### Error Handling

- If blocked: Use session_management, suggest user authentication
- If rate limited: Respect backoff, report partial results
- If structure varies: Attempt flexible extraction, flag inconsistencies

---

## Skill 4: Discover APIs

**ID:** `discover_apis`

### Description
Explore a website to discover available APIs, document their patterns, and test accessibility.

### Objective
Given a website, discover all available API endpoints, understand their authentication requirements, and document usage patterns.

### Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| domain | url | yes | Website domain to explore |
| focusAreas | list | no | Specific functionality to focus on (search, products, users) |
| testApis | boolean | no | Whether to test discovered APIs (default: true) |

### Workflow

1. **Initial Exploration**
   - Tool: `smart_browse` with `includeNetwork: true`
   - Browse main pages
   - Capture network requests
   - Identify API calls

2. **Documentation Discovery**
   - Tool: `smart_browse`
   - Check common API doc paths: /docs, /api, /developers, /swagger
   - Look for OpenAPI/GraphQL schemas
   - Parse developer documentation

3. **Pattern Analysis**
   - Analyze discovered endpoints
   - Identify authentication patterns
   - Group by functionality
   - Detect REST/GraphQL/other

4. **API Testing**
   - Tool: `execute_api_call`
   - Test public endpoints
   - Verify response formats
   - Document rate limits

5. **Auth Discovery**
   - Tool: `api_auth`
   - Identify auth requirements
   - Document OAuth flows if applicable
   - Note API key requirements

### Output Format

```json
{
  "domain": "example.com",
  "apis": {
    "public": [
      {
        "endpoint": "/api/v1/products",
        "method": "GET",
        "description": "List products",
        "parameters": ["page", "limit", "category"],
        "responseFormat": "JSON",
        "rateLimit": "100 req/min",
        "tested": true,
        "working": true
      }
    ],
    "authenticated": [
      {
        "endpoint": "/api/v1/user",
        "method": "GET",
        "authType": "Bearer token",
        "description": "Get user profile"
      }
    ],
    "graphql": {
      "endpoint": "/graphql",
      "schemaAvailable": true,
      "introspectionEnabled": true
    }
  },
  "documentation": {
    "available": true,
    "url": "https://example.com/developers",
    "format": "OpenAPI 3.0"
  },
  "recommendations": [
    "Use /api/v1/products for catalog data",
    "GraphQL introspection available - use for complex queries"
  ]
}
```

### Error Handling

- If no APIs found: Note site may be server-rendered, suggest content extraction
- If APIs require auth: Document auth flow, provide setup guidance
- If rate limited during testing: Note limit, continue with remaining endpoints

---

## Skill 5: Compare Information Sources

**ID:** `compare_sources`

### Description
Research a topic across multiple sources, cross-reference facts, and identify discrepancies.

### Objective
Given a research topic, gather information from multiple authoritative sources and provide a synthesized comparison highlighting agreements and conflicts.

### Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | text | yes | Topic to research |
| sources | list | no | Specific sources to check (default: auto-discover) |
| factTypes | list | no | Types of facts to extract (dates, numbers, claims) |

### Workflow

1. **Source Discovery**
   - Tool: `batch_browse`
   - Search for topic across multiple domains
   - Identify authoritative sources
   - Gather initial content

2. **Fact Extraction**
   - Tool: `smart_browse` for each source
   - Extract specific claims/facts
   - Note source attribution
   - Capture publication dates

3. **Cross-Reference**
   - Compare facts across sources
   - Identify agreements and conflicts
   - Weight by source authority
   - Note citation chains

4. **Synthesis**
   - Merge consistent facts
   - Flag discrepancies with sources
   - Provide confidence levels
   - Recommend authoritative answer

### Output Format

```json
{
  "topic": "Research topic",
  "sources": [
    {
      "name": "Source Name",
      "url": "https://...",
      "authority": "high|medium|low",
      "lastUpdated": "ISO timestamp"
    }
  ],
  "facts": [
    {
      "claim": "Specific fact or claim",
      "category": "date|number|claim|definition",
      "consensus": {
        "status": "agreed|disputed|uncertain",
        "agreeSources": ["Source A", "Source B"],
        "disputeSources": ["Source C"],
        "values": {
          "Source A": "value1",
          "Source C": "value2"
        }
      },
      "confidence": 0.85,
      "recommendation": "Most likely correct value with reasoning"
    }
  ],
  "summary": "Overall synthesis of findings",
  "unresolvedDiscrepancies": [
    {
      "claim": "Disputed claim",
      "reason": "Why sources disagree",
      "recommendation": "How to resolve"
    }
  ]
}
```

### Error Handling

- If sources disagree: Present both with authority weighting
- If source unavailable: Note and continue with others
- If topic too broad: Suggest narrowing or breaking into subtopics

---

## Usage Guidelines

### When to Use Each Skill

| Scenario | Recommended Skill |
|----------|-------------------|
| "What's the best price for iPhone 15?" | Research Product Information |
| "Alert me when this page changes" | Monitor Website Changes |
| "Get all products from this store" | Scrape Product Catalog |
| "What APIs does this site have?" | Discover APIs |
| "Research this topic and verify facts" | Compare Information Sources |

### Combining Skills

Skills can be combined for complex workflows:

1. **Price Monitoring Pipeline**
   - Use "Research Product Information" for initial data
   - Use "Monitor Website Changes" on price pages
   - Use "Discover APIs" to find price update APIs

2. **Competitive Intelligence**
   - Use "Scrape Product Catalog" on competitor sites
   - Use "Compare Information Sources" to analyze positioning
   - Use "Monitor Website Changes" for ongoing tracking

3. **API-First Extraction**
   - Use "Discover APIs" first
   - Use APIs directly if available (faster, more reliable)
   - Fall back to "Scrape Product Catalog" if no API

### Best Practices

1. **Start Simple**: Use the most focused skill first
2. **Use APIs When Available**: API calls are faster and more reliable
3. **Respect Rate Limits**: Built into MCP, but be patient with large catalogs
4. **Verify Results**: Cross-check critical data with multiple sources
5. **Handle Auth Carefully**: Use session_management for authenticated access

---

## Implementation Notes

### Skill File Format

Skills are stored as YAML files in `skills/` directory:

```
skills/
  research-product.yaml
  monitor-changes.yaml
  scrape-catalog.yaml
  discover-apis.yaml
  compare-sources.yaml
```

### Claude Desktop Integration

To use skills in Claude Desktop:

1. Install the Unbrowser MCP server
2. Skills are available as slash commands: `/research-product`, `/monitor-changes`, etc.
3. Or describe your task naturally - Claude will select appropriate skill

### Metrics and Analytics

Track per-skill:
- Invocation count
- Success rate
- Common modifications
- User satisfaction

This data informs skill refinement and new skill development.
