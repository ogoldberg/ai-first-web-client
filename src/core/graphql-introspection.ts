/**
 * GraphQL Introspection Discovery Module (D-001)
 *
 * Automatically discovers GraphQL endpoints and introspects their schemas
 * to generate query patterns for the API learning system.
 *
 * This module:
 * 1. Probes common GraphQL endpoint locations
 * 2. Performs GraphQL introspection queries
 * 3. Parses schema to extract query/mutation types
 * 4. Generates API patterns from discovered operations
 * 5. Integrates with the pattern registry for storage
 */

import { logger } from '../utils/logger.js';
import type {
  ContentMapping,
  GraphQLArgument,
  GraphQLDiscoveryOptions,
  GraphQLDiscoveryResult,
  GraphQLField,
  GraphQLPatternGenerationResult,
  GraphQLQueryPattern,
  GraphQLType,
  GraphQLTypeKind,
  GraphQLTypeRef,
  LearnedApiPattern,
  ParsedGraphQLSchema,
  PatternValidation,
  VariableExtractor,
} from '../types/api-patterns.js';
import { GRAPHQL_PROBE_LOCATIONS } from '../types/api-patterns.js';

const gqlLogger = logger.create('GraphQLIntrospection');

// ============================================
// CONSTANTS
// ============================================

/** Default timeout for probing each location */
const DEFAULT_PROBE_TIMEOUT = 5000;

/** Maximum number of query patterns to generate per schema */
const MAX_PATTERNS_PER_SCHEMA = 50;

/** Minimum confidence for patterns generated from GraphQL introspection */
const GRAPHQL_PATTERN_CONFIDENCE = 0.95;

/** Initial success count for GraphQL-derived patterns (high trust) */
const GRAPHQL_INITIAL_SUCCESS_COUNT = 100;

/** Maximum depth for nested type traversal */
const DEFAULT_MAX_TYPE_DEPTH = 3;

/** Fields to exclude from auto-generated selections */
const EXCLUDED_FIELDS = new Set(['__typename', '__schema', '__type']);

/** Common pagination argument names */
const PAGINATION_ARGS = {
  relay: ['first', 'after', 'last', 'before'],
  offset: ['limit', 'offset', 'skip', 'take'],
  cursor: ['cursor', 'pageSize', 'page'],
};

// ============================================
// INTROSPECTION QUERY
// ============================================

/**
 * Standard GraphQL introspection query
 * This is the full introspection query that returns the complete schema
 */
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
            defaultValue
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
          defaultValue
        }
        interfaces {
          kind
          name
        }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes {
          kind
          name
        }
      }
      directives {
        name
        description
        locations
      }
    }
  }
`;

/**
 * Minimal query to detect if an endpoint is GraphQL
 */
const DETECTION_QUERY = `
  query { __typename }
`;

// ============================================
// GRAPHQL DISCOVERY
// ============================================

/**
 * Discover GraphQL endpoint and optionally introspect schema
 */
export async function discoverGraphQL(
  domain: string,
  options: GraphQLDiscoveryOptions = {}
): Promise<GraphQLDiscoveryResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_PROBE_TIMEOUT * GRAPHQL_PROBE_LOCATIONS.length;
  const probeLocations = options.probeLocations ?? [...GRAPHQL_PROBE_LOCATIONS];
  const probedLocations: string[] = [];
  const fullIntrospection = options.fullIntrospection !== false;

  // Ensure domain has protocol
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedBase = new URL(baseUrl);
  const origin = parsedBase.origin;

  gqlLogger.debug('Starting GraphQL discovery', { domain, probeLocations: probeLocations.length });

  for (const location of probeLocations) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      gqlLogger.debug('Discovery timeout reached', { domain, probed: probedLocations.length });
      break;
    }

    const endpointUrl = `${origin}${location}`;
    probedLocations.push(endpointUrl);

    try {
      // First, try to detect if this is a GraphQL endpoint
      const isGraphQL = await detectGraphQLEndpoint(endpointUrl, options);

      if (!isGraphQL) {
        continue;
      }

      gqlLogger.debug('GraphQL endpoint detected', { endpointUrl });

      // If we just want detection, return now
      if (!fullIntrospection) {
        return {
          found: true,
          introspectionEnabled: false, // Unknown without introspection
          endpointUrl,
          probedLocations,
          discoveryTime: Date.now() - startTime,
        };
      }

      // Perform full introspection
      const schema = await introspectSchema(endpointUrl, options);

      if (schema) {
        gqlLogger.info('GraphQL schema introspected', {
          domain,
          endpointUrl,
          queryFields: schema.types.find(t => t.name === schema.queryType)?.fields?.length ?? 0,
        });

        return {
          found: true,
          introspectionEnabled: true,
          schema,
          endpointUrl,
          probedLocations,
          discoveryTime: Date.now() - startTime,
        };
      }

      // Endpoint exists but introspection is disabled
      return {
        found: true,
        introspectionEnabled: false,
        endpointUrl,
        probedLocations,
        discoveryTime: Date.now() - startTime,
        error: 'Introspection is disabled on this endpoint',
      };
    } catch (error) {
      gqlLogger.debug('Probe failed', {
        endpointUrl,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  gqlLogger.debug('No GraphQL endpoint found', { domain, probed: probedLocations.length });

  return {
    found: false,
    introspectionEnabled: false,
    probedLocations,
    discoveryTime: Date.now() - startTime,
  };
}

/**
 * Detect if a URL is a GraphQL endpoint
 */
async function detectGraphQLEndpoint(
  url: string,
  options: GraphQLDiscoveryOptions
): Promise<boolean> {
  try {
    const response = await fetchGraphQL(url, DETECTION_QUERY, options);

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    // GraphQL endpoints return { data: { __typename: ... } } or { errors: [...] }
    // Both indicate a GraphQL endpoint
    if (data.data !== undefined || Array.isArray(data.errors)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Perform GraphQL introspection query
 */
async function introspectSchema(
  url: string,
  options: GraphQLDiscoveryOptions
): Promise<ParsedGraphQLSchema | null> {
  try {
    const response = await fetchGraphQL(url, INTROSPECTION_QUERY, options);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Check for introspection errors (some servers disable it)
    if (data.errors && !data.data) {
      gqlLogger.debug('Introspection returned errors', { errors: data.errors });
      return null;
    }

    const schema = data.data?.__schema;
    if (!schema) {
      return null;
    }

    return parseIntrospectionResult(schema, url);
  } catch (error) {
    gqlLogger.debug('Introspection failed', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Make a GraphQL request
 */
async function fetchGraphQL(
  url: string,
  query: string,
  options: GraphQLDiscoveryOptions
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_PROBE_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'LLM-Browser-MCP/1.0 (GraphQL Discovery)',
        ...options.headers,
      },
      body: JSON.stringify({ query }),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// SCHEMA PARSING
// ============================================

/**
 * Parse introspection result into our schema format
 */
function parseIntrospectionResult(
  schema: Record<string, unknown>,
  endpointUrl: string
): ParsedGraphQLSchema {
  const queryType = (schema.queryType as { name: string })?.name || 'Query';
  const mutationType = (schema.mutationType as { name: string })?.name;
  const subscriptionType = (schema.subscriptionType as { name: string })?.name;

  const rawTypes = (schema.types as Array<Record<string, unknown>>) || [];
  const types = rawTypes
    .filter((t): t is Record<string, unknown> => t && typeof t === 'object')
    .map(parseGraphQLType)
    .filter((t): t is GraphQLType => t !== null);

  const rawDirectives = (schema.directives as Array<Record<string, unknown>>) || [];
  const directives = rawDirectives
    .filter((d): d is Record<string, unknown> => d && typeof d === 'object')
    .map(d => ({
      name: d.name as string,
      description: d.description as string | undefined,
      locations: (d.locations as string[]) || [],
    }));

  return {
    queryType,
    mutationType,
    subscriptionType,
    types,
    directives: directives.length > 0 ? directives : undefined,
    discoveredAt: Date.now(),
    endpointUrl,
  };
}

/**
 * Parse a GraphQL type from introspection
 */
function parseGraphQLType(type: Record<string, unknown>): GraphQLType | null {
  const kind = type.kind as GraphQLTypeKind;
  const name = type.name as string;

  if (!kind || !name) {
    return null;
  }

  // Skip internal types
  if (name.startsWith('__')) {
    return null;
  }

  const result: GraphQLType = {
    kind,
    name,
    description: type.description as string | undefined,
  };

  // Parse fields for OBJECT and INTERFACE types
  if (type.fields && Array.isArray(type.fields)) {
    result.fields = (type.fields as Array<Record<string, unknown>>)
      .filter((f): f is Record<string, unknown> => f && typeof f === 'object')
      .map(parseGraphQLField)
      .filter((f): f is GraphQLField => f !== null);
  }

  // Parse input fields for INPUT_OBJECT types
  if (type.inputFields && Array.isArray(type.inputFields)) {
    result.inputFields = (type.inputFields as Array<Record<string, unknown>>)
      .filter((f): f is Record<string, unknown> => f && typeof f === 'object')
      .map(parseGraphQLArgument)
      .filter((a): a is GraphQLArgument => a !== null);
  }

  // Parse interfaces
  if (type.interfaces && Array.isArray(type.interfaces)) {
    result.interfaces = (type.interfaces as Array<Record<string, unknown>>)
      .filter((i): i is Record<string, unknown> => i && typeof i === 'object')
      .map(parseTypeRef)
      .filter((i): i is GraphQLTypeRef => i !== null);
  }

  // Parse enum values
  if (type.enumValues && Array.isArray(type.enumValues)) {
    result.enumValues = (type.enumValues as Array<Record<string, unknown>>)
      .filter((e): e is Record<string, unknown> => e && typeof e === 'object')
      .map(e => ({
        name: e.name as string,
        description: e.description as string | undefined,
        isDeprecated: Boolean(e.isDeprecated),
        deprecationReason: e.deprecationReason as string | undefined,
      }));
  }

  // Parse possible types for UNION and INTERFACE
  if (type.possibleTypes && Array.isArray(type.possibleTypes)) {
    result.possibleTypes = (type.possibleTypes as Array<Record<string, unknown>>)
      .filter((p): p is Record<string, unknown> => p && typeof p === 'object')
      .map(parseTypeRef)
      .filter((p): p is GraphQLTypeRef => p !== null);
  }

  return result;
}

/**
 * Parse a GraphQL field from introspection
 */
function parseGraphQLField(field: Record<string, unknown>): GraphQLField | null {
  const name = field.name as string;
  const type = parseTypeRef(field.type as Record<string, unknown>);

  if (!name || !type) {
    return null;
  }

  const rawArgs = (field.args as Array<Record<string, unknown>>) || [];
  const args = rawArgs
    .filter((a): a is Record<string, unknown> => a && typeof a === 'object')
    .map(parseGraphQLArgument)
    .filter((a): a is GraphQLArgument => a !== null);

  return {
    name,
    description: field.description as string | undefined,
    args,
    type,
    isDeprecated: Boolean(field.isDeprecated),
    deprecationReason: field.deprecationReason as string | undefined,
  };
}

/**
 * Parse a GraphQL argument from introspection
 */
function parseGraphQLArgument(arg: Record<string, unknown>): GraphQLArgument | null {
  const name = arg.name as string;
  const type = parseTypeRef(arg.type as Record<string, unknown>);

  if (!name || !type) {
    return null;
  }

  return {
    name,
    description: arg.description as string | undefined,
    type,
    defaultValue: arg.defaultValue as string | undefined,
  };
}

/**
 * Parse a GraphQL type reference
 */
function parseTypeRef(type: Record<string, unknown> | null | undefined): GraphQLTypeRef | null {
  if (!type || typeof type !== 'object') {
    return null;
  }

  const kind = type.kind as GraphQLTypeKind;
  if (!kind) {
    return null;
  }

  const result: GraphQLTypeRef = { kind };

  if (type.name) {
    result.name = type.name as string;
  }

  if (type.ofType) {
    result.ofType = parseTypeRef(type.ofType as Record<string, unknown>) ?? undefined;
  }

  return result;
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Generate LearnedApiPattern objects from a GraphQL schema
 */
export function generatePatternsFromSchema(
  schema: ParsedGraphQLSchema,
  domain: string
): GraphQLPatternGenerationResult {
  const patternIds: string[] = [];
  const skippedFields: GraphQLPatternGenerationResult['skippedFields'] = [];
  const warnings: string[] = [];
  const patterns: LearnedApiPattern[] = [];
  const queryPatterns: GraphQLQueryPattern[] = [];

  // Find the query type
  const queryType = schema.types.find(t => t.name === schema.queryType);
  if (!queryType || !queryType.fields) {
    warnings.push('No query type found in schema');
    return {
      patternsGenerated: 0,
      patternIds: [],
      queryPatterns: [],
      skippedFields: [],
      warnings,
    };
  }

  // Generate patterns for each query field
  let patternCount = 0;
  for (const field of queryType.fields) {
    if (patternCount >= MAX_PATTERNS_PER_SCHEMA) {
      warnings.push(`Schema has more than ${MAX_PATTERNS_PER_SCHEMA} query fields, limited`);
      break;
    }

    // Skip deprecated fields
    if (field.isDeprecated) {
      skippedFields.push({
        fieldName: field.name,
        reason: 'Deprecated field',
      });
      continue;
    }

    // Skip fields with too many required arguments
    const requiredArgs = field.args.filter(a => isNonNull(a.type));
    if (requiredArgs.length > 3) {
      skippedFields.push({
        fieldName: field.name,
        reason: 'Too many required arguments',
      });
      continue;
    }

    // Skip internal fields
    if (EXCLUDED_FIELDS.has(field.name)) {
      continue;
    }

    try {
      const queryPattern = createQueryPattern(field, schema);
      queryPatterns.push(queryPattern);

      const pattern = createPatternFromQueryField(schema, field, domain, queryPattern);
      if (pattern) {
        patterns.push(pattern);
        patternIds.push(pattern.id);
        patternCount++;
      }
    } catch (error) {
      skippedFields.push({
        fieldName: field.name,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  gqlLogger.info('Generated patterns from GraphQL schema', {
    domain,
    total: patterns.length,
    skipped: skippedFields.length,
  });

  return {
    patternsGenerated: patterns.length,
    patternIds,
    queryPatterns,
    skippedFields,
    warnings,
  };
}

/**
 * Create a GraphQL query pattern from a field
 */
function createQueryPattern(
  field: GraphQLField,
  schema: ParsedGraphQLSchema
): GraphQLQueryPattern {
  const requiredArgs = field.args.filter(a => isNonNull(a.type));
  const optionalArgs = field.args.filter(a => !isNonNull(a.type));

  // Detect if this is a list query
  const isList = isListType(field.type);

  // Detect pagination
  const { supportsPagination, paginationStyle } = detectPagination(field.args);

  // Generate suggested field selections
  const returnTypeName = getBaseTypeName(field.type);
  const suggestedFields = generateFieldSelections(returnTypeName, schema);

  // Generate query template
  const queryTemplate = generateQueryTemplate(field, suggestedFields);

  return {
    fieldName: field.name,
    description: field.description,
    requiredArgs,
    optionalArgs,
    returnType: field.type,
    queryTemplate,
    suggestedFields,
    isList,
    supportsPagination,
    paginationStyle,
  };
}

/**
 * Create a LearnedApiPattern from a GraphQL query field
 */
function createPatternFromQueryField(
  schema: ParsedGraphQLSchema,
  field: GraphQLField,
  domain: string,
  queryPattern: GraphQLQueryPattern
): LearnedApiPattern | null {
  const now = Date.now();
  const id = `graphql:${domain}:${field.name}:${now}`;

  // Build URL patterns that would match this GraphQL endpoint
  const escapedDomain = domain.replace(/\./g, '\\.');
  const urlPatterns = [`^https?://(www\\.)?${escapedDomain}.*`];

  // Create extractors for required arguments
  const extractors = createExtractorsFromArgs(field.args.filter(a => isNonNull(a.type)));

  // Create content mapping
  const contentMapping = createContentMappingForGraphQL(field, schema);

  // Create validation rules
  const validation = createValidationForGraphQL(field);

  return {
    id,
    templateType: 'query-api', // GraphQL is essentially a query-based API
    urlPatterns,
    endpointTemplate: schema.endpointUrl,
    extractors,
    method: 'POST', // GraphQL uses POST
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    responseFormat: 'json',
    contentMapping,
    validation,
    metrics: {
      successCount: GRAPHQL_INITIAL_SUCCESS_COUNT,
      failureCount: 0,
      confidence: GRAPHQL_PATTERN_CONFIDENCE,
      domains: [domain],
      lastSuccess: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate field selections for a type
 */
function generateFieldSelections(
  typeName: string | undefined,
  schema: ParsedGraphQLSchema,
  depth = 0,
  visited = new Set<string>()
): string[] {
  if (!typeName || depth > DEFAULT_MAX_TYPE_DEPTH || visited.has(typeName)) {
    return [];
  }

  visited.add(typeName);

  const type = schema.types.find(t => t.name === typeName);
  if (!type || !type.fields) {
    return [];
  }

  const selections: string[] = [];

  for (const field of type.fields) {
    // Skip internal fields
    if (EXCLUDED_FIELDS.has(field.name)) {
      continue;
    }

    const baseTypeName = getBaseTypeName(field.type);
    const fieldType = schema.types.find(t => t.name === baseTypeName);

    // For scalar types, just add the field name
    if (!fieldType || fieldType.kind === 'SCALAR' || fieldType.kind === 'ENUM') {
      selections.push(field.name);
    } else if (fieldType.kind === 'OBJECT' && depth < DEFAULT_MAX_TYPE_DEPTH) {
      // For objects, add nested selections
      const nestedSelections = generateFieldSelections(
        baseTypeName,
        schema,
        depth + 1,
        new Set(visited)
      );
      if (nestedSelections.length > 0) {
        selections.push(`${field.name} { ${nestedSelections.slice(0, 5).join(' ')} }`);
      }
    }

    // Limit selections to avoid huge queries
    if (selections.length >= 10) {
      break;
    }
  }

  return selections;
}

/**
 * Generate a query template for a field
 */
function generateQueryTemplate(
  field: GraphQLField,
  suggestedFields: string[]
): string {
  const args = field.args
    .filter(a => isNonNull(a.type))
    .map(a => `$${a.name}: ${formatTypeRef(a.type)}`);

  const argsList = args.length > 0 ? `(${args.join(', ')})` : '';

  const fieldArgs = field.args
    .filter(a => isNonNull(a.type))
    .map(a => `${a.name}: $${a.name}`);

  const fieldArgsList = fieldArgs.length > 0 ? `(${fieldArgs.join(', ')})` : '';

  const selections = suggestedFields.length > 0
    ? suggestedFields.join(' ')
    : 'id';

  return `query${argsList} { ${field.name}${fieldArgsList} { ${selections} } }`;
}

/**
 * Format a type reference as a GraphQL type string
 */
function formatTypeRef(type: GraphQLTypeRef): string {
  if (type.kind === 'NON_NULL') {
    return `${formatTypeRef(type.ofType!)}!`;
  }
  if (type.kind === 'LIST') {
    return `[${formatTypeRef(type.ofType!)}]`;
  }
  return type.name || 'Unknown';
}

/**
 * Check if a type is NON_NULL (required)
 */
function isNonNull(type: GraphQLTypeRef): boolean {
  return type.kind === 'NON_NULL';
}

/**
 * Check if a type is a list type
 */
function isListType(type: GraphQLTypeRef): boolean {
  if (type.kind === 'LIST') {
    return true;
  }
  if (type.kind === 'NON_NULL' && type.ofType) {
    return isListType(type.ofType);
  }
  return false;
}

/**
 * Get the base type name (unwrapping NON_NULL and LIST)
 */
function getBaseTypeName(type: GraphQLTypeRef): string | undefined {
  if (type.name) {
    return type.name;
  }
  if (type.ofType) {
    return getBaseTypeName(type.ofType);
  }
  return undefined;
}

/**
 * Detect pagination style from arguments
 */
function detectPagination(args: GraphQLArgument[]): {
  supportsPagination: boolean;
  paginationStyle?: 'relay' | 'offset' | 'cursor';
} {
  const argNames = args.map(a => a.name.toLowerCase());

  // Check for Relay-style pagination
  if (PAGINATION_ARGS.relay.some(a => argNames.includes(a))) {
    return { supportsPagination: true, paginationStyle: 'relay' };
  }

  // Check for offset-style pagination
  if (PAGINATION_ARGS.offset.some(a => argNames.includes(a))) {
    return { supportsPagination: true, paginationStyle: 'offset' };
  }

  // Check for cursor-style pagination
  if (PAGINATION_ARGS.cursor.some(a => argNames.includes(a))) {
    return { supportsPagination: true, paginationStyle: 'cursor' };
  }

  return { supportsPagination: false };
}

/**
 * Create variable extractors from GraphQL arguments
 */
function createExtractorsFromArgs(args: GraphQLArgument[]): VariableExtractor[] {
  return args.map(arg => ({
    name: arg.name,
    source: 'query' as const,
    pattern: `[?&]${arg.name}=([^&]+)`,
    group: 1,
  }));
}

/**
 * Create content mapping for GraphQL response
 */
function createContentMappingForGraphQL(
  field: GraphQLField,
  schema: ParsedGraphQLSchema
): ContentMapping {
  const mapping: ContentMapping = {
    title: 'title',
  };

  const returnTypeName = getBaseTypeName(field.type);
  if (returnTypeName) {
    const returnType = schema.types.find(t => t.name === returnTypeName);
    if (returnType?.fields) {
      const fieldNames = returnType.fields.map(f => f.name.toLowerCase());

      // Map common field names
      if (fieldNames.includes('title')) mapping.title = `data.${field.name}.title`;
      else if (fieldNames.includes('name')) mapping.title = `data.${field.name}.name`;
      else if (fieldNames.includes('subject')) mapping.title = `data.${field.name}.subject`;

      if (fieldNames.includes('description')) mapping.description = `data.${field.name}.description`;
      else if (fieldNames.includes('summary')) mapping.description = `data.${field.name}.summary`;
      else if (fieldNames.includes('excerpt')) mapping.description = `data.${field.name}.excerpt`;

      if (fieldNames.includes('body')) mapping.body = `data.${field.name}.body`;
      else if (fieldNames.includes('content')) mapping.body = `data.${field.name}.content`;
      else if (fieldNames.includes('text')) mapping.body = `data.${field.name}.text`;
    }
  }

  return mapping;
}

/**
 * Create validation rules for GraphQL response
 */
function createValidationForGraphQL(field: GraphQLField): PatternValidation {
  return {
    requiredFields: ['data'],
    minContentLength: 20,
  };
}

// ============================================
// CACHING
// ============================================

/**
 * Cache for discovered GraphQL schemas
 * Key: domain, Value: discovery result
 */
const schemaCache = new Map<string, { result: GraphQLDiscoveryResult; timestamp: number }>();

/** How long to cache discovery results (1 hour) */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get cached discovery result or discover anew
 */
export async function discoverGraphQLCached(
  domain: string,
  options: GraphQLDiscoveryOptions = {}
): Promise<GraphQLDiscoveryResult> {
  const cached = schemaCache.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    gqlLogger.debug('Using cached GraphQL discovery result', { domain });
    return cached.result;
  }

  const result = await discoverGraphQL(domain, options);
  schemaCache.set(domain, { result, timestamp: Date.now() });
  return result;
}

/**
 * Clear the schema cache
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

/**
 * Get all generated patterns from a GraphQL schema
 * This is the main entry point for pattern generation
 */
export function generatePatternsFromGraphQLSchema(
  schema: ParsedGraphQLSchema
): LearnedApiPattern[] {
  const domain = new URL(schema.endpointUrl).hostname;
  const result = generatePatternsFromSchema(schema, domain);

  // Convert queryPatterns to LearnedApiPatterns
  const patterns: LearnedApiPattern[] = [];
  const queryType = schema.types.find(t => t.name === schema.queryType);

  if (queryType?.fields) {
    for (const queryPattern of result.queryPatterns) {
      const field = queryType.fields.find(f => f.name === queryPattern.fieldName);
      if (field) {
        const pattern = createPatternFromQueryField(schema, field, domain, queryPattern);
        if (pattern) {
          patterns.push(pattern);
        }
      }
    }
  }

  return patterns;
}

// ============================================
// EXPORTS FOR TESTING
// ============================================

export {
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
};
