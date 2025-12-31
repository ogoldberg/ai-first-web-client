/**
 * Alternative API Specification Discovery Module (D-006)
 *
 * Automatically discovers alternative API specification formats:
 * - RAML (RESTful API Modeling Language)
 * - API Blueprint (Markdown-based)
 * - WADL (Web Application Description Language)
 *
 * This module:
 * 1. Probes common spec locations for each format
 * 2. Parses RAML, API Blueprint, and WADL specifications
 * 3. Extracts endpoints, methods, and parameters
 * 4. Generates API patterns for discovered endpoints
 * 5. Integrates with the Discovery Orchestrator
 */

import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import type { LearnedApiPattern, ContentMapping, PatternValidation } from '../types/api-patterns.js';

const altSpecLogger = logger.create('AltSpecDiscovery');

// ============================================
// TYPES
// ============================================

/**
 * Supported alternative specification formats
 */
export type AltSpecFormat = 'raml' | 'api-blueprint' | 'wadl';

/**
 * Parsed endpoint from any alternative spec
 */
export interface AltSpecEndpoint {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  /** Path with parameters */
  path: string;
  /** Human-readable summary */
  summary?: string;
  /** Description */
  description?: string;
  /** Path parameters */
  pathParams?: string[];
  /** Query parameters */
  queryParams?: string[];
  /** Request body content type */
  requestContentType?: string;
  /** Response content type */
  responseContentType?: string;
  /** Response schema (if available) */
  responseSchema?: Record<string, unknown>;
}

/**
 * Parsed alternative specification
 */
export interface ParsedAltSpec {
  /** Format type */
  format: AltSpecFormat;
  /** API title */
  title: string;
  /** API version */
  version?: string;
  /** API description */
  description?: string;
  /** Base URL */
  baseUrl?: string;
  /** Discovered endpoints */
  endpoints: AltSpecEndpoint[];
  /** When the spec was discovered */
  discoveredAt: number;
  /** URL where the spec was found */
  specUrl: string;
}

/**
 * Result of alternative spec discovery
 */
export interface AltSpecDiscoveryResult {
  /** Whether a spec was found */
  found: boolean;
  /** The parsed spec if found */
  spec?: ParsedAltSpec;
  /** URL where the spec was found */
  specUrl?: string;
  /** Locations that were probed */
  probedLocations: string[];
  /** Time taken to discover (ms) */
  discoveryTime: number;
  /** Error message if discovery failed */
  error?: string;
  /** Format that was discovered */
  format?: AltSpecFormat;
}

/**
 * Options for alternative spec discovery
 */
export interface AltSpecDiscoveryOptions {
  /** Maximum time to spend probing (ms) */
  timeout?: number;
  /** Only probe these specific locations */
  probeLocations?: string[];
  /** Skip locations that match these patterns */
  skipPatterns?: string[];
  /** Headers to send with probe requests */
  headers?: Record<string, string>;
  /** Custom fetch function */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Only discover these formats */
  formats?: AltSpecFormat[];
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Common locations to probe for RAML specifications
 */
export const RAML_PROBE_LOCATIONS = [
  '/api.raml',
  '/docs/api.raml',
  '/spec/api.raml',
  '/v1/api.raml',
  '/api/v1.raml',
  '/.well-known/api.raml',
] as const;

/**
 * Common locations to probe for API Blueprint specifications
 */
export const API_BLUEPRINT_PROBE_LOCATIONS = [
  '/api.apib',
  '/docs/api.apib',
  '/api.md',
  '/docs/api.md',
  '/blueprint.apib',
  '/spec/api.apib',
  '/.well-known/api.apib',
] as const;

/**
 * Common locations to probe for WADL specifications
 */
export const WADL_PROBE_LOCATIONS = [
  '/application.wadl',
  '/api/wadl',
  '/wadl',
  '/api/application.wadl',
  '/v1/application.wadl',
  '/.well-known/application.wadl',
] as const;

/** Default timeout for probing each location */
const DEFAULT_PROBE_TIMEOUT = 5000;

/** Maximum endpoints per spec */
const MAX_ENDPOINTS_PER_SPEC = 50;

/** Confidence for alt-spec-derived patterns */
const ALT_SPEC_PATTERN_CONFIDENCE = 0.85;

/** Initial success count for alt-spec-derived patterns */
const ALT_SPEC_INITIAL_SUCCESS_COUNT = 50;

// ============================================
// MAIN DISCOVERY
// ============================================

/**
 * Discover alternative API specifications for a domain
 * Tries RAML, API Blueprint, and WADL in order
 */
export async function discoverAltSpecs(
  domain: string,
  options: AltSpecDiscoveryOptions = {}
): Promise<AltSpecDiscoveryResult> {
  const startTime = Date.now();
  const formats = options.formats ?? ['raml', 'api-blueprint', 'wadl'];
  const probedLocations: string[] = [];
  const fetchFn = options.fetchFn ?? fetch;

  // Ensure domain has protocol
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedBase = new URL(baseUrl);
  const origin = parsedBase.origin;

  altSpecLogger.debug('Starting alt spec discovery', { domain, formats });

  // Try each format in order
  for (const format of formats) {
    const locations = getProbeLocationsForFormat(format, options.probeLocations);

    for (const location of locations) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      const timeout = options.timeout ?? DEFAULT_PROBE_TIMEOUT * 10;
      if (elapsed > timeout) {
        altSpecLogger.debug('Discovery timeout reached', { domain, probed: probedLocations.length });
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
            'Accept': getAcceptHeaderForFormat(format),
            'User-Agent': 'LLM-Browser-MCP/1.0 (Alt Spec Discovery)',
            ...options.headers,
          },
          fetchFn,
        });

        if (!response.ok) {
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        // Try to parse as the expected format
        const spec = parseAltSpec(text, specUrl, format, contentType, origin);
        if (spec) {
          altSpecLogger.info('Alt spec discovered', {
            domain,
            format,
            specUrl,
            endpoints: spec.endpoints.length,
          });

          return {
            found: true,
            spec,
            specUrl,
            probedLocations,
            discoveryTime: Date.now() - startTime,
            format,
          };
        }
      } catch (error) {
        altSpecLogger.debug('Probe failed', {
          specUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  altSpecLogger.debug('No alt spec found', { domain, probed: probedLocations.length });

  return {
    found: false,
    probedLocations,
    discoveryTime: Date.now() - startTime,
  };
}

/**
 * Get probe locations for a specific format
 */
function getProbeLocationsForFormat(format: AltSpecFormat, customLocations?: string[]): string[] {
  if (customLocations) {
    return customLocations;
  }

  switch (format) {
    case 'raml':
      return [...RAML_PROBE_LOCATIONS];
    case 'api-blueprint':
      return [...API_BLUEPRINT_PROBE_LOCATIONS];
    case 'wadl':
      return [...WADL_PROBE_LOCATIONS];
  }
}

/**
 * Get Accept header for format
 */
function getAcceptHeaderForFormat(format: AltSpecFormat): string {
  switch (format) {
    case 'raml':
      return 'application/raml+yaml, application/yaml, text/yaml, */*';
    case 'api-blueprint':
      return 'text/vnd.apiblueprint, text/markdown, text/plain, */*';
    case 'wadl':
      return 'application/vnd.sun.wadl+xml, application/xml, text/xml, */*';
  }
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: {
    timeout: number;
    headers?: Record<string, string>;
    fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);
  const fetchFn = options.fetchFn ?? fetch;

  try {
    const response = await fetchFn(url, {
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
 * Parse alternative specification from text
 */
function parseAltSpec(
  text: string,
  specUrl: string,
  format: AltSpecFormat,
  _contentType: string,
  baseUrl: string
): ParsedAltSpec | null {
  switch (format) {
    case 'raml':
      return parseRAML(text, specUrl, baseUrl);
    case 'api-blueprint':
      return parseAPIBlueprint(text, specUrl, baseUrl);
    case 'wadl':
      return parseWADL(text, specUrl, baseUrl);
  }
}

// ============================================
// RAML PARSING
// ============================================

/**
 * Parse RAML specification
 */
function parseRAML(text: string, specUrl: string, baseUrl: string): ParsedAltSpec | null {
  // Check if it looks like RAML
  if (!text.trimStart().startsWith('#%RAML')) {
    return null;
  }

  try {
    // Parse YAML content (skip the #%RAML header line)
    const yamlContent = text.replace(/^#%RAML\s+[\d.]+\s*\n/, '');
    const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const spec = parsed as Record<string, unknown>;
    const endpoints: AltSpecEndpoint[] = [];

    // Extract base URL
    const ramlBaseUri = spec.baseUri as string | undefined;
    const resolvedBaseUrl = ramlBaseUri || baseUrl;

    // Parse resources (top-level paths)
    for (const [key, value] of Object.entries(spec)) {
      if (key.startsWith('/') && typeof value === 'object' && value !== null) {
        parseRAMLResource(key, value as Record<string, unknown>, endpoints, []);
      }
    }

    if (endpoints.length === 0) {
      return null;
    }

    return {
      format: 'raml',
      title: (spec.title as string) || 'RAML API',
      version: spec.version as string,
      description: spec.description as string,
      baseUrl: resolvedBaseUrl,
      endpoints: endpoints.slice(0, MAX_ENDPOINTS_PER_SPEC),
      discoveredAt: Date.now(),
      specUrl,
    };
  } catch (error) {
    altSpecLogger.debug('RAML parse error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Parse a RAML resource recursively
 */
function parseRAMLResource(
  path: string,
  resource: Record<string, unknown>,
  endpoints: AltSpecEndpoint[],
  parentParams: string[]
): void {
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

  // Extract path parameters from URI parameters
  const uriParameters = resource.uriParameters as Record<string, unknown> | undefined;
  const pathParams = [...parentParams];
  if (uriParameters) {
    pathParams.push(...Object.keys(uriParameters));
  }

  // Also extract params from path pattern
  const pathParamMatches = path.match(/\{([^}]+)\}/g);
  if (pathParamMatches) {
    for (const match of pathParamMatches) {
      const param = match.replace(/[{}]/g, '');
      if (!pathParams.includes(param)) {
        pathParams.push(param);
      }
    }
  }

  // Parse methods
  for (const method of methods) {
    const methodDef = resource[method];
    // Handle both defined method objects and empty methods (get:) which become null
    if (methodDef !== undefined) {
      const methodObj = (methodDef || {}) as Record<string, unknown>;
      const queryParams: string[] = [];
      const queryParameters = methodObj.queryParameters as Record<string, unknown> | undefined;
      if (queryParameters) {
        queryParams.push(...Object.keys(queryParameters));
      }

      // Get response info
      const responses = methodObj.responses as Record<string, unknown> | undefined;
      let responseContentType: string | undefined;
      let responseSchema: Record<string, unknown> | undefined;

      if (responses) {
        const successResponse = responses['200'] || responses['201'];
        if (successResponse && typeof successResponse === 'object') {
          const body = (successResponse as Record<string, unknown>).body as Record<string, unknown> | undefined;
          if (body) {
            const firstContentType = Object.keys(body)[0];
            if (firstContentType) {
              responseContentType = firstContentType;
              const bodyContent = body[firstContentType] as Record<string, unknown> | undefined;
              if (bodyContent?.type || bodyContent?.schema) {
                responseSchema = bodyContent;
              }
            }
          }
        }
      }

      endpoints.push({
        method: method.toUpperCase() as AltSpecEndpoint['method'],
        path,
        summary: methodObj.displayName as string | undefined,
        description: methodObj.description as string | undefined,
        pathParams: pathParams.length > 0 ? pathParams : undefined,
        queryParams: queryParams.length > 0 ? queryParams : undefined,
        responseContentType,
        responseSchema,
      });
    }
  }

  // Parse nested resources
  for (const [key, value] of Object.entries(resource)) {
    if (key.startsWith('/') && typeof value === 'object' && value !== null) {
      parseRAMLResource(path + key, value as Record<string, unknown>, endpoints, pathParams);
    }
  }
}

// ============================================
// API BLUEPRINT PARSING
// ============================================

/**
 * Parse API Blueprint specification
 */
function parseAPIBlueprint(text: string, specUrl: string, baseUrl: string): ParsedAltSpec | null {
  // Check if it looks like API Blueprint
  // API Blueprint typically starts with FORMAT: 1A or has ## Group or # Resource patterns
  const hasFormatHeader = /^FORMAT:\s*1A/im.test(text);
  const hasResourcePattern = /^#{1,2}\s+(?:Group\s+)?[A-Z].*\[\/[^\]]+\]/m.test(text);
  const hasActionPattern = /^#{2,3}\s+\w+\s+\[(?:GET|POST|PUT|DELETE|PATCH)\]/im.test(text);

  if (!hasFormatHeader && !hasResourcePattern && !hasActionPattern) {
    return null;
  }

  try {
    const endpoints: AltSpecEndpoint[] = [];
    let title = 'API Blueprint API';
    let description: string | undefined;
    const version: string | undefined = undefined;

    // Extract metadata from header
    const metadataMatch = text.match(/^#\s+(.+?)(?:\n|$)/m);
    if (metadataMatch) {
      title = metadataMatch[1].trim();
    }

    // Extract HOST metadata
    const hostMatch = text.match(/^HOST:\s*(.+)$/im);
    const resolvedBaseUrl = hostMatch ? hostMatch[1].trim() : baseUrl;

    // Extract description
    const descMatch = text.match(/^#\s+.+\n\n([^#]+)/m);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // Parse resource groups and resources
    // Pattern: ## Resource Name [/path]
    const resourcePattern = /^#{1,3}\s+(?:Group\s+)?(.+?)\s*\[([^\]]+)\]/gm;
    let match;

    while ((match = resourcePattern.exec(text)) !== null) {
      const resourceName = match[1].trim();
      const resourcePath = match[2].trim();

      // Find actions within this resource
      // Pattern: ### Action Name [METHOD]
      // or ### Method [METHOD /path]
      const resourceStart = match.index;
      const nextResourceMatch = resourcePattern.exec(text);
      resourcePattern.lastIndex = match.index + 1; // Reset for next iteration

      const resourceEnd = nextResourceMatch ? nextResourceMatch.index : text.length;
      const resourceText = text.slice(resourceStart, resourceEnd);

      // Find actions in this resource section
      const actionPattern = /^#{2,4}\s+(.+?)\s*\[(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)(?:\s+([^\]]+))?\]/gim;
      let actionMatch;

      while ((actionMatch = actionPattern.exec(resourceText)) !== null) {
        const actionName = actionMatch[1].trim();
        const method = actionMatch[2].toUpperCase() as AltSpecEndpoint['method'];
        const actionPath = actionMatch[3]?.trim() || resourcePath;

        // Extract path parameters
        const pathParams: string[] = [];
        const paramMatches = actionPath.match(/\{([^}]+)\}/g);
        if (paramMatches) {
          for (const paramMatch of paramMatches) {
            pathParams.push(paramMatch.replace(/[{}]/g, ''));
          }
        }

        // Look for + Parameters section
        const queryParams: string[] = [];
        const paramsSection = resourceText.slice(actionMatch.index).match(/\+\s*Parameters\s*\n((?:\s+\+\s+.+\n?)+)/i);
        if (paramsSection) {
          const paramLines = paramsSection[1].match(/\+\s+(\w+)/g);
          if (paramLines) {
            for (const paramLine of paramLines) {
              const paramName = paramLine.replace(/^\+\s+/, '').split(/\s/)[0];
              if (!pathParams.includes(paramName)) {
                queryParams.push(paramName);
              }
            }
          }
        }

        endpoints.push({
          method,
          path: actionPath.startsWith('/') ? actionPath : resourcePath,
          summary: actionName || resourceName,
          description: undefined,
          pathParams: pathParams.length > 0 ? pathParams : undefined,
          queryParams: queryParams.length > 0 ? queryParams : undefined,
          responseContentType: 'application/json',
        });
      }
    }

    // If no resources found with the pattern, try simpler action pattern
    if (endpoints.length === 0) {
      const simpleActionPattern = /^#{2,4}\s+(.+?)\s*\[(GET|POST|PUT|DELETE|PATCH)\s+([^\]]+)\]/gim;
      while ((match = simpleActionPattern.exec(text)) !== null) {
        const actionName = match[1].trim();
        const method = match[2].toUpperCase() as AltSpecEndpoint['method'];
        const path = match[3].trim();

        const pathParams: string[] = [];
        const paramMatches = path.match(/\{([^}]+)\}/g);
        if (paramMatches) {
          for (const paramMatch of paramMatches) {
            pathParams.push(paramMatch.replace(/[{}]/g, ''));
          }
        }

        endpoints.push({
          method,
          path,
          summary: actionName,
          pathParams: pathParams.length > 0 ? pathParams : undefined,
          responseContentType: 'application/json',
        });
      }
    }

    if (endpoints.length === 0) {
      return null;
    }

    return {
      format: 'api-blueprint',
      title,
      version,
      description,
      baseUrl: resolvedBaseUrl,
      endpoints: endpoints.slice(0, MAX_ENDPOINTS_PER_SPEC),
      discoveredAt: Date.now(),
      specUrl,
    };
  } catch (error) {
    altSpecLogger.debug('API Blueprint parse error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================
// WADL PARSING
// ============================================

/**
 * Parse WADL specification
 */
function parseWADL(text: string, specUrl: string, baseUrl: string): ParsedAltSpec | null {
  // Check if it looks like WADL XML
  if (!text.includes('<application') || !text.includes('wadl')) {
    return null;
  }

  try {
    const endpoints: AltSpecEndpoint[] = [];
    let title = 'WADL API';
    let resolvedBaseUrl = baseUrl;

    // Extract base from resources element
    const baseMatch = text.match(/<resources\s+base=["']([^"']+)["']/i);
    if (baseMatch) {
      resolvedBaseUrl = baseMatch[1];
    }

    // Extract doc/title
    const titleMatch = text.match(/<doc[^>]*title=["']([^"']+)["']/i);
    if (titleMatch) {
      title = titleMatch[1];
    }

    // Extract the <resources> block content
    const resourcesMatch = text.match(/<resources[^>]*>([\s\S]*)<\/resources>/i);
    if (!resourcesMatch) {
      return null;
    }
    const resourcesContent = resourcesMatch[1];

    // Find top-level resources (those not inside other resources)
    // We do this by finding resource tags and balancing them
    parseWADLResourcesBlock(resourcesContent, '', endpoints, []);

    if (endpoints.length === 0) {
      return null;
    }

    return {
      format: 'wadl',
      title,
      baseUrl: resolvedBaseUrl,
      endpoints: endpoints.slice(0, MAX_ENDPOINTS_PER_SPEC),
      discoveredAt: Date.now(),
      specUrl,
    };
  } catch (error) {
    altSpecLogger.debug('WADL parse error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Parse WADL resources block, handling nested resources by balancing tags
 */
function parseWADLResourcesBlock(
  content: string,
  parentPath: string,
  endpoints: AltSpecEndpoint[],
  parentParams: string[]
): void {
  // Find resource tags one at a time, skipping already-processed regions
  let searchStart = 0;

  while (searchStart < content.length) {
    // Find the next <resource ...> opening tag
    const openTagMatch = content.slice(searchStart).match(/<resource\s+[^>]*path=["']([^"']+)["'][^>]*>/i);
    if (!openTagMatch) {
      break;
    }

    const path = openTagMatch[1];
    const relativeStartIndex = openTagMatch.index!;
    const startIndex = searchStart + relativeStartIndex;
    const openTagEnd = startIndex + openTagMatch[0].length;

    // Count nested levels to find the matching </resource>
    let depth = 1;
    let searchPos = openTagEnd;
    let endTagStart = -1;
    let endTagEnd = -1;

    while (depth > 0 && searchPos < content.length) {
      const nextOpen = content.indexOf('<resource', searchPos);
      const nextClose = content.indexOf('</resource>', searchPos);

      if (nextClose === -1) {
        // No closing tag found, malformed XML
        break;
      }

      // Check for self-closing resource tag between current position and next close
      const selfCloseMatch = content.slice(searchPos, nextClose).match(/<resource[^>]*\/>/);
      if (selfCloseMatch) {
        const selfClosePos = searchPos + selfCloseMatch.index! + selfCloseMatch[0].length;
        if (nextOpen === -1 || selfCloseMatch.index! + searchPos < nextOpen) {
          // Self-closing resource, skip it (don't change depth)
          searchPos = selfClosePos;
          continue;
        }
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check if this open tag is self-closing
        const tagEnd = content.indexOf('>', nextOpen);
        if (tagEnd !== -1 && content.charAt(tagEnd - 1) === '/') {
          // Self-closing, don't change depth
          searchPos = tagEnd + 1;
          continue;
        }
        // Found another opening tag first
        depth++;
        searchPos = tagEnd + 1;
      } else {
        // Found closing tag
        depth--;
        if (depth === 0) {
          endTagStart = nextClose;
          endTagEnd = nextClose + 11; // length of '</resource>'
        }
        searchPos = nextClose + 11;
      }
    }

    if (endTagStart === -1) {
      // Couldn't find matching close tag, skip this resource
      searchStart = openTagEnd;
      continue;
    }

    // Extract the content between open and close tags
    const resourceContent = content.slice(openTagEnd, endTagStart);
    const fullPath = parentPath + path;

    // Parse this resource
    parseWADLResource(fullPath, resourceContent, endpoints, parentParams);

    // Move search start past the entire resource block to avoid re-processing nested resources
    searchStart = endTagEnd;
  }
}

/**
 * Parse a WADL resource element
 */
function parseWADLResource(
  path: string,
  content: string,
  endpoints: AltSpecEndpoint[],
  parentParams: string[]
): void {
  const pathParams = [...parentParams];

  // Extract path parameters from path template
  const paramMatches = path.match(/\{([^}]+)\}/g);
  if (paramMatches) {
    for (const match of paramMatches) {
      const param = match.replace(/[{}]/g, '');
      if (!pathParams.includes(param)) {
        pathParams.push(param);
      }
    }
  }

  // Also check for param elements
  const templateParamPattern = /<param[^>]*style=["']template["'][^>]*name=["']([^"']+)["']/gi;
  let paramMatch;
  while ((paramMatch = templateParamPattern.exec(content)) !== null) {
    const param = paramMatch[1];
    if (!pathParams.includes(param)) {
      pathParams.push(param);
    }
  }

  // Parse methods
  const methodPattern = /<method\s+[^>]*(?:name|id)=["']([^"']+)["'][^>]*(?:\/>|>([\s\S]*?)<\/method>)/gi;
  let methodMatch;

  while ((methodMatch = methodPattern.exec(content)) !== null) {
    const methodName = methodMatch[1].toUpperCase();
    const methodContent = methodMatch[2] || '';

    // Only process standard HTTP methods
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(methodName)) {
      continue;
    }

    // Extract query parameters
    const queryParams: string[] = [];
    const queryParamPattern = /<param[^>]*style=["']query["'][^>]*name=["']([^"']+)["']/gi;
    let queryParamMatch;
    while ((queryParamMatch = queryParamPattern.exec(methodContent)) !== null) {
      queryParams.push(queryParamMatch[1]);
    }

    // Extract request content type
    let requestContentType: string | undefined;
    const requestTypeMatch = methodContent.match(/<request[^>]*>[\s\S]*?<representation[^>]*mediaType=["']([^"']+)["']/i);
    if (requestTypeMatch) {
      requestContentType = requestTypeMatch[1];
    }

    // Extract response content type
    let responseContentType: string | undefined;
    const responseTypeMatch = methodContent.match(/<response[^>]*>[\s\S]*?<representation[^>]*mediaType=["']([^"']+)["']/i);
    if (responseTypeMatch) {
      responseContentType = responseTypeMatch[1];
    }

    // Extract doc/summary
    const docMatch = methodContent.match(/<doc[^>]*>([^<]+)<\/doc>/i);
    const summary = docMatch ? docMatch[1].trim() : undefined;

    endpoints.push({
      method: methodName as AltSpecEndpoint['method'],
      path,
      summary,
      pathParams: pathParams.length > 0 ? pathParams : undefined,
      queryParams: queryParams.length > 0 ? queryParams : undefined,
      requestContentType,
      responseContentType,
    });
  }

  // Parse nested resources using the balanced tag parser
  parseWADLResourcesBlock(content, path, endpoints, pathParams);
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Generate LearnedApiPattern objects from an alternative spec
 */
export function generatePatternsFromAltSpec(
  spec: ParsedAltSpec,
  domain: string
): LearnedApiPattern[] {
  const patterns: LearnedApiPattern[] = [];
  const now = Date.now();

  // Only generate patterns for methods supported by LearnedApiPattern
  // PATCH is not supported, HEAD/OPTIONS are typically not useful for content
  const supportedMethods: Array<'GET' | 'POST' | 'PUT' | 'DELETE'> = ['GET', 'POST', 'PUT', 'DELETE'];

  for (const endpoint of spec.endpoints) {
    if (!supportedMethods.includes(endpoint.method as 'GET' | 'POST' | 'PUT' | 'DELETE')) {
      continue;
    }

    // Skip endpoints with too many required parameters
    const requiredParams = endpoint.pathParams?.length || 0;
    if (requiredParams > 3) {
      continue;
    }

    const pattern = createLearnedPatternFromAltSpec(spec, endpoint, domain, now);
    patterns.push(pattern);
  }

  altSpecLogger.info('Generated alt spec patterns', {
    specUrl: spec.specUrl,
    format: spec.format,
    patterns: patterns.length,
    endpoints: spec.endpoints.length,
  });

  return patterns;
}

/**
 * Create a LearnedApiPattern from an alternative spec endpoint
 */
function createLearnedPatternFromAltSpec(
  spec: ParsedAltSpec,
  endpoint: AltSpecEndpoint,
  domain: string,
  now: number
): LearnedApiPattern {
  // Build endpoint URL
  const baseUrl = spec.baseUrl?.replace(/\/$/, '') || `https://${domain}`;
  const endpointUrl = `${baseUrl}${endpoint.path}`;

  // Build URL pattern for matching
  const urlPatterns = createUrlPatternsForEndpoint(domain, endpoint.path);

  // Create extractors for path parameters
  const extractors = createExtractorsForEndpoint(endpoint);

  // Create content mapping
  const contentMapping: ContentMapping = {
    title: endpoint.summary || endpoint.path,
    description: endpoint.description,
  };

  // Create validation
  const validation: PatternValidation = {
    requiredFields: [],
    minContentLength: 10,
  };

  // Determine headers
  const headers: Record<string, string> = {
    Accept: endpoint.responseContentType || 'application/json',
  };
  if (endpoint.method !== 'GET' && endpoint.requestContentType) {
    headers['Content-Type'] = endpoint.requestContentType;
  }

  return {
    id: `${spec.format}:${domain}:${endpoint.method}:${endpoint.path}`,
    templateType: getTemplateType(endpoint),
    urlPatterns,
    endpointTemplate: endpointUrl,
    extractors,
    method: endpoint.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    headers,
    responseFormat: 'json',
    contentMapping,
    validation,
    metrics: {
      successCount: ALT_SPEC_INITIAL_SUCCESS_COUNT,
      failureCount: 0,
      confidence: ALT_SPEC_PATTERN_CONFIDENCE,
      domains: [domain],
      lastSuccess: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Determine template type based on endpoint
 */
function getTemplateType(endpoint: AltSpecEndpoint): LearnedApiPattern['templateType'] {
  const path = endpoint.path.toLowerCase();

  if (endpoint.method === 'GET') {
    if (path.includes('search') || path.includes('query')) {
      return 'query-api';
    }
    return 'rest-resource';
  }

  if (endpoint.method === 'POST') {
    return 'query-api';
  }

  return 'rest-resource';
}

/**
 * Create URL patterns for matching an endpoint
 */
function createUrlPatternsForEndpoint(domain: string, path: string): string[] {
  // Escape special regex characters in domain
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Convert path parameters {param} to regex wildcards
  const pathPattern = path
    .replace(/\{[^}]+\}/g, '[^/]+')
    .replace(/\//g, '\\/');

  return [
    `^https?://(www\\.)?${escapedDomain}${pathPattern}`,
  ];
}

/**
 * Create extractors for path parameters
 */
function createExtractorsForEndpoint(endpoint: AltSpecEndpoint): LearnedApiPattern['extractors'] {
  const extractors: LearnedApiPattern['extractors'] = [];

  if (endpoint.pathParams) {
    for (const param of endpoint.pathParams) {
      extractors.push({
        name: param,
        source: 'path',
        pattern: `${param}/([^/?#]+)`,
        group: 1,
      });
    }
  }

  return extractors;
}

// ============================================
// CACHING (CLOUD-008: Unified Discovery Cache)
// ============================================

import { getDiscoveryCache } from '../utils/discovery-cache.js';

/** How long to cache discovery results (1 hour) */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get cached discovery result or discover anew
 * Uses unified discovery cache with tenant isolation and failed domain tracking
 */
export async function discoverAltSpecsCached(
  domain: string,
  options: AltSpecDiscoveryOptions = {}
): Promise<AltSpecDiscoveryResult> {
  const cache = getDiscoveryCache();

  // Check if domain is in cooldown from previous failures
  if (cache.isInCooldown('alt-spec', domain)) {
    const cooldownInfo = cache.getCooldownInfo('alt-spec', domain);
    altSpecLogger.debug('Domain in cooldown, returning empty result', {
      domain,
      failureCount: cooldownInfo?.failureCount,
    });
    return {
      found: false,
      format: undefined,
      probedLocations: [],
      discoveryTime: 0,
    };
  }

  // Check cache
  const cached = await cache.get<AltSpecDiscoveryResult>('alt-spec', domain);
  if (cached) {
    altSpecLogger.debug('Using cached alt spec discovery result', { domain });
    return cached;
  }

  // Perform discovery
  try {
    const result = await discoverAltSpecs(domain, options);
    await cache.set('alt-spec', domain, result, CACHE_TTL);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    cache.recordFailure('alt-spec', domain, errorMsg);
    throw err;
  }
}

/**
 * Clear the spec cache
 * @param domain - Optional domain to clear, or all if not specified
 */
export async function clearAltSpecCache(domain?: string): Promise<void> {
  const cache = getDiscoveryCache();
  if (domain) {
    await cache.delete('alt-spec', domain);
  } else {
    await cache.clear('alt-spec');
  }
}

/**
 * Get cache statistics
 */
export async function getAltSpecCacheStats(): Promise<{ size: number; domains: string[] }> {
  const cache = getDiscoveryCache();
  const stats = await cache.getStats();
  return {
    size: stats.entriesBySource['alt-spec'] || 0,
    domains: [], // Domain list is now internal to cache
  };
}
