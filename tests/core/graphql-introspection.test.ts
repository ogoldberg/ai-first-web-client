/**
 * Tests for GraphQL Introspection Discovery Module (D-001)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  discoverGraphQL,
  discoverGraphQLCached,
  generatePatternsFromSchema,
  generatePatternsFromGraphQLSchema,
  clearSchemaCache,
  INTROSPECTION_QUERY,
  DETECTION_QUERY,
  parseIntrospectionResult,
  parseGraphQLType,
  parseGraphQLField,
  parseGraphQLArgument,
  parseTypeRef,
  isNonNull,
  isListType,
  getBaseTypeName,
  detectPagination,
  formatTypeRef,
  generateFieldSelections,
  generateQueryTemplate,
  createQueryPattern,
} from '../../src/core/graphql-introspection.js';
import type {
  ParsedGraphQLSchema,
  GraphQLType,
  GraphQLField,
  GraphQLArgument,
  GraphQLTypeRef,
  GraphQLDiscoveryOptions,
} from '../../src/types/api-patterns.js';
import { GRAPHQL_PROBE_LOCATIONS } from '../../src/types/api-patterns.js';

// ============================================
// MOCK DATA
// ============================================

const MOCK_INTROSPECTION_RESPONSE = {
  data: {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: { name: 'Mutation' },
      subscriptionType: null,
      types: [
        {
          kind: 'OBJECT',
          name: 'Query',
          description: 'Root query type',
          fields: [
            {
              name: 'user',
              description: 'Get a user by ID',
              args: [
                {
                  name: 'id',
                  description: 'User ID',
                  type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'ID', ofType: null } },
                  defaultValue: null,
                },
              ],
              type: { kind: 'OBJECT', name: 'User', ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'users',
              description: 'Get all users',
              args: [
                {
                  name: 'first',
                  description: 'Number of items',
                  type: { kind: 'SCALAR', name: 'Int', ofType: null },
                  defaultValue: '10',
                },
                {
                  name: 'after',
                  description: 'Cursor',
                  type: { kind: 'SCALAR', name: 'String', ofType: null },
                  defaultValue: null,
                },
              ],
              type: {
                kind: 'NON_NULL',
                name: null,
                ofType: { kind: 'LIST', name: null, ofType: { kind: 'OBJECT', name: 'User', ofType: null } },
              },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'oldQuery',
              description: 'Deprecated query',
              args: [],
              type: { kind: 'SCALAR', name: 'String', ofType: null },
              isDeprecated: true,
              deprecationReason: 'Use newQuery instead',
            },
          ],
          interfaces: [],
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'OBJECT',
          name: 'User',
          description: 'A user in the system',
          fields: [
            {
              name: 'id',
              description: 'Unique ID',
              args: [],
              type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'ID', ofType: null } },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'name',
              description: 'User name',
              args: [],
              type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'String', ofType: null } },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'email',
              description: 'Email address',
              args: [],
              type: { kind: 'SCALAR', name: 'String', ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'posts',
              description: 'User posts',
              args: [],
              type: { kind: 'LIST', name: null, ofType: { kind: 'OBJECT', name: 'Post', ofType: null } },
              isDeprecated: false,
              deprecationReason: null,
            },
          ],
          interfaces: [],
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'OBJECT',
          name: 'Post',
          description: 'A blog post',
          fields: [
            {
              name: 'id',
              description: 'Post ID',
              args: [],
              type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'ID', ofType: null } },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'title',
              description: 'Post title',
              args: [],
              type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'String', ofType: null } },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: 'content',
              description: 'Post content',
              args: [],
              type: { kind: 'SCALAR', name: 'String', ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
          ],
          interfaces: [],
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'OBJECT',
          name: 'Mutation',
          description: 'Root mutation type',
          fields: [
            {
              name: 'createUser',
              description: 'Create a new user',
              args: [
                {
                  name: 'input',
                  description: 'User input',
                  type: { kind: 'NON_NULL', name: null, ofType: { kind: 'INPUT_OBJECT', name: 'CreateUserInput', ofType: null } },
                  defaultValue: null,
                },
              ],
              type: { kind: 'OBJECT', name: 'User', ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
          ],
          interfaces: [],
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'SCALAR',
          name: 'ID',
          description: 'The ID scalar type',
          fields: null,
          interfaces: null,
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'SCALAR',
          name: 'String',
          description: 'The String scalar type',
          fields: null,
          interfaces: null,
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'SCALAR',
          name: 'Int',
          description: 'The Int scalar type',
          fields: null,
          interfaces: null,
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'ENUM',
          name: 'UserStatus',
          description: 'User status enum',
          fields: null,
          interfaces: null,
          enumValues: [
            { name: 'ACTIVE', description: 'Active user', isDeprecated: false, deprecationReason: null },
            { name: 'INACTIVE', description: 'Inactive user', isDeprecated: false, deprecationReason: null },
            { name: 'SUSPENDED', description: 'Suspended user', isDeprecated: true, deprecationReason: 'Use INACTIVE' },
          ],
          possibleTypes: null,
        },
      ],
      directives: [
        { name: 'skip', description: 'Skip this field', locations: ['FIELD'] },
        { name: 'include', description: 'Include this field', locations: ['FIELD'] },
      ],
    },
  },
};

const MOCK_SCHEMA: ParsedGraphQLSchema = {
  queryType: 'Query',
  mutationType: 'Mutation',
  subscriptionType: undefined,
  types: [
    {
      kind: 'OBJECT',
      name: 'Query',
      description: 'Root query type',
      fields: [
        {
          name: 'user',
          description: 'Get a user by ID',
          args: [
            {
              name: 'id',
              description: 'User ID',
              type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } },
            },
          ],
          type: { kind: 'OBJECT', name: 'User' },
          isDeprecated: false,
        },
        {
          name: 'users',
          description: 'Get all users',
          args: [
            {
              name: 'first',
              type: { kind: 'SCALAR', name: 'Int' },
            },
            {
              name: 'after',
              type: { kind: 'SCALAR', name: 'String' },
            },
          ],
          type: { kind: 'NON_NULL', ofType: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } } },
          isDeprecated: false,
        },
      ],
    },
    {
      kind: 'OBJECT',
      name: 'User',
      fields: [
        { name: 'id', args: [], type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } }, isDeprecated: false },
        { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' }, isDeprecated: false },
        { name: 'email', args: [], type: { kind: 'SCALAR', name: 'String' }, isDeprecated: false },
      ],
    },
  ],
  discoveredAt: Date.now(),
  endpointUrl: 'https://api.example.com/graphql',
};

// ============================================
// PROBE LOCATIONS TESTS
// ============================================

describe('GraphQL Probe Locations', () => {
  it('should have common GraphQL endpoint locations defined', () => {
    expect(GRAPHQL_PROBE_LOCATIONS).toContain('/graphql');
    expect(GRAPHQL_PROBE_LOCATIONS).toContain('/api/graphql');
    expect(GRAPHQL_PROBE_LOCATIONS).toContain('/v1/graphql');
    expect(GRAPHQL_PROBE_LOCATIONS).toContain('/gql');
  });

  it('should have at least 5 probe locations', () => {
    expect(GRAPHQL_PROBE_LOCATIONS.length).toBeGreaterThanOrEqual(5);
  });
});

// ============================================
// INTROSPECTION QUERY TESTS
// ============================================

describe('Introspection Query', () => {
  it('should have a valid introspection query', () => {
    expect(INTROSPECTION_QUERY).toContain('__schema');
    expect(INTROSPECTION_QUERY).toContain('queryType');
    expect(INTROSPECTION_QUERY).toContain('mutationType');
    expect(INTROSPECTION_QUERY).toContain('types');
    expect(INTROSPECTION_QUERY).toContain('fields');
  });

  it('should have a minimal detection query', () => {
    expect(DETECTION_QUERY).toContain('__typename');
    expect(DETECTION_QUERY.length).toBeLessThan(50);
  });
});

// ============================================
// TYPE REFERENCE PARSING TESTS
// ============================================

describe('Type Reference Parsing', () => {
  describe('parseTypeRef', () => {
    it('should parse a simple scalar type', () => {
      const ref = parseTypeRef({ kind: 'SCALAR', name: 'String' });
      expect(ref).toEqual({ kind: 'SCALAR', name: 'String' });
    });

    it('should parse a NON_NULL type', () => {
      const ref = parseTypeRef({
        kind: 'NON_NULL',
        ofType: { kind: 'SCALAR', name: 'String' },
      });
      expect(ref).toEqual({
        kind: 'NON_NULL',
        ofType: { kind: 'SCALAR', name: 'String' },
      });
    });

    it('should parse a LIST type', () => {
      const ref = parseTypeRef({
        kind: 'LIST',
        ofType: { kind: 'OBJECT', name: 'User' },
      });
      expect(ref).toEqual({
        kind: 'LIST',
        ofType: { kind: 'OBJECT', name: 'User' },
      });
    });

    it('should parse nested wrapper types', () => {
      const ref = parseTypeRef({
        kind: 'NON_NULL',
        ofType: {
          kind: 'LIST',
          ofType: { kind: 'OBJECT', name: 'User' },
        },
      });
      expect(ref?.kind).toBe('NON_NULL');
      expect(ref?.ofType?.kind).toBe('LIST');
      expect(ref?.ofType?.ofType?.name).toBe('User');
    });

    it('should return null for invalid input', () => {
      expect(parseTypeRef(null)).toBeNull();
      expect(parseTypeRef(undefined)).toBeNull();
      expect(parseTypeRef({})).toBeNull();
    });
  });

  describe('isNonNull', () => {
    it('should return true for NON_NULL types', () => {
      const type: GraphQLTypeRef = { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } };
      expect(isNonNull(type)).toBe(true);
    });

    it('should return false for nullable types', () => {
      const type: GraphQLTypeRef = { kind: 'SCALAR', name: 'String' };
      expect(isNonNull(type)).toBe(false);
    });
  });

  describe('isListType', () => {
    it('should return true for LIST types', () => {
      const type: GraphQLTypeRef = { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } };
      expect(isListType(type)).toBe(true);
    });

    it('should return true for NON_NULL wrapped LIST', () => {
      const type: GraphQLTypeRef = {
        kind: 'NON_NULL',
        ofType: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } },
      };
      expect(isListType(type)).toBe(true);
    });

    it('should return false for non-list types', () => {
      const type: GraphQLTypeRef = { kind: 'OBJECT', name: 'User' };
      expect(isListType(type)).toBe(false);
    });
  });

  describe('getBaseTypeName', () => {
    it('should get name from simple type', () => {
      const type: GraphQLTypeRef = { kind: 'SCALAR', name: 'String' };
      expect(getBaseTypeName(type)).toBe('String');
    });

    it('should unwrap NON_NULL to get name', () => {
      const type: GraphQLTypeRef = { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } };
      expect(getBaseTypeName(type)).toBe('String');
    });

    it('should unwrap LIST to get name', () => {
      const type: GraphQLTypeRef = { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } };
      expect(getBaseTypeName(type)).toBe('User');
    });

    it('should unwrap multiple wrappers', () => {
      const type: GraphQLTypeRef = {
        kind: 'NON_NULL',
        ofType: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } },
      };
      expect(getBaseTypeName(type)).toBe('User');
    });
  });

  describe('formatTypeRef', () => {
    it('should format simple type', () => {
      const type: GraphQLTypeRef = { kind: 'SCALAR', name: 'String' };
      expect(formatTypeRef(type)).toBe('String');
    });

    it('should format NON_NULL type with !', () => {
      const type: GraphQLTypeRef = { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } };
      expect(formatTypeRef(type)).toBe('String!');
    });

    it('should format LIST type with brackets', () => {
      const type: GraphQLTypeRef = { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } };
      expect(formatTypeRef(type)).toBe('[User]');
    });

    it('should format complex nested types', () => {
      const type: GraphQLTypeRef = {
        kind: 'NON_NULL',
        ofType: { kind: 'LIST', ofType: { kind: 'NON_NULL', ofType: { kind: 'OBJECT', name: 'User' } } },
      };
      expect(formatTypeRef(type)).toBe('[User!]!');
    });
  });
});

// ============================================
// ARGUMENT PARSING TESTS
// ============================================

describe('Argument Parsing', () => {
  describe('parseGraphQLArgument', () => {
    it('should parse a simple argument', () => {
      const arg = parseGraphQLArgument({
        name: 'id',
        description: 'User ID',
        type: { kind: 'SCALAR', name: 'ID' },
        defaultValue: null,
      });

      expect(arg).not.toBeNull();
      expect(arg?.name).toBe('id');
      expect(arg?.description).toBe('User ID');
      expect(arg?.type.kind).toBe('SCALAR');
    });

    it('should parse argument with default value', () => {
      const arg = parseGraphQLArgument({
        name: 'limit',
        type: { kind: 'SCALAR', name: 'Int' },
        defaultValue: '10',
      });

      expect(arg?.defaultValue).toBe('10');
    });

    it('should return null for invalid argument', () => {
      expect(parseGraphQLArgument({ name: 'test' })).toBeNull();
      expect(parseGraphQLArgument({ type: { kind: 'SCALAR', name: 'String' } })).toBeNull();
    });
  });
});

// ============================================
// FIELD PARSING TESTS
// ============================================

describe('Field Parsing', () => {
  describe('parseGraphQLField', () => {
    it('should parse a simple field', () => {
      const field = parseGraphQLField({
        name: 'id',
        description: 'User ID',
        args: [],
        type: { kind: 'SCALAR', name: 'ID' },
        isDeprecated: false,
      });

      expect(field).not.toBeNull();
      expect(field?.name).toBe('id');
      expect(field?.args).toEqual([]);
      expect(field?.isDeprecated).toBe(false);
    });

    it('should parse a field with arguments', () => {
      const field = parseGraphQLField({
        name: 'user',
        args: [
          { name: 'id', type: { kind: 'SCALAR', name: 'ID' } },
        ],
        type: { kind: 'OBJECT', name: 'User' },
        isDeprecated: false,
      });

      expect(field?.args).toHaveLength(1);
      expect(field?.args[0].name).toBe('id');
    });

    it('should parse a deprecated field', () => {
      const field = parseGraphQLField({
        name: 'oldField',
        args: [],
        type: { kind: 'SCALAR', name: 'String' },
        isDeprecated: true,
        deprecationReason: 'Use newField instead',
      });

      expect(field?.isDeprecated).toBe(true);
      expect(field?.deprecationReason).toBe('Use newField instead');
    });
  });
});

// ============================================
// TYPE PARSING TESTS
// ============================================

describe('Type Parsing', () => {
  describe('parseGraphQLType', () => {
    it('should parse an OBJECT type with fields', () => {
      const type = parseGraphQLType({
        kind: 'OBJECT',
        name: 'User',
        description: 'A user',
        fields: [
          { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' }, isDeprecated: false },
          { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' }, isDeprecated: false },
        ],
      });

      expect(type).not.toBeNull();
      expect(type?.kind).toBe('OBJECT');
      expect(type?.name).toBe('User');
      expect(type?.fields).toHaveLength(2);
    });

    it('should parse an ENUM type', () => {
      const type = parseGraphQLType({
        kind: 'ENUM',
        name: 'Status',
        enumValues: [
          { name: 'ACTIVE', isDeprecated: false },
          { name: 'INACTIVE', isDeprecated: false },
        ],
      });

      expect(type?.kind).toBe('ENUM');
      expect(type?.enumValues).toHaveLength(2);
    });

    it('should skip internal types starting with __', () => {
      const type = parseGraphQLType({
        kind: 'OBJECT',
        name: '__Schema',
        fields: [],
      });

      expect(type).toBeNull();
    });

    it('should return null for invalid type', () => {
      expect(parseGraphQLType({ name: 'Test' })).toBeNull();
      expect(parseGraphQLType({ kind: 'OBJECT' })).toBeNull();
    });
  });
});

// ============================================
// SCHEMA PARSING TESTS
// ============================================

describe('Schema Parsing', () => {
  describe('parseIntrospectionResult', () => {
    it('should parse a complete introspection result', () => {
      const schema = parseIntrospectionResult(
        MOCK_INTROSPECTION_RESPONSE.data.__schema as unknown as Record<string, unknown>,
        'https://api.example.com/graphql'
      );

      expect(schema.queryType).toBe('Query');
      expect(schema.mutationType).toBe('Mutation');
      expect(schema.endpointUrl).toBe('https://api.example.com/graphql');
      expect(schema.types.length).toBeGreaterThan(0);
    });

    it('should filter out internal types', () => {
      const schema = parseIntrospectionResult(
        MOCK_INTROSPECTION_RESPONSE.data.__schema as unknown as Record<string, unknown>,
        'https://api.example.com/graphql'
      );

      const internalTypes = schema.types.filter(t => t.name.startsWith('__'));
      expect(internalTypes).toHaveLength(0);
    });

    it('should parse directives', () => {
      const schema = parseIntrospectionResult(
        MOCK_INTROSPECTION_RESPONSE.data.__schema as unknown as Record<string, unknown>,
        'https://api.example.com/graphql'
      );

      expect(schema.directives).toBeDefined();
      expect(schema.directives?.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// PAGINATION DETECTION TESTS
// ============================================

describe('Pagination Detection', () => {
  describe('detectPagination', () => {
    it('should detect Relay-style pagination', () => {
      const args: GraphQLArgument[] = [
        { name: 'first', type: { kind: 'SCALAR', name: 'Int' } },
        { name: 'after', type: { kind: 'SCALAR', name: 'String' } },
      ];

      const result = detectPagination(args);
      expect(result.supportsPagination).toBe(true);
      expect(result.paginationStyle).toBe('relay');
    });

    it('should detect offset-style pagination', () => {
      const args: GraphQLArgument[] = [
        { name: 'limit', type: { kind: 'SCALAR', name: 'Int' } },
        { name: 'offset', type: { kind: 'SCALAR', name: 'Int' } },
      ];

      const result = detectPagination(args);
      expect(result.supportsPagination).toBe(true);
      expect(result.paginationStyle).toBe('offset');
    });

    it('should detect cursor-style pagination', () => {
      const args: GraphQLArgument[] = [
        { name: 'cursor', type: { kind: 'SCALAR', name: 'String' } },
        { name: 'pageSize', type: { kind: 'SCALAR', name: 'Int' } },
      ];

      const result = detectPagination(args);
      expect(result.supportsPagination).toBe(true);
      expect(result.paginationStyle).toBe('cursor');
    });

    it('should return false for no pagination args', () => {
      const args: GraphQLArgument[] = [
        { name: 'id', type: { kind: 'SCALAR', name: 'ID' } },
      ];

      const result = detectPagination(args);
      expect(result.supportsPagination).toBe(false);
      expect(result.paginationStyle).toBeUndefined();
    });
  });
});

// ============================================
// FIELD SELECTION GENERATION TESTS
// ============================================

describe('Field Selection Generation', () => {
  describe('generateFieldSelections', () => {
    it('should generate selections for scalar fields', () => {
      const selections = generateFieldSelections('User', MOCK_SCHEMA);

      expect(selections).toContain('id');
      expect(selections).toContain('name');
      expect(selections).toContain('email');
    });

    it('should exclude __typename field', () => {
      const schemaWithTypename: ParsedGraphQLSchema = {
        ...MOCK_SCHEMA,
        types: [
          {
            kind: 'OBJECT',
            name: 'Test',
            fields: [
              { name: '__typename', args: [], type: { kind: 'SCALAR', name: 'String' }, isDeprecated: false },
              { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' }, isDeprecated: false },
            ],
          },
        ],
      };

      const selections = generateFieldSelections('Test', schemaWithTypename);
      expect(selections).not.toContain('__typename');
      expect(selections).toContain('id');
    });

    it('should limit recursion depth', () => {
      // Create a schema with deeply nested types
      const deepSchema: ParsedGraphQLSchema = {
        ...MOCK_SCHEMA,
        types: [
          {
            kind: 'OBJECT',
            name: 'A',
            fields: [
              { name: 'b', args: [], type: { kind: 'OBJECT', name: 'B' }, isDeprecated: false },
            ],
          },
          {
            kind: 'OBJECT',
            name: 'B',
            fields: [
              { name: 'c', args: [], type: { kind: 'OBJECT', name: 'C' }, isDeprecated: false },
            ],
          },
          {
            kind: 'OBJECT',
            name: 'C',
            fields: [
              { name: 'd', args: [], type: { kind: 'OBJECT', name: 'D' }, isDeprecated: false },
            ],
          },
          {
            kind: 'OBJECT',
            name: 'D',
            fields: [
              { name: 'e', args: [], type: { kind: 'OBJECT', name: 'E' }, isDeprecated: false },
            ],
          },
          {
            kind: 'OBJECT',
            name: 'E',
            fields: [
              { name: 'value', args: [], type: { kind: 'SCALAR', name: 'String' }, isDeprecated: false },
            ],
          },
        ],
      };

      const selections = generateFieldSelections('A', deepSchema);
      // Should not go deeper than MAX_TYPE_DEPTH (3)
      expect(selections.join(' ')).not.toContain('e');
    });

    it('should return empty array for unknown type', () => {
      const selections = generateFieldSelections('Unknown', MOCK_SCHEMA);
      expect(selections).toEqual([]);
    });
  });
});

// ============================================
// QUERY TEMPLATE GENERATION TESTS
// ============================================

describe('Query Template Generation', () => {
  describe('generateQueryTemplate', () => {
    it('should generate template for field without args', () => {
      const field: GraphQLField = {
        name: 'users',
        args: [],
        type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } },
        isDeprecated: false,
      };

      const template = generateQueryTemplate(field, ['id', 'name']);
      expect(template).toBe('query { users { id name } }');
    });

    it('should generate template with required args', () => {
      const field: GraphQLField = {
        name: 'user',
        args: [
          { name: 'id', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } } },
        ],
        type: { kind: 'OBJECT', name: 'User' },
        isDeprecated: false,
      };

      const template = generateQueryTemplate(field, ['id', 'name']);
      expect(template).toBe('query($id: ID!) { user(id: $id) { id name } }');
    });

    it('should use id as default if no selections', () => {
      const field: GraphQLField = {
        name: 'items',
        args: [],
        type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'Item' } },
        isDeprecated: false,
      };

      const template = generateQueryTemplate(field, []);
      expect(template).toBe('query { items { id } }');
    });
  });

  describe('createQueryPattern', () => {
    it('should create a query pattern from a field', () => {
      const field = MOCK_SCHEMA.types[0].fields![0]; // user field
      const pattern = createQueryPattern(field, MOCK_SCHEMA);

      expect(pattern.fieldName).toBe('user');
      expect(pattern.requiredArgs).toHaveLength(1);
      expect(pattern.requiredArgs[0].name).toBe('id');
      expect(pattern.isList).toBe(false);
    });

    it('should detect list queries', () => {
      const field = MOCK_SCHEMA.types[0].fields![1]; // users field
      const pattern = createQueryPattern(field, MOCK_SCHEMA);

      expect(pattern.fieldName).toBe('users');
      expect(pattern.isList).toBe(true);
      expect(pattern.supportsPagination).toBe(true);
      expect(pattern.paginationStyle).toBe('relay');
    });
  });
});

// ============================================
// PATTERN GENERATION TESTS
// ============================================

describe('Pattern Generation', () => {
  describe('generatePatternsFromSchema', () => {
    it('should generate patterns from query fields', () => {
      const result = generatePatternsFromSchema(MOCK_SCHEMA, 'api.example.com');

      expect(result.patternsGenerated).toBeGreaterThan(0);
      expect(result.patternIds.length).toBe(result.patternsGenerated);
    });

    it('should generate query patterns', () => {
      const result = generatePatternsFromSchema(MOCK_SCHEMA, 'api.example.com');

      expect(result.queryPatterns.length).toBeGreaterThan(0);
      expect(result.queryPatterns.some(p => p.fieldName === 'user')).toBe(true);
    });

    it('should skip deprecated fields', () => {
      const schemaWithDeprecated: ParsedGraphQLSchema = {
        ...MOCK_SCHEMA,
        types: [
          {
            kind: 'OBJECT',
            name: 'Query',
            fields: [
              {
                name: 'deprecated',
                args: [],
                type: { kind: 'SCALAR', name: 'String' },
                isDeprecated: true,
                deprecationReason: 'Use something else',
              },
            ],
          },
        ],
      };

      const result = generatePatternsFromSchema(schemaWithDeprecated, 'api.example.com');

      expect(result.skippedFields).toHaveLength(1);
      expect(result.skippedFields[0].reason).toBe('Deprecated field');
    });

    it('should skip fields with too many required args', () => {
      const schemaWithManyArgs: ParsedGraphQLSchema = {
        ...MOCK_SCHEMA,
        types: [
          {
            kind: 'OBJECT',
            name: 'Query',
            fields: [
              {
                name: 'complex',
                args: [
                  { name: 'a', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } },
                  { name: 'b', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } },
                  { name: 'c', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } },
                  { name: 'd', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } },
                ],
                type: { kind: 'SCALAR', name: 'String' },
                isDeprecated: false,
              },
            ],
          },
        ],
      };

      const result = generatePatternsFromSchema(schemaWithManyArgs, 'api.example.com');

      expect(result.skippedFields).toHaveLength(1);
      expect(result.skippedFields[0].reason).toBe('Too many required arguments');
    });

    it('should handle schema without query type', () => {
      const emptySchema: ParsedGraphQLSchema = {
        queryType: 'Query',
        types: [],
        discoveredAt: Date.now(),
        endpointUrl: 'https://api.example.com/graphql',
      };

      const result = generatePatternsFromSchema(emptySchema, 'api.example.com');

      expect(result.patternsGenerated).toBe(0);
      expect(result.warnings).toContain('No query type found in schema');
    });
  });

  describe('generatePatternsFromGraphQLSchema', () => {
    it('should generate LearnedApiPattern objects', () => {
      const patterns = generatePatternsFromGraphQLSchema(MOCK_SCHEMA);

      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach(pattern => {
        expect(pattern.id).toMatch(/^graphql:/);
        expect(pattern.templateType).toBe('query-api');
        expect(pattern.method).toBe('POST');
        expect(pattern.responseFormat).toBe('json');
        expect(pattern.metrics.confidence).toBe(0.95);
      });
    });

    it('should set correct headers for GraphQL', () => {
      const patterns = generatePatternsFromGraphQLSchema(MOCK_SCHEMA);

      patterns.forEach(pattern => {
        expect(pattern.headers?.['Content-Type']).toBe('application/json');
        expect(pattern.headers?.['Accept']).toBe('application/json');
      });
    });
  });
});

// ============================================
// CACHING TESTS
// ============================================

describe('Schema Caching', () => {
  beforeEach(() => {
    clearSchemaCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearSchemaCache();
  });

  it('should clear cache', () => {
    clearSchemaCache();
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });
});

// ============================================
// DISCOVERY TESTS (with mocked fetch)
// ============================================

describe('GraphQL Discovery', () => {
  beforeEach(() => {
    clearSchemaCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearSchemaCache();
    vi.restoreAllMocks();
  });

  it('should return not found when no endpoint exists', async () => {
    // Mock fetch to always return 404
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await discoverGraphQL('nonexistent.example.com', {
      timeout: 1000,
    });

    expect(result.found).toBe(false);
    expect(result.probedLocations.length).toBeGreaterThan(0);
  });

  it('should detect GraphQL endpoint', async () => {
    // Mock fetch to return valid GraphQL response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { __typename: 'Query' } }),
    });

    const result = await discoverGraphQL('api.example.com', {
      fullIntrospection: false,
    });

    expect(result.found).toBe(true);
    expect(result.endpointUrl).toContain('graphql');
  });

  it('should perform introspection when enabled', async () => {
    // Mock fetch to return valid introspection response
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Detection query
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { __typename: 'Query' } }),
        });
      } else {
        // Introspection query
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_INTROSPECTION_RESPONSE),
        });
      }
    });

    const result = await discoverGraphQL('api.example.com', {
      fullIntrospection: true,
    });

    expect(result.found).toBe(true);
    expect(result.introspectionEnabled).toBe(true);
    expect(result.schema).toBeDefined();
    expect(result.schema?.queryType).toBe('Query');
  });

  it('should handle disabled introspection', async () => {
    // Mock fetch to detect endpoint but fail introspection
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Detection query
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { __typename: 'Query' } }),
        });
      } else {
        // Introspection query - returns error
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            errors: [{ message: 'Introspection is disabled' }],
          }),
        });
      }
    });

    const result = await discoverGraphQL('api.example.com');

    expect(result.found).toBe(true);
    expect(result.introspectionEnabled).toBe(false);
    expect(result.error).toContain('Introspection is disabled');
  });

  it('should use cached results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { __typename: 'Query' } }),
    });
    global.fetch = fetchMock;

    // First call
    await discoverGraphQLCached('cached.example.com', { fullIntrospection: false });
    const firstCallCount = fetchMock.mock.calls.length;

    // Second call should use cache
    await discoverGraphQLCached('cached.example.com', { fullIntrospection: false });

    expect(fetchMock.mock.calls.length).toBe(firstCallCount);
  });
});
