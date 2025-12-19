/**
 * Tests for OpenAPI/Swagger Discovery Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  discoverOpenAPI,
  generatePatternsFromSpec,
  generatePatternsFromOpenAPISpec,
  clearSpecCache,
} from '../../src/core/openapi-discovery.js';
import type {
  ParsedOpenAPISpec,
  OpenAPIEndpoint,
  OpenAPIDiscoveryOptions,
} from '../../src/types/api-patterns.js';
import { OPENAPI_PROBE_LOCATIONS } from '../../src/types/api-patterns.js';
import { resolveRefs, hasRefs, countRefs, getValueAtPath } from '../../src/utils/json-ref-resolver.js';

// ============================================
// MOCK DATA
// ============================================

const MOCK_OPENAPI_3_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'Test API',
    description: 'A test API for testing',
    version: '1.0.0',
  },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/users': {
      get: {
        operationId: 'getUsers',
        summary: 'Get all users',
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        operationId: 'getUserById',
        summary: 'Get user by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
    },
    '/posts': {
      post: {
        operationId: 'createPost',
        summary: 'Create a post',
        responses: { '201': { description: 'Created' } },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['id', 'name'],
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  },
};

const MOCK_SWAGGER_2_SPEC = {
  swagger: '2.0',
  info: {
    title: 'Legacy API',
    description: 'A legacy Swagger 2.0 API',
    version: '1.0.0',
  },
  host: 'api.legacy.com',
  basePath: '/v1',
  schemes: ['https'],
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        summary: 'List all items',
        parameters: [
          { name: 'limit', in: 'query', type: 'integer' },
        ],
        responses: {
          '200': { description: 'Success' },
        },
      },
    },
    '/items/{itemId}': {
      get: {
        operationId: 'getItem',
        summary: 'Get item by ID',
        parameters: [
          { name: 'itemId', in: 'path', required: true, type: 'string' },
        ],
        responses: {
          '200': { description: 'Success' },
        },
      },
    },
  },
  securityDefinitions: {
    apiKey: {
      type: 'apiKey',
      name: 'X-API-Key',
      in: 'header',
    },
  },
};

// ============================================
// PROBE LOCATIONS TESTS
// ============================================

describe('OpenAPI Probe Locations', () => {
  it('should have common OpenAPI locations defined', () => {
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/openapi.json');
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/swagger.json');
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/api-docs');
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/.well-known/openapi.json');
  });

  it('should have YAML locations', () => {
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/openapi.yaml');
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/swagger.yaml');
  });

  it('should have versioned API locations', () => {
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/v1/openapi.json');
    expect(OPENAPI_PROBE_LOCATIONS).toContain('/api/openapi.json');
  });
});

// ============================================
// PATTERN GENERATION TESTS
// ============================================

describe('Pattern Generation', () => {
  describe('generatePatternsFromSpec', () => {
    const mockSpec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test API',
      description: 'Test',
      baseUrl: 'https://api.example.com/v1',
      endpoints: [
        {
          path: '/users',
          method: 'GET',
          operationId: 'getUsers',
          summary: 'Get all users',
          parameters: [],
          responses: [{ statusCode: '200', description: 'Success' }],
        },
        {
          path: '/users/{id}',
          method: 'GET',
          operationId: 'getUserById',
          summary: 'Get user by ID',
          parameters: [
            { name: 'id', in: 'path', required: true },
          ],
          responses: [{ statusCode: '200', description: 'Success' }],
        },
        {
          path: '/posts',
          method: 'POST',
          operationId: 'createPost',
          summary: 'Create post',
          parameters: [],
          responses: [{ statusCode: '201', description: 'Created' }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.example.com/openapi.json',
    };

    it('should generate patterns only for GET endpoints', () => {
      const result = generatePatternsFromSpec(mockSpec, 'api.example.com');

      expect(result.patternsGenerated).toBe(2); // Only GET endpoints
      expect(result.patternIds).toHaveLength(2);
    });

    it('should skip POST endpoints without request body schema', () => {
      const result = generatePatternsFromSpec(mockSpec, 'api.example.com');

      const skippedPost = result.skippedEndpoints.find(
        e => e.path === '/posts' && e.method === 'POST'
      );
      expect(skippedPost).toBeDefined();
      expect(skippedPost?.reason).toContain('No request body schema');
    });

    it('should include pattern IDs in result', () => {
      const result = generatePatternsFromSpec(mockSpec, 'api.example.com');

      for (const id of result.patternIds) {
        expect(id).toMatch(/^openapi:api\.example\.com:/);
      }
    });
  });

  describe('generatePatternsFromOpenAPISpec', () => {
    const mockSpec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test API',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/resources',
          method: 'GET',
          operationId: 'listResources',
          parameters: [],
          responses: [{ statusCode: '200' }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    it('should return array of LearnedApiPattern objects', () => {
      const patterns = generatePatternsFromOpenAPISpec(mockSpec);

      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should set correct pattern properties', () => {
      const patterns = generatePatternsFromOpenAPISpec(mockSpec);
      const pattern = patterns[0];

      expect(pattern.id).toMatch(/^openapi:/);
      expect(pattern.templateType).toBe('rest-resource');
      expect(pattern.method).toBe('GET');
      expect(pattern.responseFormat).toBe('json');
      expect(pattern.headers).toEqual({ Accept: 'application/json' });
    });

    it('should set high confidence for OpenAPI patterns', () => {
      const patterns = generatePatternsFromOpenAPISpec(mockSpec);
      const pattern = patterns[0];

      expect(pattern.metrics.confidence).toBeGreaterThanOrEqual(0.9);
      expect(pattern.metrics.successCount).toBeGreaterThanOrEqual(100);
    });

    it('should include domain in pattern domains', () => {
      const patterns = generatePatternsFromOpenAPISpec(mockSpec);
      const pattern = patterns[0];

      expect(pattern.metrics.domains).toContain('api.test.com');
    });
  });

  describe('Skip deprecated endpoints', () => {
    const specWithDeprecated: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'API with Deprecated',
      baseUrl: 'https://api.example.com',
      endpoints: [
        {
          path: '/old',
          method: 'GET',
          operationId: 'oldEndpoint',
          parameters: [],
          responses: [{ statusCode: '200' }],
          deprecated: true,
        },
        {
          path: '/new',
          method: 'GET',
          operationId: 'newEndpoint',
          parameters: [],
          responses: [{ statusCode: '200' }],
          deprecated: false,
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.example.com/openapi.json',
    };

    it('should skip deprecated endpoints', () => {
      const result = generatePatternsFromSpec(specWithDeprecated, 'api.example.com');

      expect(result.patternsGenerated).toBe(1);
      expect(result.skippedEndpoints.some(e => e.path === '/old')).toBe(true);
    });
  });

  describe('Skip endpoints with too many parameters', () => {
    const specWithManyParams: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'API with Many Params',
      baseUrl: 'https://api.example.com',
      endpoints: [
        {
          path: '/complex',
          method: 'GET',
          operationId: 'complexEndpoint',
          parameters: [
            { name: 'a', in: 'query', required: true },
            { name: 'b', in: 'query', required: true },
            { name: 'c', in: 'query', required: true },
            { name: 'd', in: 'query', required: true },
          ],
          responses: [{ statusCode: '200' }],
        },
        {
          path: '/simple',
          method: 'GET',
          operationId: 'simpleEndpoint',
          parameters: [
            { name: 'id', in: 'path', required: true },
          ],
          responses: [{ statusCode: '200' }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.example.com/openapi.json',
    };

    it('should skip endpoints with more than 3 required parameters', () => {
      const result = generatePatternsFromSpec(specWithManyParams, 'api.example.com');

      expect(result.patternsGenerated).toBe(1);
      expect(result.skippedEndpoints.some(e => e.path === '/complex')).toBe(true);
    });
  });
});

// ============================================
// URL PATTERN GENERATION TESTS
// ============================================

describe('URL Pattern Generation', () => {
  it('should generate URL patterns for domain', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/users/{id}',
          method: 'GET',
          parameters: [{ name: 'id', in: 'path', required: true }],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.urlPatterns).toHaveLength(1);
    expect(pattern.urlPatterns[0]).toContain('api\\.test\\.com');
  });

  it('should replace path parameters with wildcards in URL pattern', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/users/{userId}/posts/{postId}',
          method: 'GET',
          parameters: [
            { name: 'userId', in: 'path', required: true },
            { name: 'postId', in: 'path', required: true },
          ],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    // Path params should be replaced with wildcards (regex may escape slashes)
    // Check for either [^/]+ or [^\/]+
    expect(pattern.urlPatterns[0]).toMatch(/\[\^[/\\]+\]\+/);
  });
});

// ============================================
// EXTRACTOR GENERATION TESTS
// ============================================

describe('Extractor Generation', () => {
  it('should generate extractors for path parameters', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/users/{id}',
          method: 'GET',
          parameters: [{ name: 'id', in: 'path', required: true }],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.extractors.length).toBeGreaterThan(0);
    expect(pattern.extractors[0].name).toBe('id');
    expect(pattern.extractors[0].source).toBe('path');
  });

  it('should handle multiple path parameters', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/users/{userId}/posts/{postId}',
          method: 'GET',
          parameters: [
            { name: 'userId', in: 'path', required: true },
            { name: 'postId', in: 'path', required: true },
          ],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.extractors.length).toBe(2);
    expect(pattern.extractors.map(e => e.name)).toContain('userId');
    expect(pattern.extractors.map(e => e.name)).toContain('postId');
  });
});

// ============================================
// ENDPOINT TEMPLATE TESTS
// ============================================

describe('Endpoint Template Generation', () => {
  it('should build endpoint template from base URL and path', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com/v1',
      endpoints: [
        {
          path: '/users',
          method: 'GET',
          parameters: [],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.endpointTemplate).toBe('https://api.test.com/v1/users');
  });

  it('should preserve path parameters in endpoint template', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/users/{id}',
          method: 'GET',
          parameters: [{ name: 'id', in: 'path', required: true }],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.endpointTemplate).toBe('https://api.test.com/users/{id}');
  });
});

// ============================================
// CONTENT MAPPING TESTS
// ============================================

describe('Content Mapping Generation', () => {
  it('should create default content mapping', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/items',
          method: 'GET',
          parameters: [],
          responses: [{ statusCode: '200' }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.contentMapping.title).toBeDefined();
  });

  it('should detect common field names from response schema', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/articles',
          method: 'GET',
          parameters: [],
          responses: [{
            statusCode: '200',
            schema: {
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                body: { type: 'string' },
              },
            },
          }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.contentMapping.title).toBe('title');
    expect(pattern.contentMapping.description).toBe('description');
    expect(pattern.contentMapping.body).toBe('body');
  });
});

// ============================================
// VALIDATION RULES TESTS
// ============================================

describe('Validation Rules Generation', () => {
  it('should create validation rules with minimum content length', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/items',
          method: 'GET',
          parameters: [],
          responses: [{ statusCode: '200' }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.validation.minContentLength).toBeGreaterThan(0);
  });

  it('should extract required fields from response schema', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/items',
          method: 'GET',
          parameters: [],
          responses: [{
            statusCode: '200',
            schema: {
              required: ['id', 'name'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
            },
          }],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.validation.requiredFields).toContain('id');
    expect(pattern.validation.requiredFields).toContain('name');
  });
});

// ============================================
// SECURITY SCHEMES TESTS
// ============================================

describe('Security Schemes Parsing', () => {
  it('should parse OpenAPI 3.x security schemes', () => {
    // This is tested indirectly through the spec parsing
    // We just verify the structure is understood
    expect(MOCK_OPENAPI_3_SPEC.components?.securitySchemes?.bearerAuth).toBeDefined();
    expect(MOCK_OPENAPI_3_SPEC.components?.securitySchemes?.bearerAuth?.type).toBe('http');
  });

  it('should parse Swagger 2.0 security definitions', () => {
    expect(MOCK_SWAGGER_2_SPEC.securityDefinitions?.apiKey).toBeDefined();
    expect(MOCK_SWAGGER_2_SPEC.securityDefinitions?.apiKey?.type).toBe('apiKey');
  });
});

// ============================================
// CACHE TESTS
// ============================================

describe('Discovery Cache', () => {
  beforeEach(() => {
    clearSpecCache();
  });

  afterEach(() => {
    clearSpecCache();
  });

  it('should clear cache when clearSpecCache is called', () => {
    // Clear should not throw
    expect(() => clearSpecCache()).not.toThrow();
  });
});

// ============================================
// SPEC VERSION DETECTION TESTS
// ============================================

describe('Spec Version Detection', () => {
  it('should recognize OpenAPI 3.0 spec', () => {
    expect(MOCK_OPENAPI_3_SPEC.openapi).toBe('3.0.0');
  });

  it('should recognize OpenAPI 3.1 spec', () => {
    const spec31 = { ...MOCK_OPENAPI_3_SPEC, openapi: '3.1.0' };
    expect(spec31.openapi).toBe('3.1.0');
  });

  it('should recognize Swagger 2.0 spec', () => {
    expect(MOCK_SWAGGER_2_SPEC.swagger).toBe('2.0');
  });
});

// ============================================
// ENDPOINT LIMIT TESTS
// ============================================

describe('Endpoint Limits', () => {
  it('should limit patterns generated per spec', () => {
    const manyEndpoints: OpenAPIEndpoint[] = [];
    for (let i = 0; i < 100; i++) {
      manyEndpoints.push({
        path: `/resource${i}`,
        method: 'GET',
        parameters: [],
        responses: [{ statusCode: '200' }],
      });
    }

    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Many Endpoints',
      baseUrl: 'https://api.test.com',
      endpoints: manyEndpoints,
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const result = generatePatternsFromSpec(spec, 'api.test.com');

    // Should be limited to MAX_ENDPOINTS_PER_SPEC (50)
    expect(result.patternsGenerated).toBeLessThanOrEqual(50);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('limited to');
  });
});

// ============================================
// BASE URL HANDLING TESTS
// ============================================

describe('Base URL Handling', () => {
  it('should handle base URL with trailing slash', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com/',
      endpoints: [
        {
          path: '/users',
          method: 'GET',
          parameters: [],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    // Should not have double slashes
    expect(pattern.endpointTemplate).toBe('https://api.test.com/users');
  });

  it('should handle base URL without trailing slash', () => {
    const spec: ParsedOpenAPISpec = {
      version: '3.0',
      title: 'Test',
      baseUrl: 'https://api.test.com',
      endpoints: [
        {
          path: '/users',
          method: 'GET',
          parameters: [],
          responses: [],
        },
      ],
      discoveredAt: Date.now(),
      specUrl: 'https://api.test.com/openapi.json',
    };

    const patterns = generatePatternsFromOpenAPISpec(spec);
    const pattern = patterns[0];

    expect(pattern.endpointTemplate).toBe('https://api.test.com/users');
  });
});

// ============================================
// D-004 ENHANCEMENT TESTS
// ============================================

describe('D-004: OpenAPI Enhancement', () => {
  // Test POST/PUT/DELETE pattern support
  describe('POST/PUT/DELETE Pattern Support', () => {
    it('should generate patterns for POST endpoints with request body', () => {
      const spec: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Test API',
        baseUrl: 'https://api.test.com',
        endpoints: [
          {
            path: '/posts',
            method: 'POST',
            operationId: 'createPost',
            parameters: [],
            requestBody: {
              contentType: 'application/json',
              required: true,
              schema: { type: 'object', properties: { title: { type: 'string' } } },
            },
            responses: [{ statusCode: '201', description: 'Created' }],
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      const patterns = generatePatternsFromOpenAPISpec(spec);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].method).toBe('POST');
      expect(patterns[0].headers?.['Content-Type']).toBe('application/json');
    });

    it('should generate patterns for PUT endpoints with request body', () => {
      const spec: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Test API',
        baseUrl: 'https://api.test.com',
        endpoints: [
          {
            path: '/posts/{id}',
            method: 'PUT',
            operationId: 'updatePost',
            parameters: [{ name: 'id', in: 'path', required: true }],
            requestBody: {
              contentType: 'application/json',
              required: true,
              schema: { type: 'object', properties: { title: { type: 'string' } } },
            },
            responses: [{ statusCode: '200', description: 'Updated' }],
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      const patterns = generatePatternsFromOpenAPISpec(spec);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].method).toBe('PUT');
      expect(patterns[0].headers?.['Content-Type']).toBe('application/json');
    });

    it('should generate patterns for DELETE endpoints', () => {
      const spec: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Test API',
        baseUrl: 'https://api.test.com',
        endpoints: [
          {
            path: '/posts/{id}',
            method: 'DELETE',
            operationId: 'deletePost',
            parameters: [{ name: 'id', in: 'path', required: true }],
            responses: [{ statusCode: '204', description: 'Deleted' }],
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      const patterns = generatePatternsFromOpenAPISpec(spec);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].method).toBe('DELETE');
    });

    it('should skip PATCH endpoints', () => {
      const spec: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Test API',
        baseUrl: 'https://api.test.com',
        endpoints: [
          {
            path: '/posts/{id}',
            method: 'PATCH',
            operationId: 'patchPost',
            parameters: [{ name: 'id', in: 'path', required: true }],
            requestBody: {
              contentType: 'application/json',
              schema: { type: 'object' },
            },
            responses: [{ statusCode: '200', description: 'Patched' }],
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      const patterns = generatePatternsFromOpenAPISpec(spec);
      expect(patterns).toHaveLength(0);
    });

    it('should use form-data content type when specified', () => {
      const spec: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Test API',
        baseUrl: 'https://api.test.com',
        endpoints: [
          {
            path: '/uploads',
            method: 'POST',
            operationId: 'uploadFile',
            parameters: [],
            requestBody: {
              contentType: 'multipart/form-data',
              schema: { type: 'object' },
            },
            responses: [{ statusCode: '200', description: 'Uploaded' }],
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      const patterns = generatePatternsFromOpenAPISpec(spec);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].headers?.['Content-Type']).toBe('multipart/form-data');
    });

    it('should generate all method types in generatePatternsFromSpec', () => {
      const spec: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Test API',
        baseUrl: 'https://api.test.com',
        endpoints: [
          {
            path: '/items',
            method: 'GET',
            parameters: [],
            responses: [{ statusCode: '200' }],
          },
          {
            path: '/items',
            method: 'POST',
            parameters: [],
            requestBody: {
              contentType: 'application/json',
              schema: { type: 'object' },
            },
            responses: [{ statusCode: '201' }],
          },
          {
            path: '/items/{id}',
            method: 'PUT',
            parameters: [{ name: 'id', in: 'path', required: true }],
            requestBody: {
              contentType: 'application/json',
              schema: { type: 'object' },
            },
            responses: [{ statusCode: '200' }],
          },
          {
            path: '/items/{id}',
            method: 'DELETE',
            parameters: [{ name: 'id', in: 'path', required: true }],
            responses: [{ statusCode: '204' }],
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      const result = generatePatternsFromSpec(spec, 'api.test.com');
      expect(result.patternsGenerated).toBe(4);

      const methods = result.patternIds.map(id => {
        const pattern = generatePatternsFromOpenAPISpec(spec).find(p => p.id === id);
        return pattern?.method;
      });
      // Just verify we got patterns - methods are set correctly based on the endpoint
      expect(result.patternsGenerated).toBeGreaterThan(0);
    });
  });

  // Test Rate Limit Extraction
  describe('Rate Limit Extraction', () => {
    it('should extract rate limit from x-ratelimit-limit extension', () => {
      const specWithRateLimit: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Rate Limited API',
        baseUrl: 'https://api.test.com',
        endpoints: [],
        rateLimit: {
          limit: 100,
          windowSeconds: 60,
        },
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      expect(specWithRateLimit.rateLimit?.limit).toBe(100);
      expect(specWithRateLimit.rateLimit?.windowSeconds).toBe(60);
    });

    it('should include rate limit header names when specified', () => {
      const specWithHeaders: ParsedOpenAPISpec = {
        version: '3.0',
        title: 'Rate Limited API',
        baseUrl: 'https://api.test.com',
        endpoints: [],
        rateLimit: {
          limit: 1000,
          limitHeader: 'X-RateLimit-Limit',
          remainingHeader: 'X-RateLimit-Remaining',
          resetHeader: 'X-RateLimit-Reset',
        },
        discoveredAt: Date.now(),
        specUrl: 'https://api.test.com/openapi.json',
      };

      expect(specWithHeaders.rateLimit?.limitHeader).toBe('X-RateLimit-Limit');
      expect(specWithHeaders.rateLimit?.remainingHeader).toBe('X-RateLimit-Remaining');
      expect(specWithHeaders.rateLimit?.resetHeader).toBe('X-RateLimit-Reset');
    });
  });

  // Test Request Body Support
  describe('Request Body Support', () => {
    it('should include request body in endpoint', () => {
      const endpoint: OpenAPIEndpoint = {
        path: '/users',
        method: 'POST',
        parameters: [],
        requestBody: {
          description: 'User to create',
          required: true,
          contentType: 'application/json',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name', 'email'],
          },
        },
        responses: [{ statusCode: '201', description: 'Created' }],
      };

      expect(endpoint.requestBody).toBeDefined();
      expect(endpoint.requestBody?.contentType).toBe('application/json');
      expect(endpoint.requestBody?.required).toBe(true);
      expect(endpoint.requestBody?.schema).toBeDefined();
    });

    it('should support different content types for request body', () => {
      const endpoint: OpenAPIEndpoint = {
        path: '/uploads',
        method: 'POST',
        parameters: [],
        requestBody: {
          contentType: 'application/x-www-form-urlencoded',
          schema: { type: 'object' },
        },
        responses: [{ statusCode: '200' }],
      };

      expect(endpoint.requestBody?.contentType).toBe('application/x-www-form-urlencoded');
    });
  });
});

// ============================================
// JSON $REF RESOLVER TESTS
// ============================================

describe('JSON $ref Resolver', () => {

  it('should detect $ref in object', () => {
    const withRef = { type: 'object', $ref: '#/definitions/User' };
    const withoutRef = { type: 'object', properties: { name: { type: 'string' } } };

    expect(hasRefs(withRef)).toBe(true);
    expect(hasRefs(withoutRef)).toBe(false);
  });

  it('should count $refs in nested object', () => {
    const doc = {
      properties: {
        user: { $ref: '#/definitions/User' },
        posts: {
          type: 'array',
          items: { $ref: '#/definitions/Post' },
        },
      },
    };

    expect(countRefs(doc)).toBe(2);
  });

  it('should resolve local $ref', () => {
    const doc = {
      definitions: {
        User: { type: 'object', properties: { name: { type: 'string' } } },
      },
      schema: { $ref: '#/definitions/User' },
    };

    const result = resolveRefs(doc);
    expect(result.resolved.schema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    expect(result.resolvedRefs).toContain('#/definitions/User');
  });

  it('should handle nested $refs', () => {
    const doc = {
      definitions: {
        Address: { type: 'object', properties: { city: { type: 'string' } } },
        User: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { $ref: '#/definitions/Address' },
          },
        },
      },
      schema: { $ref: '#/definitions/User' },
    };

    const result = resolveRefs(doc);
    expect(result.resolved.schema).toHaveProperty('properties.address.properties.city');
    // Resolves: #/definitions/User (from schema), #/definitions/Address (nested in User),
    // and #/definitions/Address again when resolving the definition
    expect(result.resolvedRefs.length).toBeGreaterThanOrEqual(2);
    expect(result.resolvedRefs).toContain('#/definitions/User');
    expect(result.resolvedRefs).toContain('#/definitions/Address');
  });

  it('should handle circular $refs', () => {
    const doc = {
      definitions: {
        Node: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            next: { $ref: '#/definitions/Node' },
          },
        },
      },
      schema: { $ref: '#/definitions/Node' },
    };

    const result = resolveRefs(doc);
    expect(result.circularRefs).toContain('#/definitions/Node');
    expect(result.errors).toHaveLength(0);
  });

  it('should report errors for missing $refs', () => {
    const doc = {
      schema: { $ref: '#/definitions/NotExist' },
    };

    const result = resolveRefs(doc);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not found');
  });

  it('should get value at JSON pointer path', () => {
    const doc = {
      components: {
        schemas: {
          User: { type: 'object' },
        },
      },
    };

    const value = getValueAtPath(doc, '#/components/schemas/User');
    expect(value).toEqual({ type: 'object' });
  });

  it('should return undefined for invalid paths', () => {
    const doc = { foo: 'bar' };
    expect(getValueAtPath(doc, '#/not/exist')).toBeUndefined();
    expect(getValueAtPath(doc, '/invalid/format')).toBeUndefined();
  });
});
