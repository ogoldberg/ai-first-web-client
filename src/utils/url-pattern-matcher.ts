/**
 * URL Pattern Matching Utility (D-007)
 *
 * Centralized URL and domain pattern matching with support for:
 * - Regex patterns (full RegExp syntax)
 * - Glob patterns (* and ? wildcards)
 * - Simple substring matching (fallback)
 * - Pattern generalization (ID replacement)
 * - Variable extraction from URLs
 */

import { logger } from './logger.js';

const log = logger.create('UrlPatternMatcher');

// ============================================
// TYPES
// ============================================

/**
 * Pattern match result with extracted values
 */
export interface PatternMatchResult {
  /** Whether the pattern matched */
  matched: boolean;
  /** Extracted capture groups (if regex with groups) */
  captures?: string[];
  /** Named capture groups (if regex with named groups) */
  namedCaptures?: Record<string, string>;
  /** The pattern that matched */
  pattern: string;
  /** Match type used */
  matchType: 'regex' | 'glob' | 'substring';
}

/**
 * URL variable extractor configuration
 */
export interface UrlVariableExtractor {
  /** Variable name */
  name: string;
  /** Source to extract from */
  source: 'path' | 'query' | 'subdomain' | 'hostname' | 'hash';
  /** Regex pattern with capture group */
  pattern: string;
  /** Capture group index (1-based, default: 1) */
  group?: number;
  /** Optional transformation */
  transform?: 'lowercase' | 'uppercase' | 'urlencode' | 'urldecode';
}

/**
 * Pattern matching options
 */
export interface PatternMatchOptions {
  /** Case-insensitive matching (default: true) */
  caseInsensitive?: boolean;
  /** Treat pattern as glob (convert * and ?) (default: auto-detect) */
  glob?: boolean;
  /** Allow substring matching as fallback (default: true) */
  allowSubstring?: boolean;
  /** Anchor pattern to full string (default: true for glob) */
  anchor?: boolean;
}

// ============================================
// PATTERN COMPILATION
// ============================================

/**
 * Compiled pattern for efficient reuse
 */
export interface CompiledPattern {
  /** Original pattern string */
  original: string;
  /** Compiled RegExp */
  regex: RegExp;
  /** Pattern type */
  type: 'regex' | 'glob' | 'substring';
}

// Pattern cache for performance
const patternCache = new Map<string, CompiledPattern>();
const MAX_CACHE_SIZE = 1000;

/**
 * Check if a pattern looks like a glob pattern
 */
function isGlobPattern(pattern: string): boolean {
  // Contains unescaped * or ? but not complex regex syntax
  return (
    (pattern.includes('*') || pattern.includes('?')) &&
    !pattern.includes('(') &&
    !pattern.includes('[') &&
    !pattern.includes('{') &&
    !pattern.includes('|') &&
    !pattern.includes('^') &&
    !pattern.includes('$')
  );
}

/**
 * Convert a glob pattern to RegExp
 */
function globToRegex(pattern: string, anchor = true): string {
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars (except * and ?)
    .replace(/\*/g, '.*') // * = any characters
    .replace(/\?/g, '.'); // ? = single character

  if (anchor) {
    regexPattern = `^${regexPattern}$`;
  }

  return regexPattern;
}

/**
 * Compile a pattern for matching
 */
export function compilePattern(
  pattern: string,
  options: PatternMatchOptions = {}
): CompiledPattern {
  const {
    caseInsensitive = true,
    glob,
    allowSubstring = true,
    anchor = true,
  } = options;

  // Check cache
  const cacheKey = `${pattern}:${caseInsensitive}:${glob}:${allowSubstring}:${anchor}`;
  const cached = patternCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const flags = caseInsensitive ? 'i' : '';
  let regex: RegExp;
  let type: 'regex' | 'glob' | 'substring';

  // Determine pattern type
  const useGlob = glob ?? isGlobPattern(pattern);

  if (useGlob) {
    // Glob pattern
    try {
      regex = new RegExp(globToRegex(pattern, anchor), flags);
      type = 'glob';
    } catch {
      // Invalid pattern, fall back to substring
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      type = 'substring';
    }
  } else {
    // Try as regex first
    try {
      regex = new RegExp(pattern, flags);
      type = 'regex';
    } catch {
      // Invalid regex, fall back to substring if allowed
      if (allowSubstring) {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        type = 'substring';
      } else {
        throw new Error(`Invalid regex pattern: ${pattern}`);
      }
    }
  }

  const compiled: CompiledPattern = { original: pattern, regex, type };

  // Add to cache (with eviction)
  if (patternCache.size >= MAX_CACHE_SIZE) {
    const firstKey = patternCache.keys().next().value;
    if (firstKey) {
      patternCache.delete(firstKey);
    }
  }
  patternCache.set(cacheKey, compiled);

  return compiled;
}

/**
 * Clear the pattern cache
 */
export function clearPatternCache(): void {
  patternCache.clear();
}

// ============================================
// PATTERN MATCHING FUNCTIONS
// ============================================

/**
 * Match a string against a pattern
 */
export function matchPattern(
  input: string,
  pattern: string,
  options: PatternMatchOptions = {}
): PatternMatchResult {
  const compiled = compilePattern(pattern, options);
  const match = input.match(compiled.regex);

  if (!match) {
    return {
      matched: false,
      pattern,
      matchType: compiled.type,
    };
  }

  // Extract captures
  const captures = match.slice(1);
  const namedCaptures: Record<string, string> = {};

  // Extract named capture groups if present
  if (match.groups) {
    Object.assign(namedCaptures, match.groups);
  }

  return {
    matched: true,
    captures: captures.length > 0 ? captures : undefined,
    namedCaptures: Object.keys(namedCaptures).length > 0 ? namedCaptures : undefined,
    pattern,
    matchType: compiled.type,
  };
}

/**
 * Test if a string matches a pattern (boolean result)
 */
export function testPattern(
  input: string,
  pattern: string,
  options: PatternMatchOptions = {}
): boolean {
  const compiled = compilePattern(pattern, options);
  return compiled.regex.test(input);
}

/**
 * Match a URL against a pattern
 */
export function matchUrl(
  url: string,
  pattern: string,
  options: PatternMatchOptions = {}
): PatternMatchResult {
  return matchPattern(url, pattern, options);
}

/**
 * Match a domain against a pattern (with glob support)
 */
export function matchDomain(
  domain: string,
  pattern: string,
  options: PatternMatchOptions = {}
): boolean {
  // Domain matching defaults to glob mode
  const domainOptions: PatternMatchOptions = {
    glob: true,
    anchor: true,
    ...options,
  };

  return testPattern(domain, pattern, domainOptions);
}

/**
 * Match against multiple patterns (returns first match)
 */
export function matchAnyPattern(
  input: string,
  patterns: string[],
  options: PatternMatchOptions = {}
): PatternMatchResult | null {
  for (const pattern of patterns) {
    const result = matchPattern(input, pattern, options);
    if (result.matched) {
      return result;
    }
  }
  return null;
}

/**
 * Match against all patterns (returns all matches)
 */
export function matchAllPatterns(
  input: string,
  patterns: string[],
  options: PatternMatchOptions = {}
): PatternMatchResult[] {
  const results: PatternMatchResult[] = [];
  for (const pattern of patterns) {
    const result = matchPattern(input, pattern, options);
    if (result.matched) {
      results.push(result);
    }
  }
  return results;
}

// ============================================
// URL VARIABLE EXTRACTION
// ============================================

/**
 * Extract a variable from a URL using an extractor config
 */
export function extractUrlVariable(
  url: string,
  extractor: UrlVariableExtractor
): string | null {
  try {
    const parsed = new URL(url);
    let source: string;

    switch (extractor.source) {
      case 'path':
        source = parsed.pathname;
        break;
      case 'query':
        source = parsed.search;
        break;
      case 'subdomain': {
        const parts = parsed.hostname.split('.');
        source = parts.length > 2 ? parts.slice(0, -2).join('.') : '';
        break;
      }
      case 'hostname':
        source = parsed.hostname;
        break;
      case 'hash':
        source = parsed.hash;
        break;
      default:
        return null;
    }

    const regex = new RegExp(extractor.pattern);
    const match = source.match(regex);

    if (!match) {
      return null;
    }

    const groupIndex = extractor.group ?? 1;
    let value = match[groupIndex];

    if (!value) {
      return null;
    }

    // Apply transformation
    if (extractor.transform) {
      switch (extractor.transform) {
        case 'lowercase':
          value = value.toLowerCase();
          break;
        case 'uppercase':
          value = value.toUpperCase();
          break;
        case 'urlencode':
          value = encodeURIComponent(value);
          break;
        case 'urldecode':
          value = decodeURIComponent(value);
          break;
      }
    }

    return value;
  } catch (error) {
    log.debug('Failed to extract URL variable', {
      url,
      extractor: extractor.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Extract multiple variables from a URL
 */
export function extractUrlVariables(
  url: string,
  extractors: UrlVariableExtractor[]
): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const extractor of extractors) {
    const value = extractUrlVariable(url, extractor);
    if (value !== null) {
      variables[extractor.name] = value;
    }
  }

  return variables;
}

// ============================================
// URL PATTERN GENERALIZATION
// ============================================

/**
 * Generalize a URL by replacing specific IDs with patterns
 */
export function generalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Replace common ID patterns in the path
    let pathPattern = parsed.pathname
      // Numeric IDs
      .replace(/\/\d+/g, '/[0-9]+')
      // UUIDs (8-4-4-4-12 format)
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/[a-f0-9-]+')
      // Short UUIDs (base62 encoded)
      .replace(/\/[a-zA-Z0-9]{20,}/g, '/[a-zA-Z0-9]+')
      // MongoDB ObjectIds (24 hex chars)
      .replace(/\/[a-f0-9]{24}/gi, '/[a-f0-9]{24}');

    return `${parsed.origin}${pathPattern}`;
  } catch {
    return url;
  }
}

/**
 * Create a regex pattern from a URL with variable segments
 */
export function createUrlPattern(
  url: string,
  variableSegments: Record<string, string> = {}
): string {
  try {
    const parsed = new URL(url);
    let pathPattern = parsed.pathname;

    // Replace specified segments with named capture groups
    for (const [name, segment] of Object.entries(variableSegments)) {
      const escapedSegment = segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pathPattern = pathPattern.replace(
        new RegExp(escapedSegment, 'g'),
        `(?<${name}>[^/]+)`
      );
    }

    // Escape remaining special characters
    const origin = parsed.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return `^${origin}${pathPattern}$`;
  } catch {
    return url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================
// SKIP PATTERN MATCHING
// ============================================

/**
 * Check if a URL should be skipped based on skip patterns
 *
 * Supports both glob patterns (* wildcards) and regex patterns.
 */
export function shouldSkipUrl(url: string, skipPatterns: string[]): boolean {
  for (const pattern of skipPatterns) {
    if (testPattern(url, pattern, { allowSubstring: true })) {
      return true;
    }
  }
  return false;
}

/**
 * Filter URLs that don't match any skip patterns
 */
export function filterUrls(urls: string[], skipPatterns: string[]): string[] {
  return urls.filter((url) => !shouldSkipUrl(url, skipPatterns));
}

// ============================================
// DOMAIN HELPERS
// ============================================

/**
 * Extract the root domain from a URL or hostname
 */
export function getRootDomain(urlOrHostname: string): string {
  try {
    let hostname: string;

    if (urlOrHostname.includes('://')) {
      hostname = new URL(urlOrHostname).hostname;
    } else {
      hostname = urlOrHostname;
    }

    const parts = hostname.split('.');
    if (parts.length <= 2) {
      return hostname;
    }

    // Handle common multi-part TLDs
    const multiPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in'];
    const lastTwo = parts.slice(-2).join('.');

    if (multiPartTlds.includes(lastTwo)) {
      return parts.slice(-3).join('.');
    }

    return parts.slice(-2).join('.');
  } catch {
    return urlOrHostname;
  }
}

/**
 * Check if a domain matches a list of domain patterns
 */
export function isDomainInList(domain: string, domainPatterns: string[]): boolean {
  const normalizedDomain = domain.toLowerCase();
  const rootDomain = getRootDomain(normalizedDomain);

  for (const pattern of domainPatterns) {
    // Check exact match
    if (normalizedDomain === pattern.toLowerCase()) {
      return true;
    }
    // Check root domain match
    if (rootDomain === pattern.toLowerCase()) {
      return true;
    }
    // Check pattern match (glob)
    if (matchDomain(normalizedDomain, pattern)) {
      return true;
    }
  }

  return false;
}

// ============================================
// PATTERN VALIDATION
// ============================================

/**
 * Validate that a string is a valid regex pattern
 */
export function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape a string for use in a regex pattern
 */
export function escapeRegexPattern(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create an anchored literal pattern from a string
 */
export function createLiteralPattern(str: string): string {
  return `^${escapeRegexPattern(str)}$`;
}
