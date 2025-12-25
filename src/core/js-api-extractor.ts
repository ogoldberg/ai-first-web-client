/**
 * JavaScript API Extractor
 *
 * Extracts API URLs by analyzing JavaScript code in HTML pages.
 * This performs static analysis of script tags to find:
 * - fetch() calls
 * - axios requests
 * - XMLHttpRequest usage
 * - API base URLs in config objects
 * - GraphQL endpoints
 */

import { logger } from '../utils/logger.js';

/**
 * Check if a string looks like an API URL
 */
export function looksLikeApiUrl(str: string): boolean {
  if (!str || str.length < 2) return false;

  // Must start with / or http
  if (!str.startsWith('/') && !str.startsWith('http')) return false;

  // Skip obvious non-API patterns
  const skipPatterns = [
    /^\/\//,           // Protocol-relative URLs (usually CDN)
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,  // Static assets
    /^\/static\//,     // Static files
    /^\/assets\//,     // Asset files
    /^\/images?\//i,   // Image directories
    /^\/fonts?\//i,    // Font directories
    /^\/_next\/static/,// Next.js static assets
    /^\/favicon/,      // Favicons
    /^javascript:/,    // JavaScript pseudo-protocol
    /^#/,              // Hash links
    /^mailto:/,        // Email links
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(str)) return false;
  }

  // Positive indicators that this is an API
  const apiIndicators = [
    /\/api\//i,
    /\/v\d+\//,        // Versioned APIs like /v1/, /v2/
    /\/rest\//i,
    /\/graphql/i,
    /\/data\//i,
    /\/json/i,
    /\.json$/i,
    /\/feed/i,
    /\/query/i,
    /\/search/i,
    /\/get/i,
    /\/fetch/i,
    /\/load/i,
  ];

  for (const pattern of apiIndicators) {
    if (pattern.test(str)) return true;
  }

  // If it looks like a path that could return data, accept it
  // But be conservative - we'd rather miss some than try too many
  return str.includes('/api') || str.includes('.json') || str.includes('/data');
}

/**
 * Resolve a potentially relative API URL to absolute
 */
export function resolveApiUrl(url: string, origin: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  if (url.startsWith('/')) {
    return origin + url;
  }
  return origin + '/' + url;
}

/**
 * Predict common API endpoint patterns based on URL structure
 */
export function predictAPIEndpoints(url: URL): string[] {
  const predictions: string[] = [];
  const path = url.pathname;

  // Common API patterns
  predictions.push(`${url.origin}/api${path}`);
  predictions.push(`${url.origin}/api/v1${path}`);
  predictions.push(`${url.origin}${path}.json`);

  // Next.js data routes
  predictions.push(`${url.origin}/_next/data/development${path}.json`);

  // WordPress REST API
  if (path.match(/\/\d{4}\/\d{2}\/[\w-]+/)) {
    // Blog post pattern
    const slug = path.split('/').pop();
    predictions.push(`${url.origin}/wp-json/wp/v2/posts?slug=${slug}`);
  }

  // GraphQL (POST, but we can try GET)
  predictions.push(`${url.origin}/graphql?query={page(path:"${path}"){title,content}}`);

  return predictions;
}

/**
 * Extract API URLs by analyzing JavaScript code in the page
 *
 * This performs static analysis of script tags to find:
 * - fetch() calls
 * - axios requests
 * - XMLHttpRequest usage
 * - API base URLs in config objects
 * - GraphQL endpoints
 */
export function extractApisFromJavaScript(html: string, pageUrl: URL): string[] {
  const apis: string[] = [];
  const origin = pageUrl.origin;

  // Extract all inline scripts
  const scriptContents: string[] = [];

  // Get inline script contents
  const inlineScriptRegex = /<script[^>]*>([^<]*(?:(?!<\/script>)<[^<]*)*)<\/script>/gi;
  let match;
  while ((match = inlineScriptRegex.exec(html)) !== null) {
    if (match[1] && match[1].trim().length > 10) {
      scriptContents.push(match[1]);
    }
  }

  // Also look for API URLs in data attributes and JSON embedded in HTML
  const dataJsonRegex = /data-(?:api|endpoint|url|config)[^=]*="([^"]+)"/gi;
  while ((match = dataJsonRegex.exec(html)) !== null) {
    const value = match[1];
    if (looksLikeApiUrl(value)) {
      apis.push(resolveApiUrl(value, origin));
    }
  }

  // Process all script contents
  for (const script of scriptContents) {
    // Pattern 1: fetch() calls
    // Matches: fetch('/api/...'), fetch("https://..."), fetch(`${baseUrl}/api`)
    const fetchRegex = /fetch\s*\(\s*['"`]([^'"`\s]+)['"`]/g;
    while ((match = fetchRegex.exec(script)) !== null) {
      if (looksLikeApiUrl(match[1])) {
        apis.push(resolveApiUrl(match[1], origin));
      }
    }

    // Pattern 2: axios calls
    // Matches: axios.get('/api'), axios.post('/api'), axios('/api'), axios({ url: '/api' })
    const axiosRegex = /axios(?:\.(?:get|post|put|delete|patch))?\s*\(\s*['"`]([^'"`\s]+)['"`]/g;
    while ((match = axiosRegex.exec(script)) !== null) {
      if (looksLikeApiUrl(match[1])) {
        apis.push(resolveApiUrl(match[1], origin));
      }
    }

    // Pattern 3: URL/endpoint configurations
    // Matches: apiUrl: '/api', endpoint: 'https://...', baseURL: '...'
    const configRegex = /(?:api[Uu]rl|endpoint|baseURL|apiEndpoint|apiBase|dataUrl|fetchUrl|requestUrl)\s*[=:]\s*['"`]([^'"`\s]+)['"`]/g;
    while ((match = configRegex.exec(script)) !== null) {
      if (looksLikeApiUrl(match[1])) {
        apis.push(resolveApiUrl(match[1], origin));
      }
    }

    // Pattern 4: XMLHttpRequest open method
    // Matches: .open('GET', '/api/...')
    const xhrRegex = /\.open\s*\(\s*['"`](?:GET|POST|PUT|DELETE)['"`]\s*,\s*['"`]([^'"`\s]+)['"`]/gi;
    while ((match = xhrRegex.exec(script)) !== null) {
      if (looksLikeApiUrl(match[1])) {
        apis.push(resolveApiUrl(match[1], origin));
      }
    }

    // Pattern 5: GraphQL endpoints
    // Matches: '/graphql', '/api/graphql', 'https://.../graphql'
    const graphqlRegex = /['"`]([^'"`]*\/graphql[^'"`]*)['"`]/gi;
    while ((match = graphqlRegex.exec(script)) !== null) {
      apis.push(resolveApiUrl(match[1], origin));
    }

    // Pattern 6: REST-like URL patterns in strings
    // Matches URLs that look like API endpoints
    const restRegex = /['"`]((?:https?:\/\/[^'"`\s]+)?\/(?:api|v\d+|rest|data|json|feed)[^'"`\s]*)['"`]/gi;
    while ((match = restRegex.exec(script)) !== null) {
      if (looksLikeApiUrl(match[1])) {
        apis.push(resolveApiUrl(match[1], origin));
      }
    }

    // Pattern 7: Next.js API routes
    const nextApiRegex = /['"`](\/api\/[^'"`\s]+)['"`]/g;
    while ((match = nextApiRegex.exec(script)) !== null) {
      apis.push(resolveApiUrl(match[1], origin));
    }

    // Pattern 8: .json endpoints
    const jsonEndpointRegex = /['"`]([^'"`\s]+\.json)['"`]/g;
    while ((match = jsonEndpointRegex.exec(script)) !== null) {
      // Avoid false positives like 'package.json' or '.json' config files
      if (!match[1].includes('package.json') &&
          !match[1].includes('tsconfig') &&
          !match[1].includes('node_modules') &&
          looksLikeApiUrl(match[1])) {
        apis.push(resolveApiUrl(match[1], origin));
      }
    }
  }

  // Deduplicate and filter
  const uniqueApis = [...new Set(apis)]
    .filter(url => {
      try {
        const parsed = new URL(url);
        // Only keep URLs from same origin or absolute URLs
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    })
    .slice(0, 20); // Limit to 20 endpoints to avoid hammering servers

  if (uniqueApis.length > 0) {
    logger.intelligence.debug(`Extracted ${uniqueApis.length} API URLs from JavaScript`, {
      urls: uniqueApis.slice(0, 5), // Log first 5
    });
  }

  return uniqueApis;
}
