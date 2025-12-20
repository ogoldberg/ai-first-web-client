/**
 * Link Relation Discovery (D-003)
 *
 * Discovers APIs through multiple link-based mechanisms:
 * - RFC 8288 Link response headers
 * - HTML <link> elements
 * - HATEOAS hypermedia formats (HAL, JSON:API, Siren)
 *
 * Common link relations for API discovery:
 * - describedby: Points to API documentation (OpenAPI, etc.)
 * - service: Points to API service endpoint
 * - api: Points to API endpoint
 * - alternate (type=application/json): JSON version of resource
 */

import { logger } from '../utils/logger.js';
import type { LearnedApiPattern } from '../types/api-patterns.js';

const linkLogger = logger.create('LinkDiscovery');

// ============================================
// TYPES
// ============================================

/**
 * Standard link relations relevant for API discovery
 * Based on IANA Link Relations registry
 */
export type ApiLinkRelation =
  | 'describedby'      // Points to documentation describing the resource
  | 'service'          // Points to a service endpoint
  | 'api'              // Custom: points to API endpoint
  | 'alternate'        // Alternative representation (often JSON)
  | 'collection'       // Collection containing the resource
  | 'item'             // Item within a collection
  | 'self'             // The resource itself
  | 'next'             // Next page in pagination
  | 'prev'             // Previous page in pagination
  | 'first'            // First page in pagination
  | 'last'             // Last page in pagination
  | 'search'           // Search endpoint
  | 'edit'             // Editable version of resource
  | 'create-form'      // Form for creating new resources
  | 'edit-form';       // Form for editing resources

/**
 * A discovered link from headers, HTML, or hypermedia
 */
export interface DiscoveredLink {
  /** The URL this link points to */
  href: string;
  /** Link relation type */
  rel: string;
  /** MIME type (if specified) */
  type?: string;
  /** Title (if specified) */
  title?: string;
  /** Language (if specified) */
  hreflang?: string;
  /** Media query (if specified) */
  media?: string;
  /** Source of this link */
  source: 'header' | 'html' | 'hateoas';
  /** Hypermedia format if from HATEOAS */
  hypermediaFormat?: HypermediaFormat;
  /** Whether this link likely points to an API */
  isApiLink: boolean;
  /** Confidence that this is a useful API link (0-1) */
  confidence: number;
}

/**
 * Hypermedia formats for HATEOAS detection
 */
export type HypermediaFormat =
  | 'hal'           // Hypertext Application Language (HAL+JSON)
  | 'json-api'      // JSON:API
  | 'siren'         // Siren hypermedia
  | 'collection+json' // Collection+JSON
  | 'hydra'         // Hydra (JSON-LD based)
  | 'unknown';

/**
 * Result of link discovery
 */
export interface LinkDiscoveryResult {
  /** Whether any links were found */
  found: boolean;
  /** All discovered links */
  links: DiscoveredLink[];
  /** Links that are likely API endpoints */
  apiLinks: DiscoveredLink[];
  /** Links that point to API documentation */
  documentationLinks: DiscoveredLink[];
  /** Detected hypermedia format (if any) */
  hypermediaFormat?: HypermediaFormat;
  /** Pagination links (if found) */
  paginationLinks?: {
    next?: string;
    prev?: string;
    first?: string;
    last?: string;
  };
  /** Discovery time in ms */
  discoveryTime: number;
  /** Error message if discovery failed */
  error?: string;
}

/**
 * Options for link discovery
 */
export interface LinkDiscoveryOptions {
  /** Custom fetch function */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Headers to send with requests */
  headers?: Record<string, string>;
  /** Follow links to discover more (depth limit) */
  maxDepth?: number;
  /** Timeout in ms */
  timeout?: number;
  /** Base URL for resolving relative links */
  baseUrl?: string;
  /** HTML content to parse (if already fetched) */
  htmlContent?: string;
  /** Response headers to parse (if already fetched) */
  responseHeaders?: Headers | Record<string, string>;
  /** JSON response to parse for HATEOAS (if already fetched) */
  jsonResponse?: unknown;
}

// ============================================
// CONSTANTS
// ============================================

/** Link relations that indicate API documentation */
const DOCUMENTATION_RELATIONS = new Set([
  'describedby',
  'service-doc',
  'documentation',
  'help',
]);

/** Link relations that indicate API endpoints */
const API_RELATIONS = new Set([
  'api',
  'service',
  'self',
  'collection',
  'item',
  'search',
  'create-form',
  'edit-form',
]);

/** MIME types that indicate API content */
const API_MIME_TYPES = new Set([
  'application/json',
  'application/vnd.api+json',      // JSON:API
  'application/hal+json',          // HAL
  'application/vnd.siren+json',    // Siren
  'application/vnd.collection+json', // Collection+JSON
  'application/ld+json',           // JSON-LD/Hydra
  'application/xml',
  'text/xml',
]);

/** Confidence scores for different link sources */
const LINK_CONFIDENCE = {
  header: 0.85,        // Link headers are explicit and reliable
  html: 0.70,          // HTML links may be for various purposes
  hateoas: 0.80,       // HATEOAS links are API-specific
};

// ============================================
// LINK HEADER PARSING (RFC 8288)
// ============================================

/**
 * Parse RFC 8288 Link header value
 *
 * Format: <url>; rel="relation"; type="mime/type"; title="title"
 * Multiple links separated by commas
 *
 * Example:
 *   Link: </api/openapi.json>; rel="describedby"; type="application/json"
 *   Link: </api/users?page=2>; rel="next", </api/users?page=1>; rel="prev"
 */
export function parseLinkHeader(headerValue: string, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!headerValue?.trim()) {
    return links;
  }

  // Split on commas that are outside angle brackets
  // This handles: <url1>; rel="a", <url2>; rel="b"
  const linkStrings = splitLinkHeader(headerValue);

  for (const linkStr of linkStrings) {
    const parsed = parseSingleLink(linkStr.trim(), baseUrl);
    if (parsed) {
      links.push({
        ...parsed,
        source: 'header',
        isApiLink: isApiRelatedLink(parsed.rel, parsed.type),
        confidence: LINK_CONFIDENCE.header,
      });
    }
  }

  linkLogger.debug('Parsed Link header', {
    input: headerValue.substring(0, 200),
    links: links.length,
  });

  return links;
}

/**
 * Count consecutive backslashes before position i
 */
function countPrecedingBackslashes(str: string, i: number): number {
  let count = 0;
  let pos = i - 1;
  while (pos >= 0 && str[pos] === '\\') {
    count++;
    pos--;
  }
  return count;
}

/**
 * Split Link header value respecting angle brackets
 */
function splitLinkHeader(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inAngleBrackets = false;
  let inQuotes = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '<' && !inQuotes) {
      inAngleBrackets = true;
    } else if (char === '>' && !inQuotes) {
      inAngleBrackets = false;
    } else if (char === '"') {
      // A quote is escaped if preceded by an odd number of backslashes
      // e.g., \" = escaped (1 backslash), \\" = not escaped (2 backslashes)
      const backslashCount = countPrecedingBackslashes(value, i);
      if (backslashCount % 2 === 0) {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inAngleBrackets && !inQuotes) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Parse a single link from the header
 */
function parseSingleLink(linkStr: string, baseUrl?: string): Omit<DiscoveredLink, 'source' | 'isApiLink' | 'confidence'> | null {
  // Extract URL from angle brackets: <url>
  const urlMatch = linkStr.match(/^<([^>]+)>/);
  if (!urlMatch) {
    return null;
  }

  let href = urlMatch[1];

  // Resolve relative URLs
  if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
    try {
      href = new URL(href, baseUrl).href;
    } catch {
      // Keep original if URL resolution fails
    }
  }

  // Parse parameters after the URL
  const paramsStr = linkStr.substring(urlMatch[0].length);
  const params = parseParameters(paramsStr);

  return {
    href,
    rel: params.rel || 'related',
    type: params.type,
    title: params.title,
    hreflang: params.hreflang,
    media: params.media,
  };
}

/**
 * Parse semicolon-separated parameters
 */
function parseParameters(paramsStr: string): Record<string, string> {
  const params: Record<string, string> = {};
  const paramPattern = /;\s*([a-zA-Z_-]+)(?:=(?:"([^"]+)"|([^\s;,]+)))?/g;

  let match;
  while ((match = paramPattern.exec(paramsStr)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] || match[3] || '';
    params[key] = value;
  }

  return params;
}

// ============================================
// HTML LINK EXTRACTION
// ============================================

/**
 * Extract <link> elements from HTML
 *
 * Looks for:
 * - <link rel="api" href="/api">
 * - <link rel="alternate" type="application/json" href="/api/posts.json">
 * - <link rel="describedby" href="/swagger.json">
 */
export function extractHtmlLinks(html: string, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!html?.trim()) {
    return links;
  }

  // Match <link> elements with various attributes
  // This regex handles self-closing and non-self-closing variants
  const linkPattern = /<link\s+([^>]+?)\s*\/?>/gi;

  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const attrs = parseHtmlAttributes(match[1]);

    if (attrs.href) {
      let href = attrs.href;

      // Resolve relative URLs
      if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
        try {
          href = new URL(href, baseUrl).href;
        } catch {
          // Keep original if resolution fails
        }
      }

      const rel = attrs.rel || 'related';
      const type = attrs.type;

      links.push({
        href,
        rel,
        type,
        title: attrs.title,
        hreflang: attrs.hreflang,
        media: attrs.media,
        source: 'html',
        isApiLink: isApiRelatedLink(rel, type),
        confidence: LINK_CONFIDENCE.html,
      });
    }
  }

  linkLogger.debug('Extracted HTML links', {
    links: links.length,
  });

  return links;
}

/**
 * Parse HTML attributes from a string
 */
function parseHtmlAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  // Match attribute="value" or attribute='value' or attribute=value or attribute (boolean)
  const attrPattern = /([a-zA-Z_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  let match;
  while ((match = attrPattern.exec(attrStr)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }

  return attrs;
}

// ============================================
// HATEOAS DETECTION
// ============================================

/**
 * Detect hypermedia format from JSON response
 */
export function detectHypermediaFormat(json: unknown): HypermediaFormat | null {
  if (!json || typeof json !== 'object') {
    return null;
  }

  const obj = json as Record<string, unknown>;

  // HAL: _links and optionally _embedded
  if ('_links' in obj && typeof obj._links === 'object') {
    return 'hal';
  }

  // JSON:API: data and optional included, links at top level
  if ('data' in obj && (Array.isArray(obj.data) || (typeof obj.data === 'object' && obj.data !== null))) {
    const data = obj.data;
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0] as Record<string, unknown>;
      if ('type' in first && 'id' in first) {
        return 'json-api';
      }
    } else if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, unknown>;
      if ('type' in dataObj && 'id' in dataObj) {
        return 'json-api';
      }
    }
  }

  // Siren: class, properties, entities, actions, links
  if (('class' in obj || 'entities' in obj || 'actions' in obj) && 'links' in obj) {
    if (Array.isArray(obj.links)) {
      return 'siren';
    }
  }

  // Collection+JSON: collection property with items, links, template
  if ('collection' in obj && typeof obj.collection === 'object') {
    const collection = obj.collection as Record<string, unknown>;
    if ('items' in collection || 'links' in collection) {
      return 'collection+json';
    }
  }

  // Hydra: @context with hydra vocabulary
  if ('@context' in obj) {
    const context = obj['@context'];
    if (typeof context === 'string' && context.includes('hydra')) {
      return 'hydra';
    }
    if (typeof context === 'object' && context !== null) {
      const contextStr = JSON.stringify(context);
      if (contextStr.includes('hydra')) {
        return 'hydra';
      }
    }
  }

  return null;
}

/**
 * Extract links from HAL JSON response
 */
export function extractHalLinks(json: unknown, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!json || typeof json !== 'object') {
    return links;
  }

  const obj = json as Record<string, unknown>;
  const halLinks = obj._links;

  if (!halLinks || typeof halLinks !== 'object') {
    return links;
  }

  // HAL _links is a map of rel -> link or link[]
  for (const [rel, value] of Object.entries(halLinks as Record<string, unknown>)) {
    const linkItems = Array.isArray(value) ? value : [value];

    for (const item of linkItems) {
      if (item && typeof item === 'object' && 'href' in (item as Record<string, unknown>)) {
        const linkObj = item as Record<string, unknown>;
        let href = linkObj.href as string;

        // Resolve relative URLs
        if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
          try {
            href = new URL(href, baseUrl).href;
          } catch {
            // Keep original
          }
        }

        links.push({
          href,
          rel,
          title: linkObj.title as string | undefined,
          type: linkObj.type as string | undefined,
          hreflang: linkObj.hreflang as string | undefined,
          source: 'hateoas',
          hypermediaFormat: 'hal',
          isApiLink: isApiRelatedLink(rel),
          confidence: LINK_CONFIDENCE.hateoas,
        });
      }
    }
  }

  return links;
}

/**
 * Extract links from JSON:API response
 */
export function extractJsonApiLinks(json: unknown, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!json || typeof json !== 'object') {
    return links;
  }

  const obj = json as Record<string, unknown>;

  // Extract top-level links
  if (obj.links && typeof obj.links === 'object') {
    const topLinks = obj.links as Record<string, unknown>;
    for (const [rel, value] of Object.entries(topLinks)) {
      let href: string | undefined;

      if (typeof value === 'string') {
        href = value;
      } else if (value && typeof value === 'object' && 'href' in (value as Record<string, unknown>)) {
        href = (value as Record<string, unknown>).href as string;
      }

      if (href) {
        // Resolve relative URLs
        if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
          try {
            href = new URL(href, baseUrl).href;
          } catch {
            // Keep original
          }
        }

        links.push({
          href,
          rel,
          source: 'hateoas',
          hypermediaFormat: 'json-api',
          isApiLink: isApiRelatedLink(rel),
          confidence: LINK_CONFIDENCE.hateoas,
        });
      }
    }
  }

  // Extract links from data resources
  const data = obj.data;
  if (data) {
    const resources = Array.isArray(data) ? data : [data];
    for (const resource of resources) {
      if (resource && typeof resource === 'object') {
        const resObj = resource as Record<string, unknown>;
        if (resObj.links && typeof resObj.links === 'object') {
          const resLinks = resObj.links as Record<string, unknown>;
          for (const [rel, value] of Object.entries(resLinks)) {
            let href: string | undefined;

            if (typeof value === 'string') {
              href = value;
            } else if (value && typeof value === 'object' && 'href' in (value as Record<string, unknown>)) {
              href = (value as Record<string, unknown>).href as string;
            }

            if (href) {
              if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
                try {
                  href = new URL(href, baseUrl).href;
                } catch {
                  // Keep original
                }
              }

              links.push({
                href,
                rel,
                source: 'hateoas',
                hypermediaFormat: 'json-api',
                isApiLink: isApiRelatedLink(rel),
                confidence: LINK_CONFIDENCE.hateoas,
              });
            }
          }
        }
      }
    }
  }

  return links;
}

/**
 * Extract links from Siren response
 */
export function extractSirenLinks(json: unknown, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!json || typeof json !== 'object') {
    return links;
  }

  const obj = json as Record<string, unknown>;

  // Siren links is an array of link objects
  if (Array.isArray(obj.links)) {
    for (const link of obj.links) {
      if (link && typeof link === 'object') {
        const linkObj = link as Record<string, unknown>;
        let href = linkObj.href as string | undefined;

        if (href) {
          if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
            try {
              href = new URL(href, baseUrl).href;
            } catch {
              // Keep original
            }
          }

          // Siren uses rel as an array
          const relArray = Array.isArray(linkObj.rel) ? linkObj.rel : [linkObj.rel];
          for (const rel of relArray) {
            if (typeof rel === 'string') {
              links.push({
                href,
                rel,
                type: linkObj.type as string | undefined,
                title: linkObj.title as string | undefined,
                source: 'hateoas',
                hypermediaFormat: 'siren',
                isApiLink: isApiRelatedLink(rel),
                confidence: LINK_CONFIDENCE.hateoas,
              });
            }
          }
        }
      }
    }
  }

  // Also extract from embedded entities
  if (Array.isArray(obj.entities)) {
    for (const entity of obj.entities) {
      if (entity && typeof entity === 'object') {
        const entityObj = entity as Record<string, unknown>;

        // Embedded link entity (has href)
        if (typeof entityObj.href === 'string') {
          let href = entityObj.href;
          if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
            try {
              href = new URL(href, baseUrl).href;
            } catch {
              // Keep original
            }
          }

          const relArray = Array.isArray(entityObj.rel) ? entityObj.rel : [entityObj.rel];
          for (const rel of relArray) {
            if (typeof rel === 'string') {
              links.push({
                href,
                rel,
                source: 'hateoas',
                hypermediaFormat: 'siren',
                isApiLink: true, // Entity links are API-specific
                confidence: LINK_CONFIDENCE.hateoas,
              });
            }
          }
        }
      }
    }
  }

  return links;
}

/**
 * Extract links from Collection+JSON response (RFC 6573)
 */
export function extractCollectionJsonLinks(json: unknown, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!json || typeof json !== 'object') {
    return links;
  }

  const obj = json as Record<string, unknown>;

  // Collection+JSON wraps everything in a 'collection' object
  if (!('collection' in obj) || typeof obj.collection !== 'object' || !obj.collection) {
    return links;
  }

  const collection = obj.collection as Record<string, unknown>;

  // Helper to resolve and add a link
  const addLink = (href: string, rel: string, title?: string) => {
    let resolvedHref = href;
    if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
      try {
        resolvedHref = new URL(href, baseUrl).href;
      } catch {
        // Keep original
      }
    }
    links.push({
      href: resolvedHref,
      rel,
      title,
      source: 'hateoas',
      hypermediaFormat: 'collection+json',
      isApiLink: isApiRelatedLink(rel),
      confidence: LINK_CONFIDENCE.hateoas,
    });
  };

  // Collection href (self link)
  if (typeof collection.href === 'string') {
    addLink(collection.href, 'self');
  }

  // Collection-level links
  if (Array.isArray(collection.links)) {
    for (const link of collection.links) {
      if (link && typeof link === 'object') {
        const linkObj = link as Record<string, unknown>;
        if (typeof linkObj.href === 'string' && typeof linkObj.rel === 'string') {
          addLink(
            linkObj.href,
            linkObj.rel,
            typeof linkObj.prompt === 'string' ? linkObj.prompt : undefined
          );
        }
      }
    }
  }

  // Links from individual items
  if (Array.isArray(collection.items)) {
    for (const item of collection.items) {
      if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        // Item href
        if (typeof itemObj.href === 'string') {
          addLink(itemObj.href, 'item');
        }
        // Item-level links
        if (Array.isArray(itemObj.links)) {
          for (const link of itemObj.links) {
            if (link && typeof link === 'object') {
              const linkObj = link as Record<string, unknown>;
              if (typeof linkObj.href === 'string' && typeof linkObj.rel === 'string') {
                addLink(
                  linkObj.href,
                  linkObj.rel,
                  typeof linkObj.prompt === 'string' ? linkObj.prompt : undefined
                );
              }
            }
          }
        }
      }
    }
  }

  return links;
}

/**
 * Extract links from Hydra (JSON-LD) response
 */
export function extractHydraLinks(json: unknown, baseUrl?: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];

  if (!json || typeof json !== 'object') {
    return links;
  }

  const obj = json as Record<string, unknown>;

  // Helper to resolve and add a link
  const addLink = (href: string, rel: string, title?: string) => {
    let resolvedHref = href;
    if (baseUrl && !href.startsWith('http://') && !href.startsWith('https://')) {
      try {
        resolvedHref = new URL(href, baseUrl).href;
      } catch {
        // Keep original
      }
    }
    links.push({
      href: resolvedHref,
      rel,
      title,
      source: 'hateoas',
      hypermediaFormat: 'hydra',
      isApiLink: isApiRelatedLink(rel),
      confidence: LINK_CONFIDENCE.hateoas,
    });
  };

  // @id is the self link
  if (typeof obj['@id'] === 'string') {
    addLink(obj['@id'], 'self');
  }

  // hydra:view contains pagination links
  if (obj['hydra:view'] && typeof obj['hydra:view'] === 'object') {
    const view = obj['hydra:view'] as Record<string, unknown>;
    if (typeof view['@id'] === 'string') {
      addLink(view['@id'], 'self');
    }
    if (typeof view['hydra:first'] === 'string') {
      addLink(view['hydra:first'], 'first');
    }
    if (typeof view['hydra:last'] === 'string') {
      addLink(view['hydra:last'], 'last');
    }
    if (typeof view['hydra:next'] === 'string') {
      addLink(view['hydra:next'], 'next');
    }
    if (typeof view['hydra:previous'] === 'string') {
      addLink(view['hydra:previous'], 'prev');
    }
  }

  // hydra:operation defines available operations
  if (Array.isArray(obj['hydra:operation'])) {
    for (const op of obj['hydra:operation']) {
      if (op && typeof op === 'object') {
        const opObj = op as Record<string, unknown>;
        // Operations typically reference the current resource
        if (typeof opObj['hydra:method'] === 'string') {
          const method = opObj['hydra:method'] as string;
          const title = typeof opObj['hydra:title'] === 'string' ? opObj['hydra:title'] : undefined;
          // Use the current @id as href for operations
          if (typeof obj['@id'] === 'string') {
            links.push({
              href: obj['@id'],
              rel: `operation:${method.toLowerCase()}`,
              title,
              source: 'hateoas',
              hypermediaFormat: 'hydra',
              isApiLink: true,
              confidence: LINK_CONFIDENCE.hateoas,
            });
          }
        }
      }
    }
  }

  // Extract links from hydra:member items (embedded resources)
  if (Array.isArray(obj['hydra:member'])) {
    for (const member of obj['hydra:member']) {
      if (member && typeof member === 'object') {
        const memberObj = member as Record<string, unknown>;
        if (typeof memberObj['@id'] === 'string') {
          addLink(memberObj['@id'], 'item');
        }
      }
    }
  }

  return links;
}

/**
 * Extract links from any detected hypermedia format
 */
export function extractHateoasLinks(json: unknown, baseUrl?: string): DiscoveredLink[] {
  const format = detectHypermediaFormat(json);

  if (!format) {
    return [];
  }

  switch (format) {
    case 'hal':
      return extractHalLinks(json, baseUrl);
    case 'json-api':
      return extractJsonApiLinks(json, baseUrl);
    case 'siren':
      return extractSirenLinks(json, baseUrl);
    case 'collection+json':
      return extractCollectionJsonLinks(json, baseUrl);
    case 'hydra':
      return extractHydraLinks(json, baseUrl);
    default:
      return [];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a link relation or type indicates an API
 */
function isApiRelatedLink(rel: string, type?: string): boolean {
  // Check relation
  if (API_RELATIONS.has(rel) || DOCUMENTATION_RELATIONS.has(rel)) {
    return true;
  }

  // Check MIME type
  if (type && API_MIME_TYPES.has(type.toLowerCase())) {
    return true;
  }

  // Check for common API indicators in rel
  const relLower = rel.toLowerCase();
  if (relLower.includes('api') || relLower.includes('service') || relLower.includes('endpoint')) {
    return true;
  }

  return false;
}

/**
 * Filter links to those most likely to be API-related
 */
export function filterApiLinks(links: DiscoveredLink[]): DiscoveredLink[] {
  return links.filter((link) => link.isApiLink);
}

/**
 * Filter links that point to API documentation
 */
export function filterDocumentationLinks(links: DiscoveredLink[]): DiscoveredLink[] {
  return links.filter((link) => DOCUMENTATION_RELATIONS.has(link.rel));
}

/**
 * Extract pagination links from a set of links
 */
export function extractPaginationLinks(links: DiscoveredLink[]): LinkDiscoveryResult['paginationLinks'] {
  const pagination: LinkDiscoveryResult['paginationLinks'] = {};

  for (const link of links) {
    const rel = link.rel.toLowerCase();
    if (rel === 'next') {
      pagination.next = link.href;
    } else if (rel === 'prev' || rel === 'previous') {
      pagination.prev = link.href;
    } else if (rel === 'first') {
      pagination.first = link.href;
    } else if (rel === 'last') {
      pagination.last = link.href;
    }
  }

  return Object.keys(pagination).length > 0 ? pagination : undefined;
}

// ============================================
// MAIN DISCOVERY FUNCTION
// ============================================

/**
 * Discover links from a URL or pre-fetched content
 *
 * Can work with:
 * 1. A URL - fetches and parses headers, HTML, JSON
 * 2. Pre-fetched content - parses headers, HTML, JSON passed in options
 */
export async function discoverLinks(
  url: string,
  options: LinkDiscoveryOptions = {}
): Promise<LinkDiscoveryResult> {
  const startTime = Date.now();
  const allLinks: DiscoveredLink[] = [];
  let hypermediaFormat: HypermediaFormat | undefined;

  try {
    // Determine base URL
    const baseUrl = options.baseUrl || url;

    // If pre-fetched content is provided, use it
    if (options.responseHeaders || options.htmlContent || options.jsonResponse) {
      // Parse Link headers
      if (options.responseHeaders) {
        const headers = options.responseHeaders;
        const linkHeader = headers instanceof Headers
          ? headers.get('Link')
          : headers['Link'] || headers['link'];

        if (linkHeader) {
          const headerLinks = parseLinkHeader(linkHeader, baseUrl);
          allLinks.push(...headerLinks);
        }
      }

      // Parse HTML links
      if (options.htmlContent) {
        const htmlLinks = extractHtmlLinks(options.htmlContent, baseUrl);
        allLinks.push(...htmlLinks);
      }

      // Parse HATEOAS links
      if (options.jsonResponse) {
        hypermediaFormat = detectHypermediaFormat(options.jsonResponse) || undefined;
        const hateoasLinks = extractHateoasLinks(options.jsonResponse, baseUrl);
        allLinks.push(...hateoasLinks);
      }
    } else {
      // Fetch the URL and parse response
      const fetchFn = options.fetchFn || fetch;
      const controller = new AbortController();
      const timeoutId = options.timeout
        ? setTimeout(() => controller.abort(), options.timeout)
        : undefined;

      try {
        const response = await fetchFn(url, {
          headers: options.headers,
          signal: controller.signal,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Parse Link headers
        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
          const headerLinks = parseLinkHeader(linkHeader, baseUrl);
          allLinks.push(...headerLinks);
        }

        // Get content
        const contentType = response.headers.get('Content-Type') || '';
        const text = await response.text();

        // Parse based on content type
        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          const htmlLinks = extractHtmlLinks(text, baseUrl);
          allLinks.push(...htmlLinks);
        } else if (contentType.includes('json')) {
          try {
            const json = JSON.parse(text);
            hypermediaFormat = detectHypermediaFormat(json) || undefined;
            const hateoasLinks = extractHateoasLinks(json, baseUrl);
            allLinks.push(...hateoasLinks);
          } catch {
            // Not valid JSON
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            found: false,
            links: [],
            apiLinks: [],
            documentationLinks: [],
            discoveryTime: Date.now() - startTime,
            error: 'Request timed out',
          };
        }
        throw error;
      }
    }

    // Filter and categorize links
    const apiLinks = filterApiLinks(allLinks);
    const documentationLinks = filterDocumentationLinks(allLinks);
    const paginationLinks = extractPaginationLinks(allLinks);

    const result: LinkDiscoveryResult = {
      found: allLinks.length > 0,
      links: allLinks,
      apiLinks,
      documentationLinks,
      hypermediaFormat,
      paginationLinks,
      discoveryTime: Date.now() - startTime,
    };

    linkLogger.info('Link discovery complete', {
      url,
      totalLinks: allLinks.length,
      apiLinks: apiLinks.length,
      documentationLinks: documentationLinks.length,
      hypermediaFormat,
      time: result.discoveryTime,
    });

    return result;
  } catch (error) {
    linkLogger.error('Link discovery failed', { url, error });
    return {
      found: false,
      links: [],
      apiLinks: [],
      documentationLinks: [],
      discoveryTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Convert discovered API links to LearnedApiPattern format
 */
export function generatePatternsFromLinks(
  links: DiscoveredLink[],
  domain: string
): LearnedApiPattern[] {
  const patterns: LearnedApiPattern[] = [];
  const now = Date.now();

  // Group links by their base path to avoid duplicates
  const seen = new Set<string>();

  for (const link of links) {
    // Skip non-API links
    if (!link.isApiLink) {
      continue;
    }

    // Skip if we've already processed this href
    if (seen.has(link.href)) {
      continue;
    }
    seen.add(link.href);

    // Parse URL to extract path pattern
    let urlPath: string;
    try {
      const parsedUrl = new URL(link.href);
      urlPath = parsedUrl.pathname;
    } catch {
      // If URL parsing fails, skip this link
      continue;
    }

    // Create pattern ID
    const patternId = `link:${domain}:${link.rel}:${urlPath.replace(/\//g, '-').substring(1, 50)}`;

    // Determine if this is a collection or item endpoint
    const isCollection = link.rel === 'collection' || urlPath.endsWith('/');

    patterns.push({
      id: patternId,
      templateType: 'rest-resource',
      urlPatterns: [escapeRegexPattern(link.href)],
      endpointTemplate: link.href,
      extractors: [],
      method: 'GET',
      headers: {
        Accept: link.type || 'application/json',
      },
      responseFormat: 'json',
      contentMapping: {
        title: isCollection ? 'data' : 'title',
        body: isCollection ? 'data' : 'body',
      },
      validation: {
        requiredFields: [],
        minContentLength: 10,
      },
      metrics: {
        successCount: 0,
        failureCount: 0,
        confidence: link.confidence * 0.8, // Slightly lower since not yet validated
        domains: [domain],
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  linkLogger.debug('Generated patterns from links', {
    links: links.length,
    patterns: patterns.length,
  });

  return patterns;
}

/**
 * Escape special regex characters to create a literal match pattern
 */
function escapeRegexPattern(str: string): string {
  // Escape all regex special characters including * for a literal match
  return '^' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
}
