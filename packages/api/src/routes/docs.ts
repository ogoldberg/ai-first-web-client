/**
 * API Documentation Routes
 *
 * Serves interactive API documentation via Swagger UI
 * and the OpenAPI specification.
 */

import { Hono } from 'hono';

const docs = new Hono();

// OpenAPI specification (embedded for simplicity)
const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Unbrowser API',
    description: `Intelligent web browsing API for AI agents. Unbrowser learns from browsing patterns,
discovers API endpoints automatically, and progressively optimizes to bypass browser
rendering entirely.

## Authentication

All API requests (except \`/health\` and \`/docs\`) require authentication via Bearer token:

\`\`\`
Authorization: Bearer ub_live_xxxxx
\`\`\`

API keys are prefixed with:
- \`ub_live_\` - Production keys
- \`ub_test_\` - Test/sandbox keys

## Rate Limits

Rate limits vary by plan:
- **Free**: 100 requests/day
- **Starter**: 1,000 requests/day
- **Team**: 10,000 requests/day
- **Enterprise**: Custom limits

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`: Maximum requests per day
- \`X-RateLimit-Remaining\`: Remaining requests
- \`X-RateLimit-Reset\`: Unix timestamp when limit resets

## Tiered Rendering

Unbrowser uses a tiered approach to minimize latency and cost:

1. **Intelligence Tier** (~50-200ms): Framework extraction, cached patterns
2. **Lightweight Tier** (~200-500ms): linkedom rendering, simple JS
3. **Playwright Tier** (~2-5s): Full browser rendering

Use \`maxCostTier\` and \`maxLatencyMs\` to control tier selection.`,
    version: '1.0.0',
    contact: {
      name: 'Unbrowser Support',
      url: 'https://unbrowser.ai/support',
      email: 'support@unbrowser.ai',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'https://api.unbrowser.ai',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3001',
      description: 'Local development',
    },
  ],
  tags: [
    { name: 'Browse', description: 'Web browsing and content extraction' },
    { name: 'Batch', description: 'Batch browsing operations' },
    { name: 'Intelligence', description: 'Domain intelligence and learned patterns' },
    { name: 'Workflows', description: 'Workflow recording and replay' },
    { name: 'Usage', description: 'Usage statistics' },
    { name: 'Billing', description: 'Billing and subscription management' },
    { name: 'Health', description: 'API health and status' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Check API health status. No authentication required.',
        operationId: 'getHealth',
        security: [],
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
                example: {
                  status: 'healthy',
                  version: '0.1.0',
                  uptime: 86400,
                },
              },
            },
          },
        },
      },
    },
    '/v1/browse': {
      post: {
        tags: ['Browse'],
        summary: 'Browse a URL',
        description: `Browse a URL and extract content with intelligent learning.

The API automatically:
- Uses learned selectors for reliable extraction
- Falls back through selector chains if primary fails
- Validates responses against learned patterns
- Learns from successes and failures
- Applies cross-domain patterns
- Handles cookie banners and popups

**SSE Support**: Set \`Accept: text/event-stream\` header to receive progress updates via Server-Sent Events.`,
        operationId: 'browse',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BrowseRequest' },
              examples: {
                simple: {
                  summary: 'Simple browse',
                  value: { url: 'https://example.com' },
                },
                withOptions: {
                  summary: 'With options',
                  value: {
                    url: 'https://example.com/products',
                    options: {
                      contentType: 'markdown',
                      maxChars: 10000,
                      includeTables: true,
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Successfully browsed URL',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BrowseResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/fetch': {
      post: {
        tags: ['Browse'],
        summary: 'Fast content fetch',
        description:
          'Optimized fetch using tiered rendering. Starts with the fastest tier and only escalates if content extraction fails.',
        operationId: 'fetch',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BrowseRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Successfully fetched URL',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BrowseResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/batch': {
      post: {
        tags: ['Batch'],
        summary: 'Batch browse multiple URLs',
        description: `Browse multiple URLs in parallel. Results are returned when all URLs have been processed.

**Limits**:
- Maximum 10 URLs per request (Free/Starter)
- Maximum 50 URLs per request (Team/Enterprise)`,
        operationId: 'batchBrowse',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BatchRequest' },
              example: {
                urls: [
                  'https://example.com/page1',
                  'https://example.com/page2',
                  'https://example.com/page3',
                ],
                options: { contentType: 'markdown', maxChars: 5000 },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Batch results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BatchResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/v1/domains/{domain}/intelligence': {
      get: {
        tags: ['Intelligence'],
        summary: 'Get domain intelligence',
        description: `Get learned patterns and intelligence for a domain.

Returns information about:
- Known selector patterns
- Pagination strategies
- Validation rules
- Success rates
- Recommended wait strategies`,
        operationId: 'getDomainIntelligence',
        parameters: [
          {
            name: 'domain',
            in: 'path',
            required: true,
            description: 'Domain name (e.g., example.com)',
            schema: { type: 'string', example: 'example.com' },
          },
        ],
        responses: {
          '200': {
            description: 'Domain intelligence',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DomainIntelligenceResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/usage': {
      get: {
        tags: ['Usage'],
        summary: 'Get usage statistics',
        description: `Get usage statistics for the current billing period.

Returns:
- Total requests made
- Requests broken down by tier
- Daily limits and remaining quota`,
        operationId: 'getUsage',
        responses: {
          '200': {
            description: 'Usage statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UsageResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/workflows': {
      get: {
        tags: ['Workflows'],
        summary: 'List recorded workflows',
        description: 'List all recorded workflows for the authenticated tenant.',
        operationId: 'listWorkflows',
        responses: {
          '200': {
            description: 'List of workflows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        workflows: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Workflow' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/workflows/record/start': {
      post: {
        tags: ['Workflows'],
        summary: 'Start recording a workflow',
        description: 'Start recording browse operations as a replayable workflow.',
        operationId: 'startWorkflowRecording',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', description: 'Workflow name' },
                  description: { type: 'string', description: 'Workflow description' },
                },
              },
              example: {
                name: 'Product scraper',
                description: 'Scrapes product details from e-commerce sites',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Recording started',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        workflowId: { type: 'string' },
                        status: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/workflows/{id}/replay': {
      post: {
        tags: ['Workflows'],
        summary: 'Replay a recorded workflow',
        description: 'Replay a previously recorded workflow with optional parameter overrides.',
        operationId: 'replayWorkflow',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Workflow ID',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  parameters: {
                    type: 'object',
                    description: 'Parameter overrides for the workflow',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Workflow replay results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        results: { type: 'array', items: { type: 'object' } },
                        executionTime: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': {
            description: 'Workflow not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/billing/status': {
      get: {
        tags: ['Billing'],
        summary: 'Get billing system status',
        description: 'Check if billing is configured and available features.',
        operationId: 'getBillingStatus',
        security: [],
        responses: {
          '200': {
            description: 'Billing status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    configured: { type: 'boolean' },
                    features: {
                      type: 'object',
                      properties: {
                        meteredBilling: { type: 'boolean' },
                        subscriptions: { type: 'boolean' },
                        webhooks: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/billing/usage': {
      get: {
        tags: ['Billing'],
        summary: 'Get billing usage',
        description: 'Get usage data for the current billing period.',
        operationId: 'getBillingUsage',
        responses: {
          '200': {
            description: 'Billing usage data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        tenantId: { type: 'string' },
                        period: {
                          type: 'object',
                          properties: {
                            start: { type: 'string' },
                            end: { type: 'string' },
                          },
                        },
                        usage: {
                          type: 'object',
                          properties: {
                            units: { type: 'number' },
                            requests: { type: 'number' },
                          },
                        },
                        stripeConnected: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/billing/subscription': {
      get: {
        tags: ['Billing'],
        summary: 'Get subscription status',
        description: 'Get the current subscription status for the authenticated tenant.',
        operationId: 'getSubscription',
        responses: {
          '200': {
            description: 'Subscription status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        tenantId: { type: 'string' },
                        plan: { type: 'string' },
                        stripeConnected: { type: 'boolean' },
                        subscription: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            id: { type: 'string' },
                            status: { type: 'string' },
                            isActive: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key with `ub_live_` or `ub_test_` prefix',
      },
    },
    schemas: {
      BrowseRequest: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            description: 'URL to browse',
            example: 'https://example.com',
          },
          options: { $ref: '#/components/schemas/BrowseOptions' },
          session: { $ref: '#/components/schemas/SessionData' },
        },
      },
      BrowseOptions: {
        type: 'object',
        properties: {
          contentType: {
            type: 'string',
            enum: ['markdown', 'text', 'html'],
            default: 'markdown',
            description: 'Content format to return',
          },
          waitForSelector: {
            type: 'string',
            description: 'CSS selector to wait for before extraction',
            example: '.main-content',
          },
          scrollToLoad: {
            type: 'boolean',
            default: false,
            description: 'Scroll page to trigger lazy loading',
          },
          maxChars: {
            type: 'integer',
            minimum: 100,
            maximum: 100000,
            description: 'Maximum characters to return',
            example: 10000,
          },
          includeTables: {
            type: 'boolean',
            default: true,
            description: 'Include extracted tables in response',
          },
          maxLatencyMs: {
            type: 'integer',
            minimum: 100,
            maximum: 30000,
            description: 'Maximum acceptable latency (skips slower tiers)',
            example: 2000,
          },
          maxCostTier: {
            type: 'string',
            enum: ['intelligence', 'lightweight', 'playwright'],
            description: 'Maximum tier to use (limits cost/latency)',
            example: 'lightweight',
          },
        },
      },
      SessionData: {
        type: 'object',
        description: 'Session data for authenticated requests',
        properties: {
          cookies: {
            type: 'array',
            items: { $ref: '#/components/schemas/Cookie' },
          },
          localStorage: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'LocalStorage values to set',
          },
        },
      },
      Cookie: {
        type: 'object',
        required: ['name', 'value'],
        properties: {
          name: { type: 'string', example: 'session_id' },
          value: { type: 'string', example: 'abc123' },
          domain: { type: 'string', example: 'example.com' },
          path: { type: 'string', default: '/', example: '/' },
        },
      },
      BrowseResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: '#/components/schemas/BrowseResult' },
        },
      },
      BrowseResult: {
        type: 'object',
        required: ['url', 'finalUrl', 'title', 'content', 'metadata'],
        properties: {
          url: { type: 'string', format: 'uri', description: 'Original requested URL' },
          finalUrl: { type: 'string', format: 'uri', description: 'Final URL after redirects' },
          title: { type: 'string', description: 'Page title', example: 'Example Domain' },
          content: {
            type: 'object',
            required: ['markdown', 'text'],
            properties: {
              markdown: { type: 'string', description: 'Content as Markdown' },
              text: { type: 'string', description: 'Content as plain text' },
              html: { type: 'string', description: 'Raw HTML (if requested)' },
            },
          },
          tables: {
            type: 'array',
            description: 'Extracted tables',
            items: {
              type: 'object',
              properties: {
                headers: { type: 'array', items: { type: 'string' } },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
          metadata: {
            type: 'object',
            required: ['loadTime', 'tier', 'tiersAttempted'],
            properties: {
              loadTime: { type: 'integer', description: 'Total load time in milliseconds', example: 450 },
              tier: { type: 'string', description: 'Tier used for final extraction', example: 'lightweight' },
              tiersAttempted: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tiers attempted in order',
                example: ['intelligence', 'lightweight'],
              },
            },
          },
        },
      },
      BatchRequest: {
        type: 'object',
        required: ['urls'],
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
            minItems: 1,
            maxItems: 50,
            description: 'URLs to browse',
          },
          options: { $ref: '#/components/schemas/BrowseOptions' },
          session: { $ref: '#/components/schemas/SessionData' },
        },
      },
      BatchResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['results', 'totalTime'],
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['url', 'success'],
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/BrowseResult' },
                    error: {
                      type: 'object',
                      properties: {
                        code: { type: 'string' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
              totalTime: { type: 'integer', description: 'Total processing time in milliseconds' },
            },
          },
        },
      },
      DomainIntelligenceResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['domain'],
            properties: {
              domain: { type: 'string', example: 'example.com' },
              knownPatterns: { type: 'integer', description: 'Number of learned patterns', example: 12 },
              selectorChains: { type: 'integer', description: 'Number of selector chains', example: 5 },
              successRate: {
                type: 'number',
                format: 'float',
                minimum: 0,
                maximum: 1,
                description: 'Success rate (0-1)',
                example: 0.95,
              },
            },
          },
        },
      },
      UsageResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['period', 'requests', 'limits'],
            properties: {
              period: {
                type: 'object',
                properties: {
                  start: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00Z' },
                  end: { type: 'string', format: 'date-time', example: '2024-01-31T23:59:59Z' },
                },
              },
              requests: {
                type: 'object',
                properties: {
                  total: { type: 'integer', example: 5432 },
                  byTier: {
                    type: 'object',
                    additionalProperties: { type: 'integer' },
                    example: { intelligence: 3500, lightweight: 1500, playwright: 432 },
                  },
                },
              },
              limits: {
                type: 'object',
                properties: {
                  daily: { type: 'integer', example: 10000 },
                  remaining: { type: 'integer', example: 4568 },
                },
              },
            },
          },
        },
      },
      Workflow: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          steps: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      HealthResponse: {
        type: 'object',
        required: ['status', 'version'],
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'], example: 'healthy' },
          version: { type: 'string', example: '0.1.0' },
          uptime: { type: 'integer', description: 'Uptime in seconds', example: 86400 },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', description: 'Error code', example: 'INVALID_URL' },
              message: { type: 'string', description: 'Human-readable error message', example: 'The provided URL is not valid' },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, error: { code: 'INVALID_REQUEST', message: 'Request body is invalid' } },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' } },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded',
        headers: {
          'X-RateLimit-Limit': { schema: { type: 'integer' }, description: 'Maximum requests per day' },
          'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Remaining requests' },
          'X-RateLimit-Reset': { schema: { type: 'integer' }, description: 'Unix timestamp when limit resets' },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, error: { code: 'RATE_LIMITED', message: 'Daily request limit exceeded' } },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

/**
 * GET /docs/openapi.json
 * Returns the OpenAPI specification as JSON
 */
docs.get('/openapi.json', (c) => {
  return c.json(openApiSpec);
});

/**
 * GET /docs
 * Serves the Swagger UI HTML page
 */
docs.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unbrowser API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
    .swagger-ui .topbar {
      display: none;
    }
    .swagger-ui .info {
      margin: 30px 0;
    }
    .swagger-ui .info .title {
      font-size: 2.5em;
    }
    /* Custom header */
    .custom-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 1.5em;
      font-weight: 600;
    }
    .custom-header a {
      color: white;
      text-decoration: none;
      margin-left: 20px;
      opacity: 0.9;
    }
    .custom-header a:hover {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>Unbrowser API</h1>
    <div>
      <a href="https://unbrowser.ai">Home</a>
      <a href="https://unbrowser.ai/docs/getting-started">Getting Started</a>
      <a href="https://github.com/anthropics/unbrowser">GitHub</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list",
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
        persistAuthorization: true
      });
    };
  </script>
</body>
</html>`;
  return c.html(html);
});

/**
 * GET /docs/getting-started
 * Returns a getting started guide in HTML format
 */
docs.get('/getting-started', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Getting Started - Unbrowser API</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
      background: #fafafa;
    }
    h1 {
      color: #667eea;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    h2 {
      color: #444;
      margin-top: 40px;
    }
    h3 {
      color: #555;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.9em;
    }
    pre {
      background: #2d3748;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.9em;
      line-height: 1.5;
    }
    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    .note {
      background: #e6f3ff;
      border-left: 4px solid #667eea;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #f8f9fa;
      font-weight: 600;
    }
    a {
      color: #667eea;
    }
    .nav {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: -40px -20px 40px -20px;
      padding: 20px 40px;
    }
    .nav a {
      color: white;
      text-decoration: none;
      margin-right: 20px;
    }
    .nav a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/docs">API Reference</a>
    <a href="/docs/getting-started">Getting Started</a>
    <a href="https://unbrowser.ai">Home</a>
  </div>

  <h1>Getting Started with Unbrowser API</h1>

  <p>Unbrowser is an intelligent web browsing API that learns from browsing patterns and progressively optimizes to deliver faster, more reliable content extraction.</p>

  <h2>1. Get Your API Key</h2>

  <p>Sign up at <a href="https://unbrowser.ai">unbrowser.ai</a> to get your API key. Keys are prefixed with:</p>
  <ul>
    <li><code>ub_live_</code> - Production keys</li>
    <li><code>ub_test_</code> - Test/sandbox keys</li>
  </ul>

  <h2>2. Make Your First Request</h2>

  <h3>Using curl</h3>
  <pre><code>curl -X POST https://api.unbrowser.ai/v1/browse \\
  -H "Authorization: Bearer ub_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com"
  }'</code></pre>

  <h3>Using Node.js</h3>
  <pre><code>import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY
});

const result = await client.browse('https://example.com');

console.log(result.content.markdown);
console.log('Loaded in:', result.metadata.loadTime, 'ms');
console.log('Tier used:', result.metadata.tier);</code></pre>

  <h3>Using Python</h3>
  <pre><code>import requests

response = requests.post(
    'https://api.unbrowser.ai/v1/browse',
    headers={
        'Authorization': 'Bearer ub_live_your_api_key_here',
        'Content-Type': 'application/json'
    },
    json={
        'url': 'https://example.com'
    }
)

data = response.json()
print(data['data']['content']['markdown'])</code></pre>

  <h2>3. Understanding the Response</h2>

  <pre><code>{
  "success": true,
  "data": {
    "url": "https://example.com",
    "finalUrl": "https://example.com/",
    "title": "Example Domain",
    "content": {
      "markdown": "# Example Domain\\n\\nThis domain is for use in examples...",
      "text": "Example Domain\\n\\nThis domain is for use in examples..."
    },
    "metadata": {
      "loadTime": 145,
      "tier": "intelligence",
      "tiersAttempted": ["intelligence"]
    }
  }
}</code></pre>

  <div class="note">
    <strong>Tip:</strong> The <code>tier</code> field shows which rendering tier was used.
    Lower tiers (intelligence, lightweight) are faster and cheaper.
    The system automatically escalates to higher tiers when needed.
  </div>

  <h2>4. Tiered Rendering</h2>

  <p>Unbrowser uses a tiered approach to minimize latency and cost:</p>

  <table>
    <tr>
      <th>Tier</th>
      <th>Latency</th>
      <th>Best For</th>
    </tr>
    <tr>
      <td><strong>Intelligence</strong></td>
      <td>~50-200ms</td>
      <td>Static pages, cached patterns, API responses</td>
    </tr>
    <tr>
      <td><strong>Lightweight</strong></td>
      <td>~200-500ms</td>
      <td>Simple JavaScript, SSR frameworks</td>
    </tr>
    <tr>
      <td><strong>Playwright</strong></td>
      <td>~2-5s</td>
      <td>Complex SPAs, heavy JavaScript, authentication</td>
    </tr>
  </table>

  <p>You can control which tiers are used:</p>

  <pre><code>// Limit to fast tiers only (skip Playwright)
const result = await client.browse('https://example.com', {
  maxCostTier: 'lightweight',
  maxLatencyMs: 1000
});</code></pre>

  <h2>5. Batch Requests</h2>

  <p>Browse multiple URLs in parallel:</p>

  <pre><code>const results = await client.batch([
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3'
], {
  contentType: 'markdown',
  maxChars: 5000
});

for (const result of results) {
  console.log(result.url, result.success ? 'OK' : 'Failed');
}</code></pre>

  <h2>6. Rate Limits</h2>

  <table>
    <tr>
      <th>Plan</th>
      <th>Daily Limit</th>
      <th>Batch Size</th>
    </tr>
    <tr>
      <td>Free</td>
      <td>100 requests</td>
      <td>10 URLs</td>
    </tr>
    <tr>
      <td>Starter</td>
      <td>1,000 requests</td>
      <td>10 URLs</td>
    </tr>
    <tr>
      <td>Team</td>
      <td>10,000 requests</td>
      <td>50 URLs</td>
    </tr>
    <tr>
      <td>Enterprise</td>
      <td>Custom</td>
      <td>Custom</td>
    </tr>
  </table>

  <p>Rate limit headers are included in every response:</p>
  <ul>
    <li><code>X-RateLimit-Limit</code> - Your daily limit</li>
    <li><code>X-RateLimit-Remaining</code> - Requests remaining</li>
    <li><code>X-RateLimit-Reset</code> - When the limit resets (Unix timestamp)</li>
  </ul>

  <h2>7. Error Handling</h2>

  <pre><code>try {
  const result = await client.browse('https://example.com');
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    console.log('Rate limited. Retry after:', error.retryAfter);
  } else if (error.code === 'UNAUTHORIZED') {
    console.log('Invalid API key');
  } else {
    console.log('Error:', error.message);
  }
}</code></pre>

  <div class="warning">
    <strong>Common Errors:</strong>
    <ul style="margin: 10px 0 0 0;">
      <li><code>UNAUTHORIZED</code> - Invalid or missing API key</li>
      <li><code>RATE_LIMITED</code> - Daily request limit exceeded</li>
      <li><code>INVALID_URL</code> - URL is malformed or blocked</li>
      <li><code>FETCH_FAILED</code> - Could not fetch the URL</li>
    </ul>
  </div>

  <h2>Next Steps</h2>

  <ul>
    <li><a href="/docs">Full API Reference</a> - Complete endpoint documentation</li>
    <li><a href="https://unbrowser.ai/docs/workflows">Workflow Recording</a> - Record and replay browse operations</li>
    <li><a href="https://unbrowser.ai/docs/sessions">Session Management</a> - Handle authenticated browsing</li>
    <li><a href="https://unbrowser.ai/pricing">Pricing</a> - Compare plans and features</li>
  </ul>

</body>
</html>`;
  return c.html(html);
});

export { docs };
