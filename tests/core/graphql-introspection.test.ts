/**
 * Tests for GraphQL Introspection Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  probeGraphQLEndpoints,
  isGraphQLEndpoint,
  executeIntrospection,
  parseSchema,
  generateQueryPatterns,
  discoverGraphQL,
  isLikelyGraphQL,
  getBaseTypeName,
  isNonNull,
  isList,
  GRAPHQL_ENDPOINT_PATHS,
  INTROSPECTION_QUERY,
  type IntrospectionResult,
  type GraphQLTypeRef,
  type ParsedGraphQLSchema,
} from '../../src/core/graphql-introspection.js';

// ============================================
// TEST FIXTURES
// ============================================

/**
 * Create a minimal introspection result for testing
 */
function createMockIntrospection(
  overrides: Partial<IntrospectionResult['__schema']> = {}
): IntrospectionResult {
  return {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: { name: 'Mutation' },
      subscriptionType: null,
      types: [
        {
          name: 'Query',
          kind: 'OBJECT',
          description: 'Root query type',
          fields: [
            {
              name: 'user',
              description: 'Get a user by ID',
              args: [
                {
                  name: 'id',
                  type: { name: null, kind: 'NON_NULL', ofType: { name: 'ID', kind: 'SCALAR' } },
                },
              ],
              type: { name: 'User', kind: 'OBJECT' },
            },
            {
              name: 'users',
              description: 'Get all users',
              args: [
                {
                  name: 'first',
                  type: { name: 'Int', kind: 'SCALAR' },
                },
                {
                  name: 'after',
                  type: { name: 'String', kind: 'SCALAR' },
                },
              ],
              type: { name: null, kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } },
            },
          ],
        },
        {
          name: 'Mutation',
          kind: 'OBJECT',
          fields: [
            {
              name: 'createUser',
              args: [
                {
                  name: 'input',
                  type: { name: null, kind: 'NON_NULL', ofType: { name: 'CreateUserInput', kind: 'INPUT_OBJECT' } },
                },
              ],
              type: { name: 'User', kind: 'OBJECT' },
            },
          ],
        },
        {
          name: 'User',
          kind: 'OBJECT',
          description: 'A user in the system',
          fields: [
            {
              name: 'id',
              args: [],
              type: { name: null, kind: 'NON_NULL', ofType: { name: 'ID', kind: 'SCALAR' } },
            },
            {
              name: 'name',
              args: [],
              type: { name: 'String', kind: 'SCALAR' },
            },
            {
              name: 'email',
              args: [],
              type: { name: 'String', kind: 'SCALAR' },
            },
            {
              name: 'posts',
              args: [],
              type: { name: null, kind: 'LIST', ofType: { name: 'Post', kind: 'OBJECT' } },
            },
          ],
        },
        {
          name: 'Post',
          kind: 'OBJECT',
          fields: [
            {
              name: 'id',
              args: [],
              type: { name: null, kind: 'NON_NULL', ofType: { name: 'ID', kind: 'SCALAR' } },
            },
            {
              name: 'title',
              args: [],
              type: { name: 'String', kind: 'SCALAR' },
            },
            {
              name: 'content',
              args: [],
              type: { name: 'String', kind: 'SCALAR' },
            },
          ],
        },
        {
          name: 'CreateUserInput',
          kind: 'INPUT_OBJECT',
          inputFields: [
            {
              name: 'name',
              type: { name: null, kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } },
            },
            {
              name: 'email',
              type: { name: null, kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } },
            },
          ],
        },
        {
          name: 'String',
          kind: 'SCALAR',
        },
        {
          name: 'Int',
          kind: 'SCALAR',
        },
        {
          name: 'ID',
          kind: 'SCALAR',
        },
        {
          name: 'Boolean',
          kind: 'SCALAR',
        },
      ],
      ...overrides,
    },
  };
}

/**
 * Create introspection with Relay pagination
 */
function createRelayIntrospection(): IntrospectionResult {
  return {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: null,
      subscriptionType: null,
      types: [
        {
          name: 'Query',
          kind: 'OBJECT',
          fields: [
            {
              name: 'users',
              args: [
                { name: 'first', type: { name: 'Int', kind: 'SCALAR' } },
                { name: 'after', type: { name: 'String', kind: 'SCALAR' } },
              ],
              type: { name: 'UserConnection', kind: 'OBJECT' },
            },
          ],
        },
        {
          name: 'UserConnection',
          kind: 'OBJECT',
          fields: [
            { name: 'edges', args: [], type: { name: null, kind: 'LIST', ofType: { name: 'UserEdge', kind: 'OBJECT' } } },
            { name: 'pageInfo', args: [], type: { name: 'PageInfo', kind: 'OBJECT' } },
          ],
        },
        {
          name: 'UserEdge',
          kind: 'OBJECT',
          fields: [
            { name: 'node', args: [], type: { name: 'User', kind: 'OBJECT' } },
            { name: 'cursor', args: [], type: { name: 'String', kind: 'SCALAR' } },
          ],
        },
        {
          name: 'PageInfo',
          kind: 'OBJECT',
          fields: [
            { name: 'hasNextPage', args: [], type: { name: 'Boolean', kind: 'SCALAR' } },
            { name: 'hasPreviousPage', args: [], type: { name: 'Boolean', kind: 'SCALAR' } },
          ],
        },
        {
          name: 'User',
          kind: 'OBJECT',
          fields: [
            { name: 'id', args: [], type: { name: 'ID', kind: 'SCALAR' } },
            { name: 'name', args: [], type: { name: 'String', kind: 'SCALAR' } },
          ],
        },
        { name: 'String', kind: 'SCALAR' },
        { name: 'Int', kind: 'SCALAR' },
        { name: 'ID', kind: 'SCALAR' },
        { name: 'Boolean', kind: 'SCALAR' },
      ],
    },
  };
}

/**
 * Create introspection with offset pagination
 */
function createOffsetIntrospection(): IntrospectionResult {
  return {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: null,
      subscriptionType: null,
      types: [
        {
          name: 'Query',
          kind: 'OBJECT',
          fields: [
            {
              name: 'users',
              args: [
                { name: 'offset', type: { name: 'Int', kind: 'SCALAR' } },
                { name: 'limit', type: { name: 'Int', kind: 'SCALAR' } },
              ],
              type: { name: null, kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } },
            },
          ],
        },
        {
          name: 'User',
          kind: 'OBJECT',
          fields: [
            { name: 'id', args: [], type: { name: 'ID', kind: 'SCALAR' } },
          ],
        },
        { name: 'String', kind: 'SCALAR' },
        { name: 'Int', kind: 'SCALAR' },
        { name: 'ID', kind: 'SCALAR' },
      ],
    },
  };
}

// ============================================
// ENDPOINT DETECTION TESTS
// ============================================

describe('GraphQL Endpoint Detection', () => {
  describe('probeGraphQLEndpoints', () => {
    it('should discover GraphQL endpoints', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        // Only return success for the exact /graphql path
        if (url === 'https://example.com/graphql') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { __typename: 'Query' } }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({}),
        });
      });

      const endpoints = await probeGraphQLEndpoints('example.com', mockFetch);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0]).toBe('https://example.com/graphql');
    });

    it('should handle failed probes gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const endpoints = await probeGraphQLEndpoints('example.com', mockFetch);
      expect(endpoints).toHaveLength(0);
    });

    it('should detect GraphQL by response shape', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ errors: [{ message: 'Syntax error' }] }),
      });

      const endpoints = await probeGraphQLEndpoints('example.com', mockFetch);
      expect(endpoints.length).toBeGreaterThan(0);
    });

    it('should not detect non-GraphQL responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const endpoints = await probeGraphQLEndpoints('example.com', mockFetch);
      expect(endpoints).toHaveLength(0);
    });
  });

  describe('isGraphQLEndpoint', () => {
    it('should detect /graphql paths', () => {
      expect(isGraphQLEndpoint('https://api.example.com/graphql')).toBe(true);
      expect(isGraphQLEndpoint('https://example.com/api/graphql')).toBe(true);
    });

    it('should detect /gql paths', () => {
      expect(isGraphQLEndpoint('https://example.com/gql')).toBe(true);
      expect(isGraphQLEndpoint('https://example.com/api/gql')).toBe(true);
    });

    it('should detect /query paths', () => {
      expect(isGraphQLEndpoint('https://example.com/query')).toBe(true);
    });

    it('should not detect non-GraphQL paths', () => {
      expect(isGraphQLEndpoint('https://example.com/api/users')).toBe(false);
      expect(isGraphQLEndpoint('https://example.com/rest')).toBe(false);
    });
  });

  describe('isLikelyGraphQL', () => {
    it('should identify known GraphQL providers', () => {
      expect(isLikelyGraphQL('api.github.com')).toBe(true);
      expect(isLikelyGraphQL('shopify.myshopify.com')).toBe(true);
      expect(isLikelyGraphQL('graphql.contentful.com')).toBe(true);
    });

    it('should not identify unknown domains', () => {
      expect(isLikelyGraphQL('example.com')).toBe(false);
      expect(isLikelyGraphQL('random-api.org')).toBe(false);
    });
  });
});

// ============================================
// INTROSPECTION TESTS
// ============================================

describe('GraphQL Introspection', () => {
  describe('executeIntrospection', () => {
    it('should execute full introspection query', async () => {
      const mockIntrospection = createMockIntrospection();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockIntrospection }),
      });

      const result = await executeIntrospection('https://example.com/graphql', {}, mockFetch);
      expect(result).not.toBeNull();
      expect(result?.__schema.queryType?.name).toBe('Query');
    });

    it('should fall back to simple introspection', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ errors: [{ message: 'Unknown field' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: {
              __schema: {
                queryType: { name: 'Query' },
                mutationType: null,
                types: [],
              },
            },
          }),
        });

      const result = await executeIntrospection('https://example.com/graphql', {}, mockFetch);
      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should detect disabled introspection', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: 'Introspection disabled for this schema' }],
        }),
      });

      const result = await executeIntrospection('https://example.com/graphql', {}, mockFetch);
      expect(result).toBeNull();
    });

    it('should pass custom headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: createMockIntrospection() }),
      });

      await executeIntrospection(
        'https://example.com/graphql',
        { Authorization: 'Bearer token123' },
        mockFetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/graphql',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await executeIntrospection('https://example.com/graphql', {}, mockFetch);
      expect(result).toBeNull();
    });
  });
});

// ============================================
// SCHEMA PARSING TESTS
// ============================================

describe('Schema Parsing', () => {
  describe('parseSchema', () => {
    it('should parse basic schema structure', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);

      expect(schema.endpoint).toBe('https://example.com/graphql');
      expect(schema.queryTypeName).toBe('Query');
      expect(schema.mutationTypeName).toBe('Mutation');
      expect(schema.subscriptionTypeName).toBeNull();
    });

    it('should build type map', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);

      expect(schema.types.has('Query')).toBe(true);
      expect(schema.types.has('User')).toBe(true);
      expect(schema.types.has('Post')).toBe(true);
    });

    it('should extract entity types', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);

      expect(schema.entityTypes).toContain('User');
      expect(schema.entityTypes).toContain('Post');
      expect(schema.entityTypes).not.toContain('String');
      expect(schema.entityTypes).not.toContain('__Schema');
    });

    it('should detect Relay pagination pattern', () => {
      const introspection = createRelayIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      expect(schema.paginationPattern).toBe('relay');
    });

    it('should detect offset pagination pattern', () => {
      const introspection = createOffsetIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      expect(schema.paginationPattern).toBe('offset');
    });

    it('should detect cursor pagination from arguments', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      // The mock uses first/after args which indicate cursor pagination
      expect(schema.paginationPattern).toBe('cursor');
    });

    it('should set fetchedAt timestamp', () => {
      const introspection = createMockIntrospection();
      const before = Date.now();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const after = Date.now();

      expect(schema.fetchedAt).toBeGreaterThanOrEqual(before);
      expect(schema.fetchedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('getBaseTypeName', () => {
    it('should return name for named types', () => {
      const type: GraphQLTypeRef = { name: 'User', kind: 'OBJECT' };
      expect(getBaseTypeName(type)).toBe('User');
    });

    it('should unwrap NON_NULL types', () => {
      const type: GraphQLTypeRef = {
        name: null,
        kind: 'NON_NULL',
        ofType: { name: 'User', kind: 'OBJECT' },
      };
      expect(getBaseTypeName(type)).toBe('User');
    });

    it('should unwrap LIST types', () => {
      const type: GraphQLTypeRef = {
        name: null,
        kind: 'LIST',
        ofType: { name: 'User', kind: 'OBJECT' },
      };
      expect(getBaseTypeName(type)).toBe('User');
    });

    it('should unwrap nested wrappers', () => {
      const type: GraphQLTypeRef = {
        name: null,
        kind: 'NON_NULL',
        ofType: {
          name: null,
          kind: 'LIST',
          ofType: { name: 'User', kind: 'OBJECT' },
        },
      };
      expect(getBaseTypeName(type)).toBe('User');
    });
  });

  describe('isNonNull', () => {
    it('should detect NON_NULL types', () => {
      expect(isNonNull({ name: null, kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } })).toBe(true);
    });

    it('should return false for nullable types', () => {
      expect(isNonNull({ name: 'String', kind: 'SCALAR' })).toBe(false);
    });
  });

  describe('isList', () => {
    it('should detect LIST types', () => {
      expect(isList({ name: null, kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } })).toBe(true);
    });

    it('should detect NON_NULL LIST types', () => {
      expect(isList({
        name: null,
        kind: 'NON_NULL',
        ofType: { name: null, kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } },
      })).toBe(true);
    });

    it('should return false for non-list types', () => {
      expect(isList({ name: 'User', kind: 'OBJECT' })).toBe(false);
    });
  });
});

// ============================================
// PATTERN GENERATION TESTS
// ============================================

describe('Pattern Generation', () => {
  describe('generateQueryPatterns', () => {
    it('should generate patterns for query fields', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      expect(patterns.length).toBeGreaterThan(0);
      const userPattern = patterns.find(p => p.queryName === 'user');
      expect(userPattern).toBeDefined();
      expect(userPattern?.operationType).toBe('query');
    });

    it('should categorize required vs optional args', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      const userPattern = patterns.find(p => p.queryName === 'user');
      expect(userPattern?.requiredArgs).toHaveLength(1);
      expect(userPattern?.requiredArgs[0].name).toBe('id');

      const usersPattern = patterns.find(p => p.queryName === 'users');
      expect(usersPattern?.requiredArgs).toHaveLength(0);
      expect(usersPattern?.optionalArgs.length).toBeGreaterThan(0);
    });

    it('should generate query templates', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      const userPattern = patterns.find(p => p.queryName === 'user');
      expect(userPattern?.queryTemplate).toContain('query UserQuery');
      expect(userPattern?.queryTemplate).toContain('$id: ID!');
      expect(userPattern?.queryTemplate).toContain('user(id: $id)');
    });

    it('should generate mutation patterns', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      const mutationPattern = patterns.find(p => p.queryName === 'createUser');
      expect(mutationPattern).toBeDefined();
      expect(mutationPattern?.operationType).toBe('mutation');
      expect(mutationPattern?.queryTemplate).toContain('mutation CreateUserMutation');
    });

    it('should generate default field selection', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      const userPattern = patterns.find(p => p.queryName === 'user');
      expect(userPattern?.defaultFieldSelection).toContain('id');
      expect(userPattern?.defaultFieldSelection).toContain('name');
      expect(userPattern?.defaultFieldSelection).toContain('email');
    });

    it('should set high confidence for introspection-based patterns', () => {
      const introspection = createMockIntrospection();
      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      for (const pattern of patterns) {
        expect(pattern.confidence).toBe(0.95);
      }
    });

    it('should skip scalar return types', () => {
      const introspection = createMockIntrospection();
      // Add a query that returns a scalar
      introspection.__schema.types[0].fields?.push({
        name: 'serverTime',
        args: [],
        type: { name: 'String', kind: 'SCALAR' },
      });

      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);

      const scalarPattern = patterns.find(p => p.queryName === 'serverTime');
      expect(scalarPattern).toBeUndefined();
    });

    it('should handle schema without queries', () => {
      const introspection: IntrospectionResult = {
        __schema: {
          queryType: null,
          mutationType: null,
          subscriptionType: null,
          types: [],
        },
      };

      const schema = parseSchema('https://example.com/graphql', introspection);
      const patterns = generateQueryPatterns(schema);
      expect(patterns).toHaveLength(0);
    });
  });
});

// ============================================
// DISCOVERY TESTS
// ============================================

describe('GraphQL Discovery', () => {
  describe('discoverGraphQL', () => {
    it('should discover and introspect GraphQL endpoint', async () => {
      const mockIntrospection = createMockIntrospection();
      const mockFetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);
        if (body.query.includes('__typename')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { __typename: 'Query' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockIntrospection }),
        });
      });

      const result = await discoverGraphQL('example.com', { fetchFn: mockFetch });

      expect(result.found).toBe(true);
      expect(result.endpoint).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.patterns!.length).toBeGreaterThan(0);
    });

    it('should handle no GraphQL endpoints', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const result = await discoverGraphQL('example.com', { fetchFn: mockFetch });
      expect(result.found).toBe(false);
    });

    it('should handle disabled introspection', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);
        if (body.query.includes('__typename')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { __typename: 'Query' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            errors: [{ message: 'Introspection not allowed' }],
          }),
        });
      });

      const result = await discoverGraphQL('example.com', { fetchFn: mockFetch });

      expect(result.found).toBe(true);
      expect(result.introspectionDisabled).toBe(true);
      expect(result.schema).toBeUndefined();
    });

    it('should use specific endpoint when provided', async () => {
      const mockIntrospection = createMockIntrospection();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockIntrospection }),
      });

      const result = await discoverGraphQL('example.com', {
        fetchFn: mockFetch,
        specificEndpoint: 'https://example.com/custom/graphql',
      });

      expect(result.found).toBe(true);
      expect(result.endpoint).toBe('https://example.com/custom/graphql');
    });

    it('should pass custom headers', async () => {
      const mockIntrospection = createMockIntrospection();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockIntrospection }),
      });

      await discoverGraphQL('example.com', {
        fetchFn: mockFetch,
        headers: { Authorization: 'Bearer secret' },
        specificEndpoint: 'https://example.com/graphql',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret',
          }),
        })
      );
    });

    it('should handle discovery errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const result = await discoverGraphQL('example.com', { fetchFn: mockFetch });

      // When all probes fail, discovery returns found: false with no error
      // (errors in probes are swallowed to allow trying other endpoints)
      expect(result.found).toBe(false);
    });
  });
});

// ============================================
// INTROSPECTION QUERY TESTS
// ============================================

describe('Introspection Query Structure', () => {
  it('should have valid introspection query', () => {
    expect(INTROSPECTION_QUERY).toContain('__schema');
    expect(INTROSPECTION_QUERY).toContain('queryType');
    expect(INTROSPECTION_QUERY).toContain('mutationType');
    expect(INTROSPECTION_QUERY).toContain('subscriptionType');
    expect(INTROSPECTION_QUERY).toContain('types');
    expect(INTROSPECTION_QUERY).toContain('fields');
    expect(INTROSPECTION_QUERY).toContain('args');
  });

  it('should include deep type information', () => {
    expect(INTROSPECTION_QUERY).toContain('ofType');
    expect(INTROSPECTION_QUERY).toContain('kind');
    expect(INTROSPECTION_QUERY).toContain('description');
  });
});

// ============================================
// ENDPOINT PATHS TESTS
// ============================================

describe('GraphQL Endpoint Paths', () => {
  it('should include common GraphQL paths', () => {
    expect(GRAPHQL_ENDPOINT_PATHS).toContain('/graphql');
    expect(GRAPHQL_ENDPOINT_PATHS).toContain('/api/graphql');
    expect(GRAPHQL_ENDPOINT_PATHS).toContain('/gql');
  });

  it('should include versioned paths', () => {
    expect(GRAPHQL_ENDPOINT_PATHS).toContain('/v1/graphql');
    expect(GRAPHQL_ENDPOINT_PATHS).toContain('/api/v1/graphql');
  });
});
