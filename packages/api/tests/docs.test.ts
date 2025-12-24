/**
 * API Documentation Routes Tests
 *
 * Tests for the interactive API documentation endpoints.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { docs } from '../src/routes/docs.js';

describe('Documentation Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/docs', docs);
  });

  describe('GET /docs', () => {
    it('should return Swagger UI HTML', async () => {
      const res = await app.request('/docs');

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('swagger-ui');
      expect(html).toContain('Unbrowser API');
    });

    it('should include SwaggerUIBundle script', async () => {
      const res = await app.request('/docs');
      const html = await res.text();

      expect(html).toContain('swagger-ui-bundle.js');
      expect(html).toContain('swagger-ui.css');
    });

    it('should point to the OpenAPI spec', async () => {
      const res = await app.request('/docs');
      const html = await res.text();

      expect(html).toContain('/docs/openapi.json');
    });
  });

  describe('GET /docs/openapi.json', () => {
    it('should return OpenAPI specification', async () => {
      const res = await app.request('/docs/openapi.json');

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('application/json');

      const spec = await res.json();
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.title).toBe('Unbrowser API');
      expect(spec.info.version).toBe('1.0.0');
    });

    it('should include all main endpoints', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      expect(spec.paths).toHaveProperty('/health');
      expect(spec.paths).toHaveProperty('/v1/browse');
      expect(spec.paths).toHaveProperty('/v1/fetch');
      expect(spec.paths).toHaveProperty('/v1/batch');
      expect(spec.paths).toHaveProperty('/v1/usage');
      expect(spec.paths).toHaveProperty('/v1/workflows');
      expect(spec.paths).toHaveProperty('/v1/billing/status');
    });

    it('should include security scheme', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');
      expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });

    it('should include all schemas', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      expect(spec.components.schemas).toHaveProperty('BrowseRequest');
      expect(spec.components.schemas).toHaveProperty('BrowseResponse');
      expect(spec.components.schemas).toHaveProperty('BrowseOptions');
      expect(spec.components.schemas).toHaveProperty('BatchRequest');
      expect(spec.components.schemas).toHaveProperty('BatchResponse');
      expect(spec.components.schemas).toHaveProperty('ErrorResponse');
      expect(spec.components.schemas).toHaveProperty('HealthResponse');
    });

    it('should include servers', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      expect(spec.servers).toHaveLength(2);
      expect(spec.servers[0].url).toBe('https://api.unbrowser.ai');
      expect(spec.servers[1].url).toBe('http://localhost:3001');
    });

    it('should include tags', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      const tagNames = spec.tags.map((t: { name: string }) => t.name);
      expect(tagNames).toContain('Browse');
      expect(tagNames).toContain('Batch');
      expect(tagNames).toContain('Health');
      expect(tagNames).toContain('Billing');
      expect(tagNames).toContain('Workflows');
    });
  });

  describe('GET /docs/getting-started', () => {
    it('should return getting started guide HTML', async () => {
      const res = await app.request('/docs/getting-started');

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Getting Started');
    });

    it('should include authentication section', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Get Your API Key');
      expect(html).toContain('ub_live_');
      expect(html).toContain('Authorization: Bearer');
    });

    it('should include curl example', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('curl');
      expect(html).toContain('POST');
      expect(html).toContain('/v1/browse');
    });

    it('should include Node.js example', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Node.js');
      expect(html).toContain('@unbrowser/core');
      expect(html).toContain('createUnbrowser');
    });

    it('should include Python example', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Python');
      expect(html).toContain('requests');
      expect(html).toContain('requests.post');
    });

    it('should include tiered rendering section', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Tiered Rendering');
      expect(html).toContain('Intelligence');
      expect(html).toContain('Lightweight');
      expect(html).toContain('Playwright');
    });

    it('should include rate limits section', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Rate Limits');
      expect(html).toContain('X-RateLimit-Limit');
      expect(html).toContain('X-RateLimit-Remaining');
    });

    it('should include error handling section', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Error Handling');
      expect(html).toContain('RATE_LIMITED');
      expect(html).toContain('UNAUTHORIZED');
    });

    it('should include batch requests section', async () => {
      const res = await app.request('/docs/getting-started');
      const html = await res.text();

      expect(html).toContain('Batch Requests');
      expect(html).toContain('client.batch');
    });
  });

  describe('OpenAPI Spec Content Validation', () => {
    it('should have valid browse endpoint schema', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      const browseEndpoint = spec.paths['/v1/browse'];
      expect(browseEndpoint).toHaveProperty('post');
      expect(browseEndpoint.post.operationId).toBe('browse');
      expect(browseEndpoint.post.tags).toContain('Browse');
      expect(browseEndpoint.post.requestBody.required).toBe(true);
    });

    it('should have valid batch endpoint schema', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      const batchEndpoint = spec.paths['/v1/batch'];
      expect(batchEndpoint).toHaveProperty('post');
      expect(batchEndpoint.post.operationId).toBe('batchBrowse');
      expect(batchEndpoint.post.tags).toContain('Batch');
    });

    it('should have valid health endpoint without security', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      const healthEndpoint = spec.paths['/health'];
      expect(healthEndpoint).toHaveProperty('get');
      expect(healthEndpoint.get.security).toEqual([]);
    });

    it('should have valid workflow endpoints', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      expect(spec.paths).toHaveProperty('/v1/workflows');
      expect(spec.paths).toHaveProperty('/v1/workflows/record/start');
      expect(spec.paths).toHaveProperty('/v1/workflows/{id}/replay');
    });

    it('should have valid billing endpoints', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      expect(spec.paths).toHaveProperty('/v1/billing/status');
      expect(spec.paths).toHaveProperty('/v1/billing/usage');
      expect(spec.paths).toHaveProperty('/v1/billing/subscription');
    });

    it('should define all referenced schemas', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      // Check that schemas referenced in the spec are actually defined
      const schemaNames = Object.keys(spec.components.schemas);
      expect(schemaNames).toContain('BrowseRequest');
      expect(schemaNames).toContain('BrowseResponse');
      expect(schemaNames).toContain('BrowseResult');
      expect(schemaNames).toContain('BrowseOptions');
      expect(schemaNames).toContain('SessionData');
      expect(schemaNames).toContain('Cookie');
      expect(schemaNames).toContain('BatchRequest');
      expect(schemaNames).toContain('BatchResponse');
      expect(schemaNames).toContain('DomainIntelligenceResponse');
      expect(schemaNames).toContain('UsageResponse');
      expect(schemaNames).toContain('Workflow');
      expect(schemaNames).toContain('HealthResponse');
      expect(schemaNames).toContain('ErrorResponse');
    });

    it('should define all referenced responses', async () => {
      const res = await app.request('/docs/openapi.json');
      const spec = await res.json();

      const responseNames = Object.keys(spec.components.responses);
      expect(responseNames).toContain('BadRequest');
      expect(responseNames).toContain('Unauthorized');
      expect(responseNames).toContain('RateLimited');
    });
  });
});
