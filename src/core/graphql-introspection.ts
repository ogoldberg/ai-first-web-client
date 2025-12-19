/**
 * GraphQL Introspection Module
 *
 * Automatically discovers and queries GraphQL schemas to generate
 * API patterns without requiring observation-based learning.
 *
 * This module:
 * 1. Probes common GraphQL endpoint locations
 * 2. Executes introspection queries to discover schema
 * 3. Parses schema to extract types, queries, mutations
 * 4. Generates query templates for common operations
 */

import { logger } from '../utils/logger.js';

const graphqlLogger = logger.create('GraphQLIntrospection');

// ============================================
// TYPES
// ============================================

/**
 * GraphQL type kind as returned by introspection
 */
export type GraphQLTypeKind =
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT'
  | 'LIST'
  | 'NON_NULL';

/**
 * GraphQL type reference (used for field types, arg types, etc.)
 */
export interface GraphQLTypeRef {
  name: string | null;
  kind: GraphQLTypeKind;
  ofType?: GraphQLTypeRef | null;
}

/**
 * GraphQL field argument
 */
export interface GraphQLArgument {
  name: string;
  type: GraphQLTypeRef;
  description?: string;
  defaultValue?: string;
}

/**
 * GraphQL field definition
 */
export interface GraphQLField {
  name: string;
  description?: string;
  args: GraphQLArgument[];
  type: GraphQLTypeRef;
}

/**
 * GraphQL type definition
 */
export interface GraphQLType {
  name: string;
  kind: GraphQLTypeKind;
  description?: string;
  fields?: GraphQLField[] | null;
  inputFields?: GraphQLArgument[] | null;
  enumValues?: Array<{ name: string; description?: string }> | null;
  interfaces?: Array<{ name: string }> | null;
  possibleTypes?: Array<{ name: string }> | null;
}

/**
 * Introspection query result
 */
export interface IntrospectionResult {
  __schema: {
    types: GraphQLType[];
    queryType: { name: string } | null;
    mutationType: { name: string } | null;
    subscriptionType: { name: string } | null;
  };
}

/**
 * Parsed GraphQL schema
 */
export interface ParsedGraphQLSchema {
  /** Endpoint URL where schema was discovered */
  endpoint: string;
  /** Query type name */
  queryTypeName: string | null;
  /** Mutation type name */
  mutationTypeName: string | null;
  /** Subscription type name */
  subscriptionTypeName: string | null;
  /** All types in the schema */
  types: Map<string, GraphQLType>;
  /** Entity types (non-built-in object types) */
  entityTypes: string[];
  /** Detected pagination patterns */
  paginationPattern: PaginationPattern | null;
  /** When this schema was fetched */
  fetchedAt: number;
}

/**
 * Pagination pattern detected in the schema
 */
export type PaginationPattern = 'relay' | 'offset' | 'cursor' | 'page';

/**
 * Generated GraphQL query pattern
 */
export interface GraphQLQueryPattern {
  /** Unique identifier */
  id: string;
  /** The query name */
  queryName: string;
  /** The GraphQL operation type */
  operationType: 'query' | 'mutation' | 'subscription';
  /** The entity type this query returns */
  returnType: string;
  /** Required arguments */
  requiredArgs: GraphQLArgument[];
  /** Optional arguments */
  optionalArgs: GraphQLArgument[];
  /** Default field selection */
  defaultFieldSelection: string[];
  /** Generated query template */
  queryTemplate: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * GraphQL discovery result
 */
export interface GraphQLDiscoveryResult {
  /** Whether GraphQL was discovered */
  found: boolean;
  /** The GraphQL endpoint URL */
  endpoint?: string;
  /** Parsed schema (if introspection succeeded) */
  schema?: ParsedGraphQLSchema;
  /** Generated query patterns */
  patterns?: GraphQLQueryPattern[];
  /** Error message if discovery failed */
  error?: string;
  /** Whether introspection is disabled */
  introspectionDisabled?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Common GraphQL endpoint paths to probe
 */
export const GRAPHQL_ENDPOINT_PATHS = [
  '/graphql',
  '/api/graphql',
  '/v1/graphql',
  '/api/v1/graphql',
  '/query',
  '/api/query',
  '/gql',
  '/api/gql',
];

/**
 * The introspection query to discover schema
 */
export const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name
      kind
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          name
          description
          type {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
            }
          }
          defaultValue
        }
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
      inputFields {
        name
        description
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
        defaultValue
      }
      enumValues(includeDeprecated: true) {
        name
        description
      }
      interfaces {
        name
      }
      possibleTypes {
        name
      }
    }
  }
}
`;

/**
 * Simple introspection query (for endpoints with limited introspection)
 */
export const SIMPLE_INTROSPECTION_QUERY = `
query {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      name
      kind
      fields { name type { name kind ofType { name kind } } }
    }
  }
}
`;

/**
 * Built-in GraphQL type names to exclude from entity types
 */
const BUILTIN_TYPE_NAMES = new Set([
  '__Schema',
  '__Type',
  '__TypeKind',
  '__Field',
  '__InputValue',
  '__EnumValue',
  '__Directive',
  '__DirectiveLocation',
  'String',
  'Int',
  'Float',
  'Boolean',
  'ID',
]);

/**
 * Relay pagination field indicators
 */
const RELAY_PAGINATION_FIELDS = ['edges', 'pageInfo', 'cursor', 'node'];

/**
 * Offset pagination argument indicators
 */
const OFFSET_PAGINATION_ARGS = ['offset', 'limit', 'skip', 'take'];

/**
 * Cursor pagination argument indicators
 */
const CURSOR_PAGINATION_ARGS = ['after', 'before', 'first', 'last'];

/**
 * Page-based pagination argument indicators
 */
const PAGE_PAGINATION_ARGS = ['page', 'perPage', 'pageSize'];

// ============================================
// ENDPOINT DETECTION
// ============================================

/**
 * Probe a domain for GraphQL endpoints
 */
export async function probeGraphQLEndpoints(
  domain: string,
  fetchFn: (url: string, options: RequestInit) => Promise<Response> = fetch
): Promise<string[]> {
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const discovered: string[] = [];

  const probePromises = GRAPHQL_ENDPOINT_PATHS.map(async (path) => {
    const url = new URL(path, baseUrl).toString();
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      if (response.ok) {
        const data = await response.json();
        // Check for GraphQL response shape
        if (data && (data.data !== undefined || data.errors !== undefined)) {
          return url;
        }
      }
    } catch {
      // Endpoint doesn't exist or isn't GraphQL
    }
    return null;
  });

  const results = await Promise.allSettled(probePromises);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      discovered.push(result.value);
    }
  }

  graphqlLogger.info('GraphQL endpoint probe complete', {
    domain,
    found: discovered.length,
    endpoints: discovered,
  });

  return discovered;
}

/**
 * Check if a URL is a GraphQL endpoint
 */
export function isGraphQLEndpoint(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return (
    pathname.includes('graphql') ||
    pathname.includes('/gql') ||
    pathname.includes('/query')
  );
}

// ============================================
// INTROSPECTION
// ============================================

/**
 * Execute introspection query on a GraphQL endpoint
 */
export async function executeIntrospection(
  endpoint: string,
  headers?: Record<string, string>,
  fetchFn: (url: string, options: RequestInit) => Promise<Response> = fetch
): Promise<IntrospectionResult | null> {
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers,
  };

  try {
    // Try full introspection first
    const fullResponse = await fetchFn(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    });

    if (fullResponse.ok) {
      const data = await fullResponse.json();
      if (data.data?.__schema) {
        graphqlLogger.info('Full introspection successful', { endpoint });
        return data.data as IntrospectionResult;
      }
      if (data.errors) {
        // Check if introspection is disabled
        const errorMessages = data.errors.map((e: { message: string }) => e.message).join(' ');
        if (
          errorMessages.includes('introspection') ||
          errorMessages.includes('disabled') ||
          errorMessages.includes('not allowed')
        ) {
          graphqlLogger.warn('Introspection disabled', { endpoint, errors: data.errors });
          return null;
        }
      }
    }

    // Try simple introspection as fallback
    const simpleResponse = await fetchFn(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ query: SIMPLE_INTROSPECTION_QUERY }),
    });

    if (simpleResponse.ok) {
      const data = await simpleResponse.json();
      if (data.data?.__schema) {
        graphqlLogger.info('Simple introspection successful', { endpoint });
        return data.data as IntrospectionResult;
      }
    }

    graphqlLogger.warn('Introspection failed', { endpoint });
    return null;
  } catch (error) {
    // Propagate network errors so the caller can handle them appropriately
    // (distinguishing between "introspection disabled" and "network error")
    graphqlLogger.error('Introspection error', { endpoint, error });
    throw error;
  }
}

// ============================================
// SCHEMA PARSING
// ============================================

/**
 * Parse introspection result into a structured schema
 */
export function parseSchema(
  endpoint: string,
  introspection: IntrospectionResult
): ParsedGraphQLSchema {
  const types = new Map<string, GraphQLType>();

  // Build type map
  for (const type of introspection.__schema.types) {
    types.set(type.name, type);
  }

  // Find entity types (non-built-in object types)
  const entityTypes: string[] = [];
  for (const type of introspection.__schema.types) {
    if (
      type.kind === 'OBJECT' &&
      !BUILTIN_TYPE_NAMES.has(type.name) &&
      !type.name.startsWith('__')
    ) {
      entityTypes.push(type.name);
    }
  }

  // Detect pagination pattern
  const paginationPattern = detectPaginationPattern(introspection);

  return {
    endpoint,
    queryTypeName: introspection.__schema.queryType?.name ?? null,
    mutationTypeName: introspection.__schema.mutationType?.name ?? null,
    subscriptionTypeName: introspection.__schema.subscriptionType?.name ?? null,
    types,
    entityTypes,
    paginationPattern,
    fetchedAt: Date.now(),
  };
}

/**
 * Detect pagination pattern used in the schema
 */
function detectPaginationPattern(
  introspection: IntrospectionResult
): PaginationPattern | null {
  let hasRelayPattern = false;
  let hasOffsetPattern = false;
  let hasCursorPattern = false;
  let hasPagePattern = false;

  for (const type of introspection.__schema.types) {
    if (type.kind !== 'OBJECT' || !type.fields) continue;

    const fieldNames = type.fields.map((f) => f.name.toLowerCase());

    // Check for Relay pattern (Connection types with edges/pageInfo)
    if (type.name.endsWith('Connection')) {
      const hasRelayFields = RELAY_PAGINATION_FIELDS.some((f) =>
        fieldNames.includes(f.toLowerCase())
      );
      if (hasRelayFields) {
        hasRelayPattern = true;
      }
    }

    // Check field arguments for pagination patterns
    for (const field of type.fields) {
      if (!field.args) continue;
      const argNames = field.args.map((a) => a.name.toLowerCase());

      if (OFFSET_PAGINATION_ARGS.some((a) => argNames.includes(a))) {
        hasOffsetPattern = true;
      }
      if (CURSOR_PAGINATION_ARGS.some((a) => argNames.includes(a))) {
        hasCursorPattern = true;
      }
      if (PAGE_PAGINATION_ARGS.some((a) => argNames.includes(a))) {
        hasPagePattern = true;
      }
    }
  }

  // Return the most specific pattern found
  if (hasRelayPattern) return 'relay';
  if (hasCursorPattern) return 'cursor';
  if (hasPagePattern) return 'page';
  if (hasOffsetPattern) return 'offset';
  return null;
}

/**
 * Get the base type name from a potentially wrapped type
 */
export function getBaseTypeName(typeRef: GraphQLTypeRef): string {
  if (typeRef.name) {
    return typeRef.name;
  }
  if (typeRef.ofType) {
    return getBaseTypeName(typeRef.ofType);
  }
  return 'Unknown';
}

/**
 * Check if a type is non-null (required)
 */
export function isNonNull(typeRef: GraphQLTypeRef): boolean {
  return typeRef.kind === 'NON_NULL';
}

/**
 * Check if a type is a list
 */
export function isList(typeRef: GraphQLTypeRef): boolean {
  if (typeRef.kind === 'LIST') return true;
  if (typeRef.kind === 'NON_NULL' && typeRef.ofType) {
    return typeRef.ofType.kind === 'LIST';
  }
  return false;
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Generate query patterns from parsed schema
 */
export function generateQueryPatterns(
  schema: ParsedGraphQLSchema
): GraphQLQueryPattern[] {
  const patterns: GraphQLQueryPattern[] = [];

  if (!schema.queryTypeName) {
    return patterns;
  }

  const queryType = schema.types.get(schema.queryTypeName);
  if (!queryType?.fields) {
    return patterns;
  }

  // Generate patterns for each query field
  for (const field of queryType.fields) {
    const returnTypeName = getBaseTypeName(field.type);
    const returnType = schema.types.get(returnTypeName);

    // Skip if return type is a scalar
    if (BUILTIN_TYPE_NAMES.has(returnTypeName)) {
      continue;
    }

    const requiredArgs: GraphQLArgument[] = [];
    const optionalArgs: GraphQLArgument[] = [];

    // Categorize arguments
    for (const arg of field.args) {
      if (isNonNull(arg.type)) {
        requiredArgs.push(arg);
      } else {
        optionalArgs.push(arg);
      }
    }

    // Generate default field selection
    const defaultFieldSelection = generateDefaultFieldSelection(
      returnType,
      schema.types
    );

    // Generate query template
    const queryTemplate = generateQueryTemplate(
      field,
      requiredArgs,
      defaultFieldSelection
    );

    const pattern: GraphQLQueryPattern = {
      id: `graphql:${field.name}`,
      queryName: field.name,
      operationType: 'query',
      returnType: returnTypeName,
      requiredArgs,
      optionalArgs,
      defaultFieldSelection,
      queryTemplate,
      confidence: 0.95, // High confidence from introspection
    };

    patterns.push(pattern);
  }

  // Generate mutation patterns if available
  if (schema.mutationTypeName) {
    const mutationType = schema.types.get(schema.mutationTypeName);
    if (mutationType?.fields) {
      for (const field of mutationType.fields) {
        const returnTypeName = getBaseTypeName(field.type);
        const returnType = schema.types.get(returnTypeName);

        const requiredArgs: GraphQLArgument[] = [];
        const optionalArgs: GraphQLArgument[] = [];

        for (const arg of field.args) {
          if (isNonNull(arg.type)) {
            requiredArgs.push(arg);
          } else {
            optionalArgs.push(arg);
          }
        }

        const defaultFieldSelection = generateDefaultFieldSelection(
          returnType,
          schema.types
        );

        const queryTemplate = generateMutationTemplate(
          field,
          requiredArgs,
          defaultFieldSelection
        );

        const pattern: GraphQLQueryPattern = {
          id: `graphql:mutation:${field.name}`,
          queryName: field.name,
          operationType: 'mutation',
          returnType: returnTypeName,
          requiredArgs,
          optionalArgs,
          defaultFieldSelection,
          queryTemplate,
          confidence: 0.95,
        };

        patterns.push(pattern);
      }
    }
  }

  graphqlLogger.info('Generated query patterns', {
    endpoint: schema.endpoint,
    queryPatterns: patterns.filter((p) => p.operationType === 'query').length,
    mutationPatterns: patterns.filter((p) => p.operationType === 'mutation').length,
  });

  return patterns;
}

/**
 * Generate default field selection for a type (max 2 levels deep)
 */
function generateDefaultFieldSelection(
  type: GraphQLType | undefined,
  allTypes: Map<string, GraphQLType>,
  depth: number = 0,
  maxDepth: number = 2
): string[] {
  if (!type?.fields || depth >= maxDepth) {
    return [];
  }

  const selection: string[] = [];

  for (const field of type.fields) {
    // Skip internal fields
    if (field.name.startsWith('__')) continue;

    const baseTypeName = getBaseTypeName(field.type);

    // Include scalar fields directly
    if (BUILTIN_TYPE_NAMES.has(baseTypeName)) {
      selection.push(field.name);
      continue;
    }

    // For object types, only go one level deep
    if (depth < maxDepth - 1) {
      const nestedType = allTypes.get(baseTypeName);
      if (nestedType?.fields) {
        // Only include id and name-like fields from nested types
        const nestedFields = nestedType.fields
          .filter(
            (f) =>
              f.name === 'id' ||
              f.name === 'name' ||
              f.name === 'title' ||
              BUILTIN_TYPE_NAMES.has(getBaseTypeName(f.type))
          )
          .slice(0, 3)
          .map((f) => f.name);

        if (nestedFields.length > 0) {
          selection.push(`${field.name} { ${nestedFields.join(' ')} }`);
        }
      }
    }
  }

  return selection;
}

/**
 * Generate a query template string
 */
function generateQueryTemplate(
  field: GraphQLField,
  requiredArgs: GraphQLArgument[],
  fieldSelection: string[]
): string {
  const argDefs = requiredArgs.map(
    (a) => `$${a.name}: ${formatTypeRef(a.type)}`
  );
  const argUsage = requiredArgs.map((a) => `${a.name}: $${a.name}`);

  const argsDefStr = argDefs.length > 0 ? `(${argDefs.join(', ')})` : '';
  const argsUseStr = argUsage.length > 0 ? `(${argUsage.join(', ')})` : '';
  const selectionStr = fieldSelection.join(' ');

  return `query ${capitalizeFirst(field.name)}Query${argsDefStr} {
  ${field.name}${argsUseStr} {
    ${selectionStr || 'id'}
  }
}`;
}

/**
 * Generate a mutation template string
 */
function generateMutationTemplate(
  field: GraphQLField,
  requiredArgs: GraphQLArgument[],
  fieldSelection: string[]
): string {
  const argDefs = requiredArgs.map(
    (a) => `$${a.name}: ${formatTypeRef(a.type)}`
  );
  const argUsage = requiredArgs.map((a) => `${a.name}: $${a.name}`);

  const argsDefStr = argDefs.length > 0 ? `(${argDefs.join(', ')})` : '';
  const argsUseStr = argUsage.length > 0 ? `(${argUsage.join(', ')})` : '';
  const selectionStr = fieldSelection.join(' ');

  return `mutation ${capitalizeFirst(field.name)}Mutation${argsDefStr} {
  ${field.name}${argsUseStr} {
    ${selectionStr || 'id'}
  }
}`;
}

/**
 * Format a type reference for GraphQL query string
 */
function formatTypeRef(typeRef: GraphQLTypeRef): string {
  if (typeRef.kind === 'NON_NULL') {
    return `${formatTypeRef(typeRef.ofType!)}!`;
  }
  if (typeRef.kind === 'LIST') {
    return `[${formatTypeRef(typeRef.ofType!)}]`;
  }
  return typeRef.name || 'String';
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// MAIN DISCOVERY FUNCTION
// ============================================

/**
 * Discover GraphQL API for a domain
 */
export async function discoverGraphQL(
  domain: string,
  options: {
    headers?: Record<string, string>;
    fetchFn?: (url: string, options: RequestInit) => Promise<Response>;
    specificEndpoint?: string;
  } = {}
): Promise<GraphQLDiscoveryResult> {
  const { headers, fetchFn = fetch, specificEndpoint } = options;

  try {
    // Find GraphQL endpoints
    let endpoints: string[];
    if (specificEndpoint) {
      endpoints = [specificEndpoint];
    } else {
      endpoints = await probeGraphQLEndpoints(domain, fetchFn);
    }

    if (endpoints.length === 0) {
      return { found: false };
    }

    // Try introspection on the first endpoint
    const endpoint = endpoints[0];
    const introspection = await executeIntrospection(endpoint, headers, fetchFn);

    if (!introspection) {
      return {
        found: true,
        endpoint,
        introspectionDisabled: true,
        error: 'Introspection is disabled or failed',
      };
    }

    // Parse schema
    const schema = parseSchema(endpoint, introspection);

    // Generate patterns
    const patterns = generateQueryPatterns(schema);

    graphqlLogger.info('GraphQL discovery complete', {
      domain,
      endpoint,
      entityTypes: schema.entityTypes.length,
      patterns: patterns.length,
      paginationPattern: schema.paginationPattern,
    });

    return {
      found: true,
      endpoint,
      schema,
      patterns,
    };
  } catch (error) {
    graphqlLogger.error('GraphQL discovery failed', { domain, error });
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a domain likely has GraphQL based on known indicators
 */
export function isLikelyGraphQL(domain: string): boolean {
  // Known GraphQL API providers
  const graphqlDomains = [
    'github.com',
    'gitlab.com',
    'shopify.com',
    'contentful.com',
    'datocms.com',
    'hygraph.com',
    'hasura.io',
    'fauna.com',
    'sanity.io',
  ];

  return graphqlDomains.some(
    (d) => domain.includes(d) || domain.endsWith(d)
  );
}
