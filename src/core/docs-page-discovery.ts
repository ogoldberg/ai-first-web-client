/**
 * API Documentation Page Discovery (D-002)
 *
 * Discovers and parses human-readable API documentation pages.
 * Finds API docs at common locations (/docs, /developers, /api-reference),
 * detects documentation frameworks (ReadMe, Slate, Docusaurus, Swagger UI, Redoc),
 * and extracts endpoint information from HTML documentation.
 */

import { logger } from '../utils/logger.js';
import type { LearnedApiPattern } from '../types/api-patterns.js';

const docsLogger = logger.create('DocsPageDiscovery');

// ============================================
// TYPES
// ============================================

/**
 * A parameter documented in an API endpoint
 */
export interface DocumentedParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  location: 'path' | 'query' | 'header' | 'body';
  defaultValue?: string;
}

/**
 * An API endpoint extracted from documentation
 */
export interface DocumentedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  parameters: DocumentedParam[];
  exampleRequest?: string;
  exampleResponse?: string;
  description: string;
  authentication?: string;
  rateLimit?: string;
  /** Source of discovery (e.g., endpoint table, code block) */
  source: 'table' | 'code-block' | 'navigation' | 'heading';
  /** Confidence in the extraction (0-1) */
  confidence: number;
}

/**
 * Detected documentation framework
 */
export type DocFramework =
  | 'readme'
  | 'slate'
  | 'docusaurus'
  | 'swagger-ui'
  | 'redoc'
  | 'gitbook'
  | 'mintlify'
  | 'stoplight'
  | 'unknown';

/**
 * Result of documentation page discovery
 */
export interface DocsDiscoveryResult {
  found: boolean;
  docsUrl?: string;
  framework?: DocFramework;
  endpoints: DocumentedEndpoint[];
  /** Navigation links found pointing to API docs */
  navigationLinks: string[];
  /** Title of the documentation */
  title?: string;
  /** Base URL for API calls if detected */
  apiBaseUrl?: string;
  /** Authentication instructions if found */
  authInstructions?: string;
  /** Time taken to discover in ms */
  discoveryTime: number;
  error?: string;
}

/**
 * Options for docs discovery
 */
export interface DocsDiscoveryOptions {
  /** Custom headers to send with requests */
  headers?: Record<string, string>;
  /** Custom fetch function for testing */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Timeout in ms (default: 10000) */
  timeout?: number;
  /** Maximum pages to probe (default: 10) */
  maxProbes?: number;
  /** Whether to follow navigation links (default: true) */
  followNavigation?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Common locations for API documentation
 */
export const DOCS_PROBE_LOCATIONS = [
  '/docs',
  '/documentation',
  '/api-docs',
  '/api/docs',
  '/developers',
  '/developer',
  '/dev',
  '/api',
  '/api/v1',
  '/api/v2',
  '/reference',
  '/api-reference',
  '/help/api',
  '/support/api',
  '/docs/api',
  '/docs/reference',
] as const;

/**
 * Navigation link text patterns that indicate API documentation
 */
const NAV_LINK_PATTERNS = [
  /\bapi\b/i,
  /\bdeveloper[s]?\b/i,
  /\bdocumentation\b/i,
  /\bdocs\b/i,
  /\breference\b/i,
  /\bintegration[s]?\b/i,
  /\brest\s*api\b/i,
  /\bgraphql\b/i,
];

/**
 * HTTP method patterns for endpoint detection
 */
const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|DELETE|PATCH)\b/;

/**
 * URL path pattern for API endpoints
 */
const API_PATH_PATTERN = /(?:^|\s)(\/[\w\-\/:{}]+)(?:\s|$|[?#])/;

/**
 * Default timeout for requests
 */
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Confidence scores for different extraction sources
 */
const EXTRACTION_CONFIDENCE = {
  table: 0.85,
  'code-block': 0.75,
  navigation: 0.6,
  heading: 0.5,
} as const;

// ============================================
// FRAMEWORK DETECTION
// ============================================

/**
 * Detect which documentation framework a page uses
 */
export function detectDocFramework(html: string): DocFramework {
  const htmlLower = html.toLowerCase();

  // Swagger UI detection
  if (
    htmlLower.includes('swagger-ui') ||
    htmlLower.includes('swagger-container') ||
    htmlLower.includes('swagger-section')
  ) {
    return 'swagger-ui';
  }

  // Redoc detection
  if (
    htmlLower.includes('redoc') ||
    htmlLower.includes('redoc-wrap') ||
    htmlLower.includes('menu-content')
  ) {
    return 'redoc';
  }

  // ReadMe detection
  if (
    htmlLower.includes('readme-docs') ||
    htmlLower.includes('rdmd') ||
    htmlLower.includes('readme.io') ||
    html.includes('__NEXT_DATA__') && htmlLower.includes('readme')
  ) {
    return 'readme';
  }

  // Slate detection
  if (
    htmlLower.includes('slate') ||
    (htmlLower.includes('tocify') && htmlLower.includes('content'))
  ) {
    return 'slate';
  }

  // Docusaurus detection
  if (
    htmlLower.includes('docusaurus') ||
    htmlLower.includes('docsearch') ||
    (htmlLower.includes('__docusaurus') || html.includes('docusaurusContext'))
  ) {
    return 'docusaurus';
  }

  // GitBook detection
  if (
    htmlLower.includes('gitbook') ||
    htmlLower.includes('gb-') ||
    html.includes('GitBookPress')
  ) {
    return 'gitbook';
  }

  // Mintlify detection
  if (
    htmlLower.includes('mintlify') ||
    html.includes('__MINTLIFY')
  ) {
    return 'mintlify';
  }

  // Stoplight detection
  if (
    htmlLower.includes('stoplight') ||
    htmlLower.includes('sl-')
  ) {
    return 'stoplight';
  }

  return 'unknown';
}

// ============================================
// HTML PARSING UTILITIES
// ============================================

/**
 * Extract text content from HTML, removing tags
 */
function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract href values from anchor tags
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const text = extractText(match[2]);

    // Check if link text suggests API documentation
    if (NAV_LINK_PATTERNS.some(pattern => pattern.test(text))) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        if (!links.includes(absoluteUrl)) {
          links.push(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  }

  return links;
}

/**
 * Extract navigation links from common nav structures
 */
export function extractNavigationLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];

  // Look for links in nav, header, and sidebar elements
  const navPatterns = [
    /<nav[^>]*>([\s\S]*?)<\/nav>/gi,
    /<header[^>]*>([\s\S]*?)<\/header>/gi,
    /<aside[^>]*>([\s\S]*?)<\/aside>/gi,
    /<div[^>]*(?:class|id)=["'][^"']*(?:nav|menu|sidebar|header)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  ];

  for (const pattern of navPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const navHtml = match[1];
      const navLinks = extractLinks(navHtml, baseUrl);
      for (const link of navLinks) {
        if (!links.includes(link)) {
          links.push(link);
        }
      }
    }
  }

  // Also check footer for developer links
  const footerPattern = /<footer[^>]*>([\s\S]*?)<\/footer>/gi;
  let footerMatch;
  while ((footerMatch = footerPattern.exec(html)) !== null) {
    const footerLinks = extractLinks(footerMatch[1], baseUrl);
    for (const link of footerLinks) {
      if (!links.includes(link)) {
        links.push(link);
      }
    }
  }

  return links;
}

/**
 * Extract page title from HTML
 */
function extractTitle(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Try h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    return extractText(h1Match[1]);
  }

  return undefined;
}

// ============================================
// ENDPOINT EXTRACTION
// ============================================

/**
 * Extract API endpoints from HTML tables
 */
export function extractEndpointsFromTables(html: string): DocumentedEndpoint[] {
  const endpoints: DocumentedEndpoint[] = [];
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;

  let tableMatch;
  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const tableHtml = tableMatch[1];

    // Check if this looks like an endpoint table
    const tableText = extractText(tableHtml).toLowerCase();
    if (!tableText.includes('endpoint') && !tableText.includes('method') && !tableText.includes('url') && !tableText.includes('path')) {
      continue;
    }

    // Extract rows
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let isHeader = true;

    while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];

      // Skip header row
      if (isHeader) {
        isHeader = false;
        continue;
      }

      // Extract cells
      const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch;

      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }

      // Try to parse endpoint from cells
      const endpoint = parseEndpointFromCells(cells);
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }
  }

  return endpoints;
}

/**
 * Parse endpoint information from table cells
 */
function parseEndpointFromCells(cells: string[]): DocumentedEndpoint | null {
  if (cells.length < 2) {
    return null;
  }

  let method: DocumentedEndpoint['method'] | undefined;
  let path: string | undefined;
  let description = '';

  for (const cell of cells) {
    // Check for HTTP method
    const methodMatch = cell.match(HTTP_METHOD_PATTERN);
    if (methodMatch && !method) {
      method = methodMatch[1] as DocumentedEndpoint['method'];
    }

    // Check for API path
    const pathMatch = cell.match(API_PATH_PATTERN);
    if (pathMatch && !path) {
      path = pathMatch[1];
    }

    // Use longer cells as description
    if (cell.length > 20 && !description) {
      description = cell;
    }
  }

  if (method && path) {
    return {
      method,
      path,
      parameters: extractParametersFromPath(path),
      description,
      source: 'table',
      confidence: EXTRACTION_CONFIDENCE.table,
    };
  }

  return null;
}

/**
 * Extract parameters from path template
 */
function extractParametersFromPath(path: string): DocumentedParam[] {
  const params: DocumentedParam[] = [];
  const paramPattern = /\{(\w+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      type: 'string',
      required: true,
      location: 'path',
    });
  }

  // Also check for :param style
  const colonParamPattern = /:(\w+)/g;
  let colonMatch: RegExpExecArray | null;
  while ((colonMatch = colonParamPattern.exec(path)) !== null) {
    if (!params.some(p => p.name === colonMatch![1])) {
      params.push({
        name: colonMatch[1],
        type: 'string',
        required: true,
        location: 'path',
      });
    }
  }

  return params;
}

/**
 * Extract API endpoints from code blocks
 */
export function extractEndpointsFromCodeBlocks(html: string): DocumentedEndpoint[] {
  const endpoints: DocumentedEndpoint[] = [];
  const codePatterns = [
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    /<code[^>]*class=["'][^"']*(?:language-|hljs)[^"']*["'][^>]*>([\s\S]*?)<\/code>/gi,
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
  ];

  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const codeContent = extractText(match[1]);
      const parsedEndpoints = parseEndpointsFromCode(codeContent);
      for (const endpoint of parsedEndpoints) {
        // Avoid duplicates
        if (!endpoints.some(e => e.method === endpoint.method && e.path === endpoint.path)) {
          endpoints.push(endpoint);
        }
      }
    }
  }

  return endpoints;
}

/**
 * Parse endpoints from code content
 */
function parseEndpointsFromCode(code: string): DocumentedEndpoint[] {
  const endpoints: DocumentedEndpoint[] = [];

  // Look for curl commands
  const curlPattern = /curl\s+(?:-X\s*)?(GET|POST|PUT|DELETE|PATCH)?\s*["']?([^\s"']+)/gi;
  let curlMatch;
  while ((curlMatch = curlPattern.exec(code)) !== null) {
    const method = (curlMatch[1]?.toUpperCase() || 'GET') as DocumentedEndpoint['method'];
    const url = curlMatch[2];

    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://example.com${url}`);
      endpoints.push({
        method,
        path: urlObj.pathname,
        parameters: extractParametersFromPath(urlObj.pathname),
        description: 'Extracted from curl example',
        exampleRequest: code.substring(0, 500),
        source: 'code-block',
        confidence: EXTRACTION_CONFIDENCE['code-block'],
      });
    } catch {
      // Invalid URL, skip
    }
  }

  // Look for HTTP request examples (GET /api/users HTTP/1.1)
  const httpPattern = /(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s]+)\s+HTTP/gi;
  let httpMatch;
  while ((httpMatch = httpPattern.exec(code)) !== null) {
    const method = httpMatch[1].toUpperCase() as DocumentedEndpoint['method'];
    const path = httpMatch[2].split('?')[0]; // Remove query string

    if (!endpoints.some(e => e.method === method && e.path === path)) {
      endpoints.push({
        method,
        path,
        parameters: extractParametersFromPath(path),
        description: 'Extracted from HTTP example',
        exampleRequest: code.substring(0, 500),
        source: 'code-block',
        confidence: EXTRACTION_CONFIDENCE['code-block'],
      });
    }
  }

  // Look for fetch/axios calls
  const fetchPattern = /(?:fetch|axios\.(?:get|post|put|delete))\s*\(\s*["'`]([^"'`]+)/gi;
  let fetchMatch;
  while ((fetchMatch = fetchPattern.exec(code)) !== null) {
    const url = fetchMatch[1];
    // Determine method from axios call or default to GET for fetch
    const methodMatch = code.match(/axios\.(get|post|put|delete)/i);
    const method = methodMatch
      ? (methodMatch[1].toUpperCase() as DocumentedEndpoint['method'])
      : 'GET';

    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://example.com${url}`);
      if (!endpoints.some(e => e.path === urlObj.pathname)) {
        endpoints.push({
          method,
          path: urlObj.pathname,
          parameters: extractParametersFromPath(urlObj.pathname),
          description: 'Extracted from JavaScript example',
          exampleRequest: code.substring(0, 500),
          source: 'code-block',
          confidence: EXTRACTION_CONFIDENCE['code-block'] * 0.9, // Slightly lower confidence
        });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return endpoints;
}

/**
 * Extract endpoints from headings (## GET /api/users style)
 */
export function extractEndpointsFromHeadings(html: string): DocumentedEndpoint[] {
  const endpoints: DocumentedEndpoint[] = [];
  const headingPattern = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;

  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    const headingText = extractText(match[1]);
    const methodMatch = headingText.match(HTTP_METHOD_PATTERN);
    const pathMatch = headingText.match(API_PATH_PATTERN);

    if (methodMatch && pathMatch) {
      endpoints.push({
        method: methodMatch[1] as DocumentedEndpoint['method'],
        path: pathMatch[1],
        parameters: extractParametersFromPath(pathMatch[1]),
        description: headingText,
        source: 'heading',
        confidence: EXTRACTION_CONFIDENCE.heading,
      });
    }
  }

  return endpoints;
}

/**
 * Extract API base URL from documentation
 */
export function extractApiBaseUrl(html: string, pageUrl: string): string | undefined {
  // Look for common base URL patterns in code blocks
  const patterns = [
    /(?:base[_\s]?url|api[_\s]?url|endpoint)\s*[:=]\s*["'`]([^"'`]+)/i,
    /https?:\/\/api\.[^/\s"'`]+/i,
    /https?:\/\/[^/\s"'`]+\/api(?:\/v\d+)?/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  // Fallback: derive from page URL
  try {
    const url = new URL(pageUrl);
    // Check if there's an api subdomain or path
    if (url.hostname.startsWith('api.') || url.pathname.includes('/api')) {
      return `${url.protocol}//${url.hostname}`;
    }
  } catch {
    // Invalid URL
  }

  return undefined;
}

/**
 * Extract authentication instructions
 */
export function extractAuthInstructions(html: string): string | undefined {
  // Look for authentication section
  const authPatterns = [
    /<(?:section|div)[^>]*(?:id|class)=["'][^"']*auth[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|div)>/i,
    /<h[1-6][^>]*>(?:authentication|authorization|api\s*key)[^<]*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]|$)/i,
  ];

  for (const pattern of authPatterns) {
    const match = html.match(pattern);
    if (match) {
      const text = extractText(match[1]).substring(0, 1000);
      if (text.length > 50) {
        return text;
      }
    }
  }

  // Look for API key mentions
  const apiKeyPattern = /(?:api[_\s]?key|bearer\s+token|authorization\s+header)[^.]*\./gi;
  const apiKeyMatch = html.match(apiKeyPattern);
  if (apiKeyMatch) {
    return extractText(apiKeyMatch[0]);
  }

  return undefined;
}

// ============================================
// MAIN DISCOVERY FUNCTIONS
// ============================================

/**
 * Probe a URL and extract documentation information
 */
async function probeDocsUrl(
  url: string,
  options: DocsDiscoveryOptions
): Promise<{ html: string; ok: boolean } | null> {
  const fetchFn = options.fetchFn || fetch;
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetchFn(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LLMBrowser/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        ...options.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    const html = await response.text();
    return { html, ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      docsLogger.debug('Probe timed out', { url });
    }
    return null;
  }
}

/**
 * Parse documentation page and extract all information
 */
export function parseDocsPage(
  html: string,
  pageUrl: string
): Omit<DocsDiscoveryResult, 'found' | 'discoveryTime' | 'docsUrl'> {
  const framework = detectDocFramework(html);
  const title = extractTitle(html);
  const navigationLinks = extractNavigationLinks(html, pageUrl);
  const apiBaseUrl = extractApiBaseUrl(html, pageUrl);
  const authInstructions = extractAuthInstructions(html);

  // Extract endpoints from multiple sources
  const tableEndpoints = extractEndpointsFromTables(html);
  const codeEndpoints = extractEndpointsFromCodeBlocks(html);
  const headingEndpoints = extractEndpointsFromHeadings(html);

  // Combine and deduplicate endpoints
  const allEndpoints = [...tableEndpoints, ...codeEndpoints, ...headingEndpoints];
  const uniqueEndpoints: DocumentedEndpoint[] = [];

  for (const endpoint of allEndpoints) {
    const existing = uniqueEndpoints.find(
      e => e.method === endpoint.method && e.path === endpoint.path
    );
    if (!existing) {
      uniqueEndpoints.push(endpoint);
    } else if (endpoint.confidence > existing.confidence) {
      // Replace with higher confidence version
      const index = uniqueEndpoints.indexOf(existing);
      uniqueEndpoints[index] = endpoint;
    }
  }

  // Sort by confidence
  uniqueEndpoints.sort((a, b) => b.confidence - a.confidence);

  return {
    framework,
    endpoints: uniqueEndpoints,
    navigationLinks,
    title,
    apiBaseUrl,
    authInstructions,
  };
}

/**
 * Discover API documentation for a domain
 */
export async function discoverDocs(
  domain: string,
  options: DocsDiscoveryOptions = {}
): Promise<DocsDiscoveryResult> {
  const startTime = Date.now();
  const maxProbes = options.maxProbes || 10;
  const followNavigation = options.followNavigation !== false;

  docsLogger.debug('Starting docs discovery', { domain, maxProbes });

  const baseUrl = `https://${domain}`;
  const probedUrls = new Set<string>();
  let bestResult: DocsDiscoveryResult | null = null;

  // Try common documentation locations
  const urlsToProbe = DOCS_PROBE_LOCATIONS.map(path => `${baseUrl}${path}`);

  for (const url of urlsToProbe) {
    if (probedUrls.size >= maxProbes) break;
    if (probedUrls.has(url)) continue;
    probedUrls.add(url);

    const probe = await probeDocsUrl(url, options);
    if (!probe) continue;

    const parsed = parseDocsPage(probe.html, url);

    // Score this result
    const score =
      parsed.endpoints.length * 10 +
      (parsed.framework !== 'unknown' ? 20 : 0) +
      (parsed.apiBaseUrl ? 10 : 0) +
      (parsed.authInstructions ? 5 : 0);

    if (!bestResult || score > 0) {
      const currentScore = bestResult
        ? bestResult.endpoints.length * 10 +
          (bestResult.framework !== 'unknown' ? 20 : 0) +
          (bestResult.apiBaseUrl ? 10 : 0) +
          (bestResult.authInstructions ? 5 : 0)
        : -1;

      if (score > currentScore) {
        bestResult = {
          found: true,
          docsUrl: url,
          ...parsed,
          discoveryTime: Date.now() - startTime,
        };
      }
    }

    // Follow navigation links if enabled and we haven't found much yet
    if (followNavigation && parsed.navigationLinks.length > 0 && parsed.endpoints.length < 3) {
      for (const navLink of parsed.navigationLinks.slice(0, 3)) {
        if (probedUrls.size >= maxProbes) break;
        if (probedUrls.has(navLink)) continue;
        probedUrls.add(navLink);

        const navProbe = await probeDocsUrl(navLink, options);
        if (!navProbe) continue;

        const navParsed = parseDocsPage(navProbe.html, navLink);
        const navScore =
          navParsed.endpoints.length * 10 +
          (navParsed.framework !== 'unknown' ? 20 : 0);

        if (navScore > (bestResult?.endpoints.length || 0) * 10) {
          bestResult = {
            found: true,
            docsUrl: navLink,
            ...navParsed,
            discoveryTime: Date.now() - startTime,
          };
        }
      }
    }
  }

  // If we haven't found anything, try the homepage
  if (!bestResult) {
    const homeProbe = await probeDocsUrl(baseUrl, options);
    if (homeProbe) {
      const homeParsed = parseDocsPage(homeProbe.html, baseUrl);

      // Check navigation links from homepage
      if (followNavigation && homeParsed.navigationLinks.length > 0) {
        for (const navLink of homeParsed.navigationLinks.slice(0, 5)) {
          if (probedUrls.size >= maxProbes) break;
          if (probedUrls.has(navLink)) continue;
          probedUrls.add(navLink);

          const navProbe = await probeDocsUrl(navLink, options);
          if (!navProbe) continue;

          const navParsed = parseDocsPage(navProbe.html, navLink);
          if (navParsed.endpoints.length > 0 || navParsed.framework !== 'unknown') {
            bestResult = {
              found: true,
              docsUrl: navLink,
              ...navParsed,
              discoveryTime: Date.now() - startTime,
            };
            break;
          }
        }
      }
    }
  }

  if (bestResult) {
    docsLogger.info('Docs discovery complete', {
      domain,
      docsUrl: bestResult.docsUrl,
      framework: bestResult.framework,
      endpoints: bestResult.endpoints.length,
      time: bestResult.discoveryTime,
    });
    return bestResult;
  }

  docsLogger.debug('No documentation found', { domain, probed: probedUrls.size });

  return {
    found: false,
    endpoints: [],
    navigationLinks: [],
    discoveryTime: Date.now() - startTime,
  };
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Generate API patterns from discovered documentation
 */
export function generatePatternsFromDocs(
  result: DocsDiscoveryResult,
  domain: string
): LearnedApiPattern[] {
  const patterns: LearnedApiPattern[] = [];

  if (!result.found || result.endpoints.length === 0) {
    return patterns;
  }

  const baseUrl = result.apiBaseUrl || `https://${domain}`;
  const now = Date.now();

  for (const endpoint of result.endpoints) {
    // Skip low confidence endpoints
    if (endpoint.confidence < 0.5) continue;

    // Normalize path
    let normalizedPath = endpoint.path;
    // Convert :param to {param}
    normalizedPath = normalizedPath.replace(/:(\w+)/g, '{$1}');

    const endpointUrl = `${baseUrl}${normalizedPath}`;
    const patternId = `docs:${domain}:${endpoint.method}:${normalizedPath}`;

    // Create URL pattern regex
    const urlPattern = '^' + endpointUrl
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\{\\w+\\}/g, '[^/]+') + '$';

    patterns.push({
      id: patternId,
      templateType: 'rest-resource',
      urlPatterns: [urlPattern],
      endpointTemplate: endpointUrl,
      extractors: [],
      method: endpoint.method === 'PATCH' ? 'PUT' : endpoint.method,
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'data', // Generic mapping for API responses
        body: 'data',
      },
      validation: {
        requiredFields: [],
        minContentLength: 10,
      },
      metrics: {
        successCount: 0,
        failureCount: 0,
        confidence: endpoint.confidence * 0.7, // Lower than OpenAPI since docs can be outdated
        domains: [domain],
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  docsLogger.debug('Generated patterns from docs', {
    domain,
    patterns: patterns.length,
  });

  return patterns;
}
