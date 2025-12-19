/**
 * OpenAPI/Swagger Discovery Module (D-004 Enhanced)
 *
 * Automatically discovers OpenAPI/Swagger specifications for websites
 * and generates LearnedApiPattern objects from them.
 *
 * This module:
 * 1. Probes common OpenAPI/Swagger spec locations
 * 2. Parses OpenAPI 3.x and Swagger 2.x specifications with full YAML support
 * 3. Resolves $ref pointers for complete schema access
 * 4. Generates API patterns from discovered endpoints (GET, POST, PUT, DELETE)
 * 5. Extracts rate limit information from x-ratelimit extensions
 * 6. Integrates with ApiPatternRegistry for pattern storage
 */

import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import { resolveRefs, hasRefs } from '../utils/json-ref-resolver.js';
import type {
  ContentMapping,
  LearnedApiPattern,
  OpenAPIDiscoveryOptions,
  OpenAPIDiscoveryResult,
  OpenAPIEndpoint,
  OpenAPIParameter,
  OpenAPIPatternGenerationResult,
  OpenAPIRateLimitInfo,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPIVersion,
  ParsedOpenAPISpec,
  PatternValidation,
  VariableExtractor,
} from '../types/api-patterns.js';
import { OPENAPI_PROBE_LOCATIONS } from '../types/api-patterns.js';

const discoveryLogger = logger.create('OpenAPIDiscovery');

// ============================================
// CONSTANTS
// ============================================

/** Default timeout for probing each location */
const DEFAULT_PROBE_TIMEOUT = 5000;

/** Maximum number of endpoints to convert to patterns per spec */
const MAX_ENDPOINTS_PER_SPEC = 50;

/** Minimum confidence for patterns generated from OpenAPI specs */
const OPENAPI_PATTERN_CONFIDENCE = 0.9;

/** Initial success count for OpenAPI-derived patterns (high trust) */
const OPENAPI_INITIAL_SUCCESS_COUNT = 100;

// ============================================
// OPENAPI DISCOVERY
// ============================================

/**
 * Discover OpenAPI/Swagger specification for a domain
 */
export async function discoverOpenAPI(
  domain: string,
  options: OpenAPIDiscoveryOptions = {}
): Promise<OpenAPIDiscoveryResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_PROBE_TIMEOUT * OPENAPI_PROBE_LOCATIONS.length;
  const probeLocations = options.probeLocations ?? [...OPENAPI_PROBE_LOCATIONS];
  const probedLocations: string[] = [];

  // Ensure domain has protocol
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedBase = new URL(baseUrl);
  const origin = parsedBase.origin;

  discoveryLogger.debug('Starting OpenAPI discovery', { domain, probeLocations: probeLocations.length });

  for (const location of probeLocations) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      discoveryLogger.debug('Discovery timeout reached', { domain, probed: probedLocations.length });
      break;
    }

    // Skip if matches skip patterns
    if (options.skipPatterns?.some(pattern => location.includes(pattern))) {
      continue;
    }

    const specUrl = `${origin}${location}`;
    probedLocations.push(specUrl);

    try {
      const response = await fetchWithTimeout(specUrl, {
        timeout: DEFAULT_PROBE_TIMEOUT,
        headers: {
          'Accept': 'application/json, application/yaml, text/yaml, */*',
          'User-Agent': 'LLM-Browser-MCP/1.0 (OpenAPI Discovery)',
          ...options.headers,
        },
      });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      // Try to parse as OpenAPI spec
      const spec = await parseOpenAPISpec(text, specUrl, contentType, options);
      if (spec) {
        discoveryLogger.info('OpenAPI spec discovered', {
          domain,
          specUrl,
          version: spec.version,
          endpoints: spec.endpoints.length,
        });

        return {
          found: true,
          spec,
          specUrl,
          probedLocations,
          discoveryTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      // Silently continue to next location
      discoveryLogger.debug('Probe failed', { specUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }

  discoveryLogger.debug('No OpenAPI spec found', { domain, probed: probedLocations.length });

  return {
    found: false,
    probedLocations,
    discoveryTime: Date.now() - startTime,
  };
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: { timeout: number; headers?: Record<string, string> }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: options.headers,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// SPEC PARSING
// ============================================

/**
 * Parse OpenAPI/Swagger specification from text
 */
async function parseOpenAPISpec(
  text: string,
  specUrl: string,
  contentType: string,
  options: OpenAPIDiscoveryOptions
): Promise<ParsedOpenAPISpec | null> {
  let spec: Record<string, unknown> | null = null;

  // Try JSON first
  try {
    spec = JSON.parse(text);
  } catch {
    // Try YAML if enabled and JSON failed
    if (options.parseYaml !== false && (
      contentType.includes('yaml') ||
      specUrl.endsWith('.yaml') ||
      specUrl.endsWith('.yml') ||
      text.trimStart().startsWith('openapi:') ||
      text.trimStart().startsWith('swagger:')
    )) {
      spec = parseYaml(text);
    }
  }

  if (!spec) {
    return null;
  }

  // Validate it looks like an OpenAPI spec
  if (!isOpenAPISpec(spec)) {
    return null;
  }

  // Resolve $ref pointers for complete schema access
  if (hasRefs(spec)) {
    discoveryLogger.debug('Resolving $ref pointers', { specUrl });
    const { resolved, resolvedRefs, circularRefs, errors } = resolveRefs(spec);
    spec = resolved;

    if (resolvedRefs.length > 0) {
      discoveryLogger.debug('Resolved references', {
        specUrl,
        resolved: resolvedRefs.length,
        circular: circularRefs.length,
        errors: errors.length,
      });
    }
  }

  // Determine version
  const version = getOpenAPIVersion(spec);
  if (!version) {
    return null;
  }

  // Parse based on version
  if (version === '2.0') {
    return parseSwagger2(spec, specUrl);
  } else {
    return parseOpenAPI3(spec, specUrl, version);
  }
}

/**
 * Parse YAML using js-yaml library
 * Handles anchors, aliases, multi-line strings, and complex YAML features
 */
function parseYaml(text: string): Record<string, unknown> | null {
  try {
    const parsed = yaml.load(text, {
      schema: yaml.JSON_SCHEMA, // Use JSON-compatible schema for OpenAPI
    });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (error) {
    discoveryLogger.debug('YAML parse error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if object looks like an OpenAPI spec
 */
function isOpenAPISpec(obj: Record<string, unknown>): boolean {
  // OpenAPI 3.x has 'openapi' field
  if (typeof obj.openapi === 'string' && obj.openapi.startsWith('3.')) {
    return true;
  }
  // Swagger 2.x has 'swagger' field
  if (obj.swagger === '2.0') {
    return true;
  }
  return false;
}

/**
 * Get OpenAPI version from spec
 */
function getOpenAPIVersion(spec: Record<string, unknown>): OpenAPIVersion | null {
  if (spec.swagger === '2.0') {
    return '2.0';
  }
  if (typeof spec.openapi === 'string') {
    if (spec.openapi.startsWith('3.1')) {
      return '3.1';
    }
    if (spec.openapi.startsWith('3.0')) {
      return '3.0';
    }
  }
  return null;
}

/**
 * Parse Swagger 2.0 specification
 */
function parseSwagger2(spec: Record<string, unknown>, specUrl: string): ParsedOpenAPISpec {
  const info = spec.info as Record<string, unknown> || {};
  const paths = spec.paths as Record<string, Record<string, unknown>> || {};

  // Build base URL from host, basePath, schemes
  const host = spec.host as string || new URL(specUrl).host;
  const basePath = spec.basePath as string || '';
  const schemes = spec.schemes as string[] || ['https'];
  const baseUrl = `${schemes[0]}://${host}${basePath}`;

  // Parse security definitions
  const securityDefinitions = spec.securityDefinitions as Record<string, Record<string, unknown>> || {};
  const securitySchemes = parseSecurityDefinitions(securityDefinitions);

  // Parse endpoints
  const endpoints = parseSwagger2Paths(paths);

  return {
    version: '2.0',
    title: (info.title as string) || 'Unknown API',
    description: info.description as string,
    baseUrl,
    endpoints,
    securitySchemes,
    discoveredAt: Date.now(),
    specUrl,
  };
}

/**
 * Parse OpenAPI 3.x specification
 */
function parseOpenAPI3(
  spec: Record<string, unknown>,
  specUrl: string,
  version: '3.0' | '3.1'
): ParsedOpenAPISpec {
  const info = spec.info as Record<string, unknown> || {};
  const paths = spec.paths as Record<string, Record<string, unknown>> || {};
  const servers = spec.servers as Array<{ url: string; description?: string }> || [];

  // Get base URL from servers or spec URL
  let baseUrl = servers[0]?.url || '';
  if (!baseUrl) {
    baseUrl = new URL(specUrl).origin;
  } else if (baseUrl.startsWith('/')) {
    // Relative URL - combine with spec URL origin
    baseUrl = new URL(specUrl).origin + baseUrl;
  } else if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }

  // Parse security schemes
  const components = spec.components as Record<string, unknown> || {};
  const securitySchemesRaw = components.securitySchemes as Record<string, Record<string, unknown>> || {};
  const securitySchemes = parseSecuritySchemes3(securitySchemesRaw);

  // Parse endpoints
  const endpoints = parseOpenAPI3Paths(paths);

  // Extract rate limit info from x-ratelimit extensions
  const rateLimit = extractRateLimitInfo(spec, info);

  return {
    version,
    title: (info.title as string) || 'Unknown API',
    description: info.description as string,
    baseUrl,
    endpoints,
    securitySchemes,
    rateLimit,
    discoveredAt: Date.now(),
    specUrl,
  };
}

/**
 * Extract rate limit information from x-ratelimit extensions
 * Looks in spec root, info object, and components for rate limit headers
 */
function extractRateLimitInfo(
  spec: Record<string, unknown>,
  info: Record<string, unknown>
): OpenAPIRateLimitInfo | undefined {
  const rateLimit: OpenAPIRateLimitInfo = {};

  // Check common x-ratelimit extension locations
  const sources = [spec, info];

  for (const source of sources) {
    // x-ratelimit-limit: number of requests allowed
    if (typeof source['x-ratelimit-limit'] === 'number') {
      rateLimit.limit = source['x-ratelimit-limit'] as number;
    } else if (typeof source['x-rate-limit'] === 'number') {
      rateLimit.limit = source['x-rate-limit'] as number;
    }

    // x-ratelimit-window: time window in seconds
    if (typeof source['x-ratelimit-window'] === 'number') {
      rateLimit.windowSeconds = source['x-ratelimit-window'] as number;
    } else if (typeof source['x-rate-limit-window'] === 'number') {
      rateLimit.windowSeconds = source['x-rate-limit-window'] as number;
    }

    // Header names for rate limiting
    if (typeof source['x-ratelimit-headers'] === 'object') {
      const headers = source['x-ratelimit-headers'] as Record<string, string>;
      rateLimit.limitHeader = headers.limit || headers['x-ratelimit-limit'];
      rateLimit.remainingHeader = headers.remaining || headers['x-ratelimit-remaining'];
      rateLimit.resetHeader = headers.reset || headers['x-ratelimit-reset'];
    }
  }

  // Check for common rate limit header patterns in spec
  // Some APIs define these in response headers
  const components = spec.components as Record<string, unknown> || {};
  const headersComp = components.headers as Record<string, Record<string, unknown>> || {};

  for (const [name, headerDef] of Object.entries(headersComp)) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('ratelimit') || lowerName.includes('rate-limit')) {
      if (lowerName.includes('limit') && !lowerName.includes('remaining') && !lowerName.includes('reset')) {
        rateLimit.limitHeader = name;
      } else if (lowerName.includes('remaining')) {
        rateLimit.remainingHeader = name;
      } else if (lowerName.includes('reset')) {
        rateLimit.resetHeader = name;
      }
    }
  }

  // Only return if we found any rate limit info
  if (Object.keys(rateLimit).length === 0) {
    return undefined;
  }

  return rateLimit;
}

/**
 * Parse Swagger 2.0 paths to endpoints
 */
function parseSwagger2Paths(paths: Record<string, Record<string, unknown>>): OpenAPIEndpoint[] {
  const endpoints: OpenAPIEndpoint[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const method of methods) {
      const operation = pathItem[method] as Record<string, unknown>;
      if (!operation) continue;

      const endpoint = parseSwagger2Operation(path, method.toUpperCase() as OpenAPIEndpoint['method'], operation, pathItem);
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }
  }

  return endpoints;
}

/**
 * Parse OpenAPI 3.x paths to endpoints
 */
function parseOpenAPI3Paths(paths: Record<string, Record<string, unknown>>): OpenAPIEndpoint[] {
  const endpoints: OpenAPIEndpoint[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    // Get path-level parameters
    const pathParameters = (pathItem.parameters as Array<Record<string, unknown>>) || [];

    for (const method of methods) {
      const operation = pathItem[method] as Record<string, unknown>;
      if (!operation) continue;

      const endpoint = parseOpenAPI3Operation(path, method.toUpperCase() as OpenAPIEndpoint['method'], operation, pathParameters);
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }
  }

  return endpoints;
}

/**
 * Parse Swagger 2.0 operation
 */
function parseSwagger2Operation(
  path: string,
  method: OpenAPIEndpoint['method'],
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>
): OpenAPIEndpoint | null {
  // Combine path-level and operation-level parameters
  const pathParameters = (pathItem.parameters as Array<Record<string, unknown>>) || [];
  const opParameters = (operation.parameters as Array<Record<string, unknown>>) || [];
  const allParameters = [...pathParameters, ...opParameters];

  const parameters: OpenAPIParameter[] = allParameters
    .filter((p): p is Record<string, unknown> => p && typeof p === 'object')
    .map(p => ({
      name: p.name as string,
      in: p.in as OpenAPIParameter['in'],
      required: Boolean(p.required),
      type: p.type as string,
      description: p.description as string,
    }))
    .filter(p => p.name && p.in);

  // Parse responses
  const responsesRaw = operation.responses as Record<string, Record<string, unknown>> || {};
  const responses: OpenAPIResponse[] = Object.entries(responsesRaw).map(([code, resp]) => ({
    statusCode: code,
    description: resp?.description as string,
  }));

  return {
    path,
    method,
    operationId: operation.operationId as string,
    summary: operation.summary as string,
    description: operation.description as string,
    parameters,
    responses,
    tags: operation.tags as string[],
    deprecated: Boolean(operation.deprecated),
  };
}

/**
 * Parse request body from OpenAPI 3.x operation
 */
function parseRequestBody(
  requestBodyRaw: Record<string, unknown> | undefined
): OpenAPIRequestBody | undefined {
  if (!requestBodyRaw) {
    return undefined;
  }

  const content = requestBodyRaw.content as Record<string, Record<string, unknown>> || {};

  // Prefer JSON content type
  const jsonContent = content['application/json'];
  if (jsonContent) {
    return {
      description: requestBodyRaw.description as string,
      required: Boolean(requestBodyRaw.required),
      contentType: 'application/json',
      schema: jsonContent.schema as Record<string, unknown>,
    };
  }

  // Fall back to form data
  const formContent = content['application/x-www-form-urlencoded'] || content['multipart/form-data'];
  if (formContent) {
    const contentType = content['application/x-www-form-urlencoded']
      ? 'application/x-www-form-urlencoded'
      : 'multipart/form-data';
    return {
      description: requestBodyRaw.description as string,
      required: Boolean(requestBodyRaw.required),
      contentType,
      schema: formContent.schema as Record<string, unknown>,
    };
  }

  // Return first available content type
  const firstContentType = Object.keys(content)[0];
  if (firstContentType && content[firstContentType]) {
    return {
      description: requestBodyRaw.description as string,
      required: Boolean(requestBodyRaw.required),
      contentType: firstContentType,
      schema: content[firstContentType].schema as Record<string, unknown>,
    };
  }

  return undefined;
}

/**
 * Parse OpenAPI 3.x operation
 */
function parseOpenAPI3Operation(
  path: string,
  method: OpenAPIEndpoint['method'],
  operation: Record<string, unknown>,
  pathParameters: Array<Record<string, unknown>>
): OpenAPIEndpoint | null {
  // Combine path-level and operation-level parameters
  const opParameters = (operation.parameters as Array<Record<string, unknown>>) || [];
  const allParameters = [...pathParameters, ...opParameters];

  const parameters: OpenAPIParameter[] = allParameters
    .filter((p): p is Record<string, unknown> => p && typeof p === 'object')
    .map(p => {
      const schema = p.schema as Record<string, unknown> || {};
      return {
        name: p.name as string,
        in: p.in as OpenAPIParameter['in'],
        required: Boolean(p.required),
        schema: {
          type: schema.type as string,
          format: schema.format as string,
          enum: schema.enum as string[],
        },
        description: p.description as string,
      };
    })
    .filter(p => p.name && p.in);

  // Parse request body (for POST/PUT/PATCH)
  const requestBody = parseRequestBody(operation.requestBody as Record<string, unknown> | undefined);

  // Parse responses
  const responsesRaw = operation.responses as Record<string, Record<string, unknown>> || {};
  const responses: OpenAPIResponse[] = Object.entries(responsesRaw).map(([code, resp]) => {
    const content = resp?.content as Record<string, Record<string, unknown>> || {};
    const jsonContent = content['application/json'] || {};
    return {
      statusCode: code,
      description: resp?.description as string,
      contentType: 'application/json',
      schema: jsonContent.schema as Record<string, unknown>,
    };
  });

  return {
    path,
    method,
    operationId: operation.operationId as string,
    summary: operation.summary as string,
    description: operation.description as string,
    parameters,
    requestBody,
    responses,
    tags: operation.tags as string[],
    deprecated: Boolean(operation.deprecated),
  };
}

/**
 * Parse Swagger 2.0 security definitions
 */
function parseSecurityDefinitions(
  definitions: Record<string, Record<string, unknown>>
): ParsedOpenAPISpec['securitySchemes'] {
  const schemes: ParsedOpenAPISpec['securitySchemes'] = {};

  for (const [name, def] of Object.entries(definitions)) {
    if (!def || typeof def !== 'object') continue;

    const type = def.type as string;
    if (type === 'apiKey') {
      schemes[name] = {
        type: 'apiKey',
        name: def.name as string,
        in: def.in as 'query' | 'header',
      };
    } else if (type === 'basic') {
      schemes[name] = {
        type: 'http',
        scheme: 'basic',
      };
    } else if (type === 'oauth2') {
      schemes[name] = {
        type: 'oauth2',
      };
    }
  }

  return Object.keys(schemes).length > 0 ? schemes : undefined;
}

/**
 * Parse OpenAPI 3.x security schemes
 */
function parseSecuritySchemes3(
  schemes: Record<string, Record<string, unknown>>
): ParsedOpenAPISpec['securitySchemes'] {
  const result: ParsedOpenAPISpec['securitySchemes'] = {};

  for (const [name, scheme] of Object.entries(schemes)) {
    if (!scheme || typeof scheme !== 'object') continue;

    const type = scheme.type as string;
    if (type === 'apiKey') {
      result[name] = {
        type: 'apiKey',
        name: scheme.name as string,
        in: scheme.in as 'query' | 'header' | 'cookie',
      };
    } else if (type === 'http') {
      result[name] = {
        type: 'http',
        scheme: scheme.scheme as string,
      };
    } else if (type === 'oauth2') {
      result[name] = {
        type: 'oauth2',
      };
    } else if (type === 'openIdConnect') {
      result[name] = {
        type: 'openIdConnect',
      };
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}


// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Generate LearnedApiPattern objects from an OpenAPI spec
 */
export function generatePatternsFromSpec(
  spec: ParsedOpenAPISpec,
  domain: string
): OpenAPIPatternGenerationResult {
  const patternIds: string[] = [];
  const skippedEndpoints: OpenAPIPatternGenerationResult['skippedEndpoints'] = [];
  const warnings: string[] = [];
  const patterns: LearnedApiPattern[] = [];

  // Limit endpoints to prevent too many patterns
  const endpoints = spec.endpoints.slice(0, MAX_ENDPOINTS_PER_SPEC);
  if (spec.endpoints.length > MAX_ENDPOINTS_PER_SPEC) {
    warnings.push(`Spec has ${spec.endpoints.length} endpoints, limited to ${MAX_ENDPOINTS_PER_SPEC}`);
  }

  for (const endpoint of endpoints) {
    // Skip deprecated endpoints
    if (endpoint.deprecated) {
      skippedEndpoints.push({
        path: endpoint.path,
        method: endpoint.method,
        reason: 'Deprecated endpoint',
      });
      continue;
    }

    // Skip PATCH endpoints (less commonly used for direct API calls)
    if (endpoint.method === 'PATCH') {
      skippedEndpoints.push({
        path: endpoint.path,
        method: endpoint.method,
        reason: 'PATCH method (use PUT for full updates)',
      });
      continue;
    }

    // Skip endpoints with too many required parameters (for GET/DELETE)
    if (endpoint.method === 'GET' || endpoint.method === 'DELETE') {
      const requiredParams = endpoint.parameters.filter(p => p.required && p.in !== 'header');
      if (requiredParams.length > 3) {
        skippedEndpoints.push({
          path: endpoint.path,
          method: endpoint.method,
          reason: 'Too many required parameters',
        });
        continue;
      }
    }

    // For POST/PUT, skip if no request body schema defined
    if ((endpoint.method === 'POST' || endpoint.method === 'PUT') && !endpoint.requestBody?.schema) {
      skippedEndpoints.push({
        path: endpoint.path,
        method: endpoint.method,
        reason: 'No request body schema defined',
      });
      continue;
    }

    try {
      const pattern = createPatternFromEndpoint(spec, endpoint, domain);
      if (pattern) {
        patterns.push(pattern);
        patternIds.push(pattern.id);
      }
    } catch (error) {
      skippedEndpoints.push({
        path: endpoint.path,
        method: endpoint.method,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  discoveryLogger.info('Generated patterns from OpenAPI spec', {
    domain,
    total: patterns.length,
    skipped: skippedEndpoints.length,
  });

  return {
    patternsGenerated: patterns.length,
    patternIds,
    skippedEndpoints,
    warnings,
  };
}

/**
 * Create a LearnedApiPattern from an OpenAPI endpoint
 */
function createPatternFromEndpoint(
  spec: ParsedOpenAPISpec,
  endpoint: OpenAPIEndpoint,
  domain: string
): LearnedApiPattern | null {
  const now = Date.now();
  const id = `openapi:${domain}:${endpoint.operationId || endpoint.path.replace(/\//g, '-')}:${now}`;

  // Build endpoint URL
  const endpointUrl = buildEndpointUrl(spec.baseUrl, endpoint);

  // Create URL patterns that would match URLs for this API
  const urlPatterns = createUrlPatternsForEndpoint(domain, endpoint);

  // Create extractors for path parameters
  const extractors = createExtractorsForEndpoint(endpoint);

  // Create content mapping from response schema
  const contentMapping = createContentMappingForEndpoint(endpoint);

  // Create validation rules
  const validation = createValidationForEndpoint(endpoint);

  // Build headers based on method and content type
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
    // Set Content-Type based on request body
    const contentType = endpoint.requestBody?.contentType || 'application/json';
    headers['Content-Type'] = contentType;
  }

  // Map method (PATCH is filtered out earlier)
  const method = endpoint.method === 'PATCH' ? 'PUT' : endpoint.method;

  return {
    id,
    templateType: 'rest-resource', // OpenAPI typically defines REST resources
    urlPatterns,
    endpointTemplate: endpointUrl,
    extractors,
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    headers,
    responseFormat: 'json',
    contentMapping,
    validation,
    metrics: {
      successCount: OPENAPI_INITIAL_SUCCESS_COUNT,
      failureCount: 0,
      confidence: OPENAPI_PATTERN_CONFIDENCE,
      domains: [domain],
      lastSuccess: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build the endpoint URL template from base URL and endpoint
 */
function buildEndpointUrl(baseUrl: string, endpoint: OpenAPIEndpoint): string {
  // Convert OpenAPI path params {param} to our template format
  let path = endpoint.path;

  // OpenAPI uses {param} which matches our format, so just combine
  const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${url}${path}`;
}

/**
 * Create URL patterns that would trigger this API endpoint
 */
function createUrlPatternsForEndpoint(domain: string, endpoint: OpenAPIEndpoint): string[] {
  // Create a pattern that matches the domain and path structure
  const escapedDomain = domain.replace(/\./g, '\\.');

  // Convert path to regex pattern
  // /users/{id} -> /users/[^/]+
  let pathPattern = endpoint.path
    .replace(/\{[^}]+\}/g, '[^/]+') // Replace path params with wildcards
    .replace(/\//g, '\\/'); // Escape forward slashes

  return [`^https?://(www\\.)?${escapedDomain}${pathPattern}`];
}

/**
 * Create variable extractors for path parameters
 */
function createExtractorsForEndpoint(endpoint: OpenAPIEndpoint): VariableExtractor[] {
  const extractors: VariableExtractor[] = [];

  // Find path parameters
  const pathParams = endpoint.parameters.filter(p => p.in === 'path');

  for (const param of pathParams) {
    // Create a regex pattern to extract this parameter from the path
    // For a path like /users/{id}/posts, we need to extract {id}
    const pathParts = endpoint.path.split('/');
    const paramIndex = pathParts.findIndex(part => part === `{${param.name}}`);

    if (paramIndex !== -1) {
      // Build regex to capture this specific path segment
      const patternParts = pathParts.slice(0, paramIndex + 1).map((part, i) =>
        i === paramIndex ? '([^/]+)' : part.replace(/\{[^}]+\}/g, '[^/]+')
      );

      extractors.push({
        name: param.name,
        source: 'path',
        pattern: '^' + patternParts.join('/'),
        group: 1,
      });
    }
  }

  return extractors;
}

/**
 * Create content mapping from endpoint response
 */
function createContentMappingForEndpoint(endpoint: OpenAPIEndpoint): ContentMapping {
  // Try to infer mapping from response schema
  const successResponse = endpoint.responses.find(r =>
    r.statusCode === '200' || r.statusCode === '201' || r.statusCode === 'default'
  );

  const mapping: ContentMapping = {
    title: 'title', // Default assumption
  };

  if (successResponse?.schema) {
    const schema = successResponse.schema;
    const properties = (schema.properties as Record<string, unknown>) || {};

    // Look for common field names
    if ('title' in properties) mapping.title = 'title';
    else if ('name' in properties) mapping.title = 'name';
    else if ('subject' in properties) mapping.title = 'subject';

    if ('description' in properties) mapping.description = 'description';
    else if ('summary' in properties) mapping.description = 'summary';
    else if ('excerpt' in properties) mapping.description = 'excerpt';

    if ('body' in properties) mapping.body = 'body';
    else if ('content' in properties) mapping.body = 'content';
    else if ('text' in properties) mapping.body = 'text';
  }

  return mapping;
}

/**
 * Create validation rules for endpoint
 */
function createValidationForEndpoint(endpoint: OpenAPIEndpoint): PatternValidation {
  const successResponse = endpoint.responses.find(r =>
    r.statusCode === '200' || r.statusCode === '201'
  );

  const requiredFields: string[] = [];

  if (successResponse?.schema) {
    const schema = successResponse.schema;
    const required = schema.required as string[];
    if (Array.isArray(required)) {
      requiredFields.push(...required.slice(0, 5)); // Limit to 5 required fields
    }
  }

  return {
    requiredFields,
    minContentLength: 20,
  };
}

// ============================================
// CACHING
// ============================================

/**
 * Cache for discovered OpenAPI specs
 * Key: domain, Value: discovery result
 */
const specCache = new Map<string, { result: OpenAPIDiscoveryResult; timestamp: number }>();

/** How long to cache discovery results (1 hour) */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get cached discovery result or discover anew
 */
export async function discoverOpenAPICached(
  domain: string,
  options: OpenAPIDiscoveryOptions = {}
): Promise<OpenAPIDiscoveryResult> {
  const cached = specCache.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    discoveryLogger.debug('Using cached OpenAPI discovery result', { domain });
    return cached.result;
  }

  const result = await discoverOpenAPI(domain, options);
  specCache.set(domain, { result, timestamp: Date.now() });
  return result;
}

/**
 * Clear the spec cache
 */
export function clearSpecCache(): void {
  specCache.clear();
}

/**
 * Get all generated patterns from an OpenAPI spec
 * This is the main entry point for pattern generation
 * Supports GET, POST, PUT, DELETE methods (PATCH is skipped)
 */
export function generatePatternsFromOpenAPISpec(
  spec: ParsedOpenAPISpec
): LearnedApiPattern[] {
  const domain = new URL(spec.baseUrl).hostname;
  const patterns: LearnedApiPattern[] = [];
  const endpoints = spec.endpoints.slice(0, MAX_ENDPOINTS_PER_SPEC);

  for (const endpoint of endpoints) {
    // Skip deprecated endpoints
    if (endpoint.deprecated) continue;

    // Skip PATCH endpoints
    if (endpoint.method === 'PATCH') continue;

    // Skip endpoints with too many required parameters (for GET/DELETE)
    if (endpoint.method === 'GET' || endpoint.method === 'DELETE') {
      const requiredParams = endpoint.parameters.filter(p => p.required && p.in !== 'header');
      if (requiredParams.length > 3) continue;
    }

    // For POST/PUT, skip if no request body schema
    if ((endpoint.method === 'POST' || endpoint.method === 'PUT') && !endpoint.requestBody?.schema) {
      continue;
    }

    try {
      const pattern = createPatternFromEndpoint(spec, endpoint, domain);
      if (pattern) {
        patterns.push(pattern);
      }
    } catch {
      // Skip failed patterns
    }
  }

  return patterns;
}
