/**
 * Backend Framework Fingerprinting (D-010)
 *
 * Detects backend frameworks from HTTP headers and HTML patterns,
 * then applies convention-based API patterns for each framework.
 *
 * Supported frameworks:
 * - Rails (Ruby)
 * - Django (Python)
 * - Phoenix (Elixir)
 * - FastAPI (Python)
 * - Spring Boot (Java)
 * - Laravel (PHP)
 * - Express (Node.js)
 * - ASP.NET Core (C#)
 *
 * Detection methods:
 * 1. HTTP response headers (X-Powered-By, X-Runtime, Server, etc.)
 * 2. Cookie patterns (session cookie names, CSRF tokens)
 * 3. HTML patterns (meta tags, CSRF token names, asset paths)
 * 4. Error page signatures
 * 5. API endpoint conventions
 */

import { logger } from '../utils/logger.js';
import type { LearnedApiPattern } from '../types/api-patterns.js';

// ============================================
// TYPES
// ============================================

/**
 * Supported backend frameworks
 */
export type BackendFramework =
  | 'rails'
  | 'django'
  | 'phoenix'
  | 'fastapi'
  | 'spring-boot'
  | 'laravel'
  | 'express'
  | 'aspnet-core'
  | 'unknown';

/**
 * Evidence for a framework detection
 */
export interface FrameworkEvidence {
  /** Type of evidence */
  type: 'header' | 'cookie' | 'html' | 'error-page' | 'endpoint';
  /** The specific indicator found */
  indicator: string;
  /** Value that matched */
  value: string;
  /** Confidence contribution (0-1) */
  weight: number;
}

/**
 * Result of framework fingerprinting
 */
export interface FrameworkFingerprintResult {
  /** Detected framework (or 'unknown') */
  framework: BackendFramework;
  /** Confidence in detection (0-1) */
  confidence: number;
  /** All evidence collected */
  evidence: FrameworkEvidence[];
  /** Framework version if detectable */
  version?: string;
  /** Suggested API patterns based on framework conventions */
  suggestedPatterns: FrameworkApiPattern[];
  /** Time taken for fingerprinting (ms) */
  fingerprintTime: number;
}

/**
 * Convention-based API pattern for a framework
 */
export interface FrameworkApiPattern {
  /** Pattern path (e.g., '/api/v1/{resource}') */
  path: string;
  /** HTTP methods typically supported */
  methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  /** Description of the pattern */
  description: string;
  /** Confidence in this pattern */
  confidence: number;
}

/**
 * Options for framework fingerprinting
 */
export interface FingerprintOptions {
  /** Custom headers for requests */
  headers?: Record<string, string>;
  /** Request timeout (ms) */
  timeout?: number;
  /** Custom fetch function */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Skip certain detection methods */
  skipMethods?: Array<'header' | 'cookie' | 'html' | 'error-page' | 'endpoint'>;
}

/**
 * Discovery result with caching
 */
export interface BackendFrameworkDiscoveryResult {
  /** Whether a framework was detected */
  found: boolean;
  /** The fingerprinting result */
  result?: FrameworkFingerprintResult;
  /** Patterns generated from framework conventions */
  patterns: LearnedApiPattern[];
  /** Error message if discovery failed */
  error?: string;
  /** When this was cached */
  cachedAt?: number;
}

// ============================================
// CONSTANTS
// ============================================

const fingerprintLogger = logger.create('BackendFrameworkFingerprinting');

/** Cache TTL: 2 hours (frameworks don't change often) */
export const FRAMEWORK_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

/** Default request timeout */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Minimum confidence to report a detection */
export const MIN_DETECTION_CONFIDENCE = 0.4;

// ============================================
// FRAMEWORK SIGNATURES
// ============================================

/**
 * Header signatures for each framework
 */
export const HEADER_SIGNATURES: Record<BackendFramework, Array<{
  header: string;
  pattern: RegExp;
  weight: number;
  extractVersion?: RegExp;
}>> = {
  rails: [
    { header: 'x-powered-by', pattern: /phusion.?passenger/i, weight: 0.7 },
    { header: 'x-runtime', pattern: /^\d+\.\d+$/, weight: 0.6 },
    { header: 'x-request-id', pattern: /^[a-f0-9-]{36}$/i, weight: 0.3 },
    { header: 'x-content-type-options', pattern: /nosniff/i, weight: 0.1 },
    { header: 'x-download-options', pattern: /noopen/i, weight: 0.2 },
    { header: 'x-permitted-cross-domain-policies', pattern: /none/i, weight: 0.2 },
  ],
  django: [
    { header: 'x-frame-options', pattern: /SAMEORIGIN|DENY/i, weight: 0.1 },
    { header: 'vary', pattern: /Cookie/i, weight: 0.2 },
    { header: 'content-language', pattern: /.+/, weight: 0.1 },
    { header: 'x-content-type-options', pattern: /nosniff/i, weight: 0.1 },
  ],
  phoenix: [
    { header: 'x-request-id', pattern: /^[A-Za-z0-9-]+$/, weight: 0.3 },
    { header: 'server', pattern: /cowboy/i, weight: 0.6 },
    { header: 'cache-control', pattern: /max-age=0.*private.*must-revalidate/i, weight: 0.3 },
  ],
  fastapi: [
    { header: 'server', pattern: /uvicorn/i, weight: 0.8, extractVersion: /uvicorn\/?([\d.]+)?/i },
    { header: 'server', pattern: /hypercorn/i, weight: 0.7 },
    { header: 'server', pattern: /daphne/i, weight: 0.5 },
  ],
  'spring-boot': [
    { header: 'x-application-context', pattern: /.+/, weight: 0.9 },
    { header: 'x-content-type-options', pattern: /nosniff/i, weight: 0.1 },
    { header: 'x-xss-protection', pattern: /1;\s*mode=block/i, weight: 0.2 },
    { header: 'server', pattern: /apache-coyote/i, weight: 0.5 },
  ],
  laravel: [
    { header: 'x-powered-by', pattern: /PHP/i, weight: 0.3 },
    { header: 'server', pattern: /Apache|nginx/i, weight: 0.1 },
  ],
  express: [
    { header: 'x-powered-by', pattern: /Express/i, weight: 0.9 },
    { header: 'etag', pattern: /^W\/"[^"]+"$/, weight: 0.2 },
  ],
  'aspnet-core': [
    { header: 'x-powered-by', pattern: /ASP\.NET/i, weight: 0.9 },
    { header: 'x-aspnet-version', pattern: /[\d.]+/, weight: 0.9, extractVersion: /([\d.]+)/ },
    { header: 'x-aspnetmvc-version', pattern: /[\d.]+/, weight: 0.8, extractVersion: /([\d.]+)/ },
    { header: 'server', pattern: /Kestrel/i, weight: 0.8 },
    { header: 'server', pattern: /Microsoft-IIS/i, weight: 0.6 },
  ],
  unknown: [],
};

/**
 * Cookie name patterns for each framework
 */
export const COOKIE_SIGNATURES: Record<BackendFramework, Array<{
  pattern: RegExp;
  weight: number;
}>> = {
  rails: [
    { pattern: /_[a-z_]+_session/, weight: 0.7 },
    { pattern: /_csrf_token/, weight: 0.3 },
  ],
  django: [
    { pattern: /csrftoken/, weight: 0.8 },
    { pattern: /sessionid/, weight: 0.6 },
    { pattern: /django_language/, weight: 0.5 },
  ],
  phoenix: [
    { pattern: /_[a-z_]+_key/, weight: 0.6 },
    { pattern: /_csrf_token/, weight: 0.4 },
  ],
  fastapi: [],
  'spring-boot': [
    { pattern: /JSESSIONID/i, weight: 0.6 },
    { pattern: /XSRF-TOKEN/i, weight: 0.4 },
  ],
  laravel: [
    { pattern: /laravel_session/, weight: 0.9 },
    { pattern: /XSRF-TOKEN/i, weight: 0.5 },
    { pattern: /[a-z]+_session/, weight: 0.3 },
  ],
  express: [
    { pattern: /connect\.sid/, weight: 0.7 },
    { pattern: /express:sess/, weight: 0.6 },
  ],
  'aspnet-core': [
    { pattern: /\.AspNetCore\./i, weight: 0.9 },
    { pattern: /ASP\.NET_SessionId/i, weight: 0.8 },
    { pattern: /__RequestVerificationToken/i, weight: 0.7 },
  ],
  unknown: [],
};

/**
 * HTML patterns for each framework
 */
export const HTML_SIGNATURES: Record<BackendFramework, Array<{
  type: 'meta' | 'input' | 'script' | 'comment' | 'class' | 'id';
  pattern: RegExp;
  weight: number;
}>> = {
  rails: [
    { type: 'meta', pattern: /name=["']csrf-param["'].*content=["']authenticity_token["']/i, weight: 0.9 },
    { type: 'input', pattern: /name=["']authenticity_token["']/i, weight: 0.9 },
    { type: 'meta', pattern: /name=["']turbo-visit-control["']/i, weight: 0.7 },
    { type: 'script', pattern: /turbo\.es2017-esm\.js/i, weight: 0.6 },
    { type: 'script', pattern: /rails-ujs/i, weight: 0.8 },
    { type: 'comment', pattern: /<!--\s*Rails/i, weight: 0.5 },
  ],
  django: [
    { type: 'input', pattern: /name=["']csrfmiddlewaretoken["']/i, weight: 0.95 },
    { type: 'meta', pattern: /name=["']csrf-token["']/i, weight: 0.4 },
    { type: 'script', pattern: /django\.jQuery/i, weight: 0.6 },
    { type: 'id', pattern: /id=["']djDebug["']/i, weight: 0.9 },
  ],
  phoenix: [
    { type: 'input', pattern: /name=["']_csrf_token["']/i, weight: 0.8 },
    { type: 'meta', pattern: /name=["']csrf-token["']/i, weight: 0.4 },
    { type: 'script', pattern: /phoenix\.js/i, weight: 0.9 },
    { type: 'script', pattern: /phoenix_live_view/i, weight: 0.9 },
    { type: 'meta', pattern: /phx-/i, weight: 0.7 },
    { type: 'class', pattern: /phx-connected|phx-loading/i, weight: 0.8 },
  ],
  fastapi: [
    { type: 'script', pattern: /swagger-ui/i, weight: 0.4 },
    { type: 'script', pattern: /redoc/i, weight: 0.4 },
  ],
  'spring-boot': [
    { type: 'input', pattern: /name=["']_csrf["']/i, weight: 0.7 },
    { type: 'meta', pattern: /name=["']_csrf["']/i, weight: 0.6 },
    { type: 'input', pattern: /name=["']_csrf_header["']/i, weight: 0.7 },
    { type: 'comment', pattern: /Spring MVC|Thymeleaf/i, weight: 0.5 },
  ],
  laravel: [
    { type: 'input', pattern: /name=["']_token["']/i, weight: 0.8 },
    { type: 'meta', pattern: /name=["']csrf-token["']/i, weight: 0.7 },
    { type: 'script', pattern: /laravel-echo/i, weight: 0.8 },
    { type: 'script', pattern: /mix-manifest/i, weight: 0.5 },
    { type: 'script', pattern: /\/vendor\/livewire/i, weight: 0.9 },
  ],
  express: [
    { type: 'meta', pattern: /name=["']csrf-token["']/i, weight: 0.2 },
    { type: 'input', pattern: /name=["']_csrf["']/i, weight: 0.3 },
  ],
  'aspnet-core': [
    { type: 'input', pattern: /name=["']__RequestVerificationToken["']/i, weight: 0.95 },
    { type: 'script', pattern: /blazor\.server\.js/i, weight: 0.95 },
    { type: 'script', pattern: /blazor\.webassembly\.js/i, weight: 0.95 },
    { type: 'script', pattern: /_framework/i, weight: 0.7 },
    { type: 'comment', pattern: /ASP\.NET|Razor/i, weight: 0.5 },
  ],
  unknown: [],
};

/**
 * API endpoint conventions for each framework
 */
export const API_CONVENTIONS: Record<BackendFramework, FrameworkApiPattern[]> = {
  rails: [
    {
      path: '/api/v1/{resource}',
      methods: ['GET', 'POST'],
      description: 'Rails API versioned resources (list/create)',
      confidence: 0.8,
    },
    {
      path: '/api/v1/{resource}/{id}',
      methods: ['GET', 'PUT', 'PATCH', 'DELETE'],
      description: 'Rails API versioned resource (show/update/delete)',
      confidence: 0.8,
    },
    {
      path: '/api/{resource}',
      methods: ['GET', 'POST'],
      description: 'Rails API resources (list/create)',
      confidence: 0.7,
    },
    {
      path: '/{resource}.json',
      methods: ['GET'],
      description: 'Rails respond_to JSON suffix pattern',
      confidence: 0.6,
    },
    {
      path: '/rails/info/routes',
      methods: ['GET'],
      description: 'Rails routes info (development)',
      confidence: 0.5,
    },
  ],
  django: [
    {
      path: '/api/{resource}/',
      methods: ['GET', 'POST'],
      description: 'Django REST Framework resources (trailing slash)',
      confidence: 0.8,
    },
    {
      path: '/api/{resource}/{id}/',
      methods: ['GET', 'PUT', 'PATCH', 'DELETE'],
      description: 'Django REST Framework resource detail',
      confidence: 0.8,
    },
    {
      path: '/api/v1/{resource}/',
      methods: ['GET', 'POST'],
      description: 'Django REST Framework versioned resources',
      confidence: 0.8,
    },
    {
      path: '/api-auth/',
      methods: ['GET'],
      description: 'Django REST Framework browsable API auth',
      confidence: 0.7,
    },
    {
      path: '/admin/',
      methods: ['GET'],
      description: 'Django admin interface',
      confidence: 0.6,
    },
  ],
  phoenix: [
    {
      path: '/api/{context}/{resource}',
      methods: ['GET', 'POST'],
      description: 'Phoenix contexts pattern',
      confidence: 0.7,
    },
    {
      path: '/api/{resource}',
      methods: ['GET', 'POST'],
      description: 'Phoenix API resources',
      confidence: 0.8,
    },
    {
      path: '/api/{resource}/{id}',
      methods: ['GET', 'PUT', 'PATCH', 'DELETE'],
      description: 'Phoenix API resource detail',
      confidence: 0.8,
    },
    {
      path: '/socket/websocket',
      methods: ['GET'],
      description: 'Phoenix WebSocket endpoint',
      confidence: 0.7,
    },
    {
      path: '/live',
      methods: ['GET'],
      description: 'Phoenix LiveView endpoint',
      confidence: 0.6,
    },
  ],
  fastapi: [
    {
      path: '/docs',
      methods: ['GET'],
      description: 'FastAPI Swagger UI',
      confidence: 0.9,
    },
    {
      path: '/redoc',
      methods: ['GET'],
      description: 'FastAPI ReDoc',
      confidence: 0.9,
    },
    {
      path: '/openapi.json',
      methods: ['GET'],
      description: 'FastAPI OpenAPI spec',
      confidence: 0.95,
    },
    {
      path: '/api/v1/{resource}',
      methods: ['GET', 'POST'],
      description: 'FastAPI versioned resources',
      confidence: 0.7,
    },
    {
      path: '/api/{resource}/{id}',
      methods: ['GET', 'PUT', 'DELETE'],
      description: 'FastAPI resource detail',
      confidence: 0.7,
    },
  ],
  'spring-boot': [
    {
      path: '/actuator',
      methods: ['GET'],
      description: 'Spring Boot Actuator root',
      confidence: 0.95,
    },
    {
      path: '/actuator/health',
      methods: ['GET'],
      description: 'Spring Boot health endpoint',
      confidence: 0.95,
    },
    {
      path: '/actuator/info',
      methods: ['GET'],
      description: 'Spring Boot info endpoint',
      confidence: 0.9,
    },
    {
      path: '/api/v1/{resource}',
      methods: ['GET', 'POST'],
      description: 'Spring Boot REST resources',
      confidence: 0.8,
    },
    {
      path: '/api/{resource}/{id}',
      methods: ['GET', 'PUT', 'DELETE'],
      description: 'Spring Boot REST resource detail',
      confidence: 0.8,
    },
    {
      path: '/v3/api-docs',
      methods: ['GET'],
      description: 'Spring Boot OpenAPI spec',
      confidence: 0.85,
    },
    {
      path: '/swagger-ui.html',
      methods: ['GET'],
      description: 'Spring Boot Swagger UI',
      confidence: 0.8,
    },
  ],
  laravel: [
    {
      path: '/api/{resource}',
      methods: ['GET', 'POST'],
      description: 'Laravel API resources',
      confidence: 0.8,
    },
    {
      path: '/api/{resource}/{id}',
      methods: ['GET', 'PUT', 'PATCH', 'DELETE'],
      description: 'Laravel API resource detail',
      confidence: 0.8,
    },
    {
      path: '/sanctum/csrf-cookie',
      methods: ['GET'],
      description: 'Laravel Sanctum CSRF cookie',
      confidence: 0.95,
    },
    {
      path: '/api/user',
      methods: ['GET'],
      description: 'Laravel authenticated user endpoint',
      confidence: 0.7,
    },
    {
      path: '/broadcasting/auth',
      methods: ['POST'],
      description: 'Laravel Echo broadcasting auth',
      confidence: 0.8,
    },
  ],
  express: [
    {
      path: '/api/{resource}',
      methods: ['GET', 'POST'],
      description: 'Express API resources',
      confidence: 0.7,
    },
    {
      path: '/api/v1/{resource}',
      methods: ['GET', 'POST'],
      description: 'Express versioned API resources',
      confidence: 0.7,
    },
    {
      path: '/api/{resource}/{id}',
      methods: ['GET', 'PUT', 'PATCH', 'DELETE'],
      description: 'Express API resource detail',
      confidence: 0.7,
    },
    {
      path: '/health',
      methods: ['GET'],
      description: 'Express health check',
      confidence: 0.5,
    },
    {
      path: '/status',
      methods: ['GET'],
      description: 'Express status endpoint',
      confidence: 0.5,
    },
  ],
  'aspnet-core': [
    {
      path: '/api/{controller}',
      methods: ['GET', 'POST'],
      description: 'ASP.NET Core Web API controller',
      confidence: 0.8,
    },
    {
      path: '/api/{controller}/{id}',
      methods: ['GET', 'PUT', 'DELETE'],
      description: 'ASP.NET Core Web API controller action',
      confidence: 0.8,
    },
    {
      path: '/api/v{version}/{controller}',
      methods: ['GET', 'POST'],
      description: 'ASP.NET Core versioned API',
      confidence: 0.8,
    },
    {
      path: '/swagger',
      methods: ['GET'],
      description: 'ASP.NET Core Swagger UI redirect',
      confidence: 0.7,
    },
    {
      path: '/swagger/v1/swagger.json',
      methods: ['GET'],
      description: 'ASP.NET Core Swagger spec',
      confidence: 0.85,
    },
    {
      path: '/_blazor',
      methods: ['GET'],
      description: 'Blazor SignalR hub',
      confidence: 0.9,
    },
  ],
  unknown: [],
};

// ============================================
// CACHE
// ============================================

interface CacheEntry {
  result: BackendFrameworkDiscoveryResult;
  expiresAt: number;
}

const frameworkCache = new Map<string, CacheEntry>();

/**
 * Get cached fingerprint result
 */
export function getCachedFingerprint(domain: string): BackendFrameworkDiscoveryResult | null {
  const entry = frameworkCache.get(domain);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    frameworkCache.delete(domain);
    return null;
  }

  return entry.result;
}

/**
 * Cache a fingerprint result
 */
export function cacheFingerprint(
  domain: string,
  result: BackendFrameworkDiscoveryResult,
  ttlMs: number = FRAMEWORK_CACHE_TTL_MS
): void {
  frameworkCache.set(domain, {
    result: {
      ...result,
      cachedAt: Date.now(),
    },
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Clear fingerprint cache
 */
export function clearFingerprintCache(domain?: string): void {
  if (domain) {
    frameworkCache.delete(domain);
  } else {
    frameworkCache.clear();
  }
}

// ============================================
// FINGERPRINTING FUNCTIONS
// ============================================

/**
 * Analyze HTTP headers for framework signatures
 */
export function analyzeHeaders(
  headers: Headers | Record<string, string>
): Map<BackendFramework, FrameworkEvidence[]> {
  const results = new Map<BackendFramework, FrameworkEvidence[]>();

  // Initialize results for each framework
  for (const framework of Object.keys(HEADER_SIGNATURES) as BackendFramework[]) {
    results.set(framework, []);
  }

  // Convert to entries for iteration
  const headerEntries: Array<[string, string]> = headers instanceof Headers
    ? [...headers.entries()]
    : Object.entries(headers);

  for (const [framework, signatures] of Object.entries(HEADER_SIGNATURES) as Array<[BackendFramework, typeof HEADER_SIGNATURES.rails]>) {
    const evidenceList = results.get(framework) || [];

    for (const sig of signatures) {
      const headerValue = headerEntries.find(
        ([name]) => name.toLowerCase() === sig.header.toLowerCase()
      )?.[1];

      if (headerValue && sig.pattern.test(headerValue)) {
        evidenceList.push({
          type: 'header',
          indicator: sig.header,
          value: headerValue,
          weight: sig.weight,
        });
      }
    }

    results.set(framework, evidenceList);
  }

  return results;
}

/**
 * Analyze cookies for framework signatures
 */
export function analyzeCookies(
  cookieHeader: string | null
): Map<BackendFramework, FrameworkEvidence[]> {
  const results = new Map<BackendFramework, FrameworkEvidence[]>();

  // Initialize results for each framework
  for (const framework of Object.keys(COOKIE_SIGNATURES) as BackendFramework[]) {
    results.set(framework, []);
  }

  if (!cookieHeader) {
    return results;
  }

  // Parse cookie names from Set-Cookie or Cookie header
  const cookieNames = cookieHeader
    .split(/[;,]/)
    .map(part => part.trim().split('=')[0])
    .filter(Boolean);

  for (const [framework, signatures] of Object.entries(COOKIE_SIGNATURES) as Array<[BackendFramework, typeof COOKIE_SIGNATURES.rails]>) {
    const evidenceList = results.get(framework) || [];

    for (const sig of signatures) {
      const matchingCookie = cookieNames.find(name => sig.pattern.test(name));
      if (matchingCookie) {
        evidenceList.push({
          type: 'cookie',
          indicator: 'cookie-name',
          value: matchingCookie,
          weight: sig.weight,
        });
      }
    }

    results.set(framework, evidenceList);
  }

  return results;
}

/**
 * Analyze HTML content for framework signatures
 */
export function analyzeHtml(
  html: string
): Map<BackendFramework, FrameworkEvidence[]> {
  const results = new Map<BackendFramework, FrameworkEvidence[]>();

  // Initialize results for each framework
  for (const framework of Object.keys(HTML_SIGNATURES) as BackendFramework[]) {
    results.set(framework, []);
  }

  for (const [framework, signatures] of Object.entries(HTML_SIGNATURES) as Array<[BackendFramework, typeof HTML_SIGNATURES.rails]>) {
    const evidenceList = results.get(framework) || [];

    for (const sig of signatures) {
      if (sig.pattern.test(html)) {
        const match = html.match(sig.pattern);
        evidenceList.push({
          type: 'html',
          indicator: sig.type,
          value: match ? match[0].substring(0, 100) : sig.pattern.source,
          weight: sig.weight,
        });
      }
    }

    results.set(framework, evidenceList);
  }

  return results;
}

/**
 * Combine evidence from multiple sources and determine the most likely framework
 */
export function combineEvidence(
  headerEvidence: Map<BackendFramework, FrameworkEvidence[]>,
  cookieEvidence: Map<BackendFramework, FrameworkEvidence[]>,
  htmlEvidence: Map<BackendFramework, FrameworkEvidence[]>
): { framework: BackendFramework; confidence: number; evidence: FrameworkEvidence[] } {
  const scores = new Map<BackendFramework, { score: number; evidence: FrameworkEvidence[] }>();

  // Initialize scores
  for (const framework of Object.keys(HEADER_SIGNATURES) as BackendFramework[]) {
    scores.set(framework, { score: 0, evidence: [] });
  }

  // Combine evidence from all sources
  for (const framework of scores.keys()) {
    const entry = scores.get(framework)!;

    const hdrEv = headerEvidence.get(framework) || [];
    const ckEv = cookieEvidence.get(framework) || [];
    const htmEv = htmlEvidence.get(framework) || [];

    entry.evidence = [...hdrEv, ...ckEv, ...htmEv];

    // Calculate weighted score
    for (const ev of entry.evidence) {
      entry.score += ev.weight;
    }
  }

  // Find framework with highest score
  let bestFramework: BackendFramework = 'unknown';
  let bestScore = 0;
  let bestEvidence: FrameworkEvidence[] = [];

  for (const [framework, entry] of scores) {
    if (entry.score > bestScore && framework !== 'unknown') {
      bestScore = entry.score;
      bestFramework = framework;
      bestEvidence = entry.evidence;
    }
  }

  // Normalize confidence to 0-1 range (cap at 2.0 total weight for full confidence)
  const confidence = Math.min(bestScore / 2.0, 1.0);

  return {
    framework: confidence >= MIN_DETECTION_CONFIDENCE ? bestFramework : 'unknown',
    confidence,
    evidence: bestEvidence,
  };
}

/**
 * Fingerprint a domain to detect its backend framework
 */
export async function fingerprintBackendFramework(
  domain: string,
  options: FingerprintOptions = {}
): Promise<FrameworkFingerprintResult> {
  const startTime = Date.now();
  const fetchFn = options.fetchFn || globalThis.fetch;
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const skipMethods = new Set(options.skipMethods || []);

  const url = `https://${domain}`;
  let headers: Headers | null = null;
  let html = '';
  let cookieHeader: string | null = null;

  // Fetch the page
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...options.headers,
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    headers = response.headers;
    cookieHeader = response.headers.get('set-cookie');
    html = await response.text();
  } catch (error) {
    fingerprintLogger.warn('Failed to fetch page for fingerprinting', { domain, error });
    // Return empty result if we can't fetch
    return {
      framework: 'unknown',
      confidence: 0,
      evidence: [],
      suggestedPatterns: [],
      fingerprintTime: Date.now() - startTime,
    };
  }

  // Analyze evidence from different sources
  const headerEvidence = !skipMethods.has('header') && headers
    ? analyzeHeaders(headers)
    : new Map<BackendFramework, FrameworkEvidence[]>();

  const cookieEvidence = !skipMethods.has('cookie')
    ? analyzeCookies(cookieHeader)
    : new Map<BackendFramework, FrameworkEvidence[]>();

  const htmlEvidence = !skipMethods.has('html')
    ? analyzeHtml(html)
    : new Map<BackendFramework, FrameworkEvidence[]>();

  // Combine evidence and determine framework
  const { framework, confidence, evidence } = combineEvidence(
    headerEvidence,
    cookieEvidence,
    htmlEvidence
  );

  // Get suggested patterns for detected framework
  const suggestedPatterns = API_CONVENTIONS[framework] || [];

  // Try to extract version from headers
  let version: string | undefined;
  if (headers) {
    for (const sig of HEADER_SIGNATURES[framework] || []) {
      if (sig.extractVersion) {
        const headerValue = headers.get(sig.header);
        if (headerValue) {
          const match = headerValue.match(sig.extractVersion);
          if (match && match[1]) {
            version = match[1];
            break;
          }
        }
      }
    }
  }

  const result: FrameworkFingerprintResult = {
    framework,
    confidence,
    evidence,
    version,
    suggestedPatterns,
    fingerprintTime: Date.now() - startTime,
  };

  fingerprintLogger.info('Framework fingerprinting complete', {
    domain,
    framework,
    confidence,
    evidenceCount: evidence.length,
    time: result.fingerprintTime,
  });

  return result;
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Generate LearnedApiPattern objects from framework conventions
 */
export function generatePatternsFromFramework(
  framework: BackendFramework,
  domain: string,
  frameworkConfidence: number
): LearnedApiPattern[] {
  const conventions = API_CONVENTIONS[framework] || [];
  const now = Date.now();

  return conventions.map((conv, index) => {
    // Convert path template to regex pattern
    const regexPattern = conv.path
      .replace(/\{[^}]+\}/g, '[^/]+')
      .replace(/\//g, '\\/');

    // Combined confidence from framework detection and pattern confidence
    const patternConfidence = frameworkConfidence * conv.confidence;

    return {
      id: `framework-${framework}-${index}`,
      templateType: 'rest-resource',
      urlPatterns: [`https://${domain}${regexPattern}`],
      endpointTemplate: `https://${domain}${conv.path}`,
      extractors: [],
      method: conv.methods[0], // Primary method
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      responseFormat: 'json',
      contentMapping: {
        title: 'name', // Common title field in REST APIs
        body: 'data',
      },
      validation: {
        requiredFields: [],
        minContentLength: 2,
      },
      metrics: {
        successCount: 0,
        failureCount: 0,
        confidence: patternConfidence,
        lastSuccess: 0,
        domains: [domain],
      },
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: 'framework-fingerprint',
        framework,
        description: conv.description,
        methods: conv.methods,
      },
    };
  });
}

// ============================================
// DISCOVERY FUNCTION
// ============================================

/**
 * Discover backend framework and generate patterns
 */
export async function discoverBackendFramework(
  domain: string,
  options: FingerprintOptions = {}
): Promise<BackendFrameworkDiscoveryResult> {
  try {
    const result = await fingerprintBackendFramework(domain, options);

    if (result.framework === 'unknown' || result.confidence < MIN_DETECTION_CONFIDENCE) {
      return {
        found: false,
        patterns: [],
        error: result.framework === 'unknown'
          ? 'No framework detected'
          : `Confidence too low: ${result.confidence}`,
      };
    }

    const patterns = generatePatternsFromFramework(
      result.framework,
      domain,
      result.confidence
    );

    return {
      found: true,
      result,
      patterns,
    };
  } catch (error) {
    fingerprintLogger.error('Framework discovery failed', { domain, error });
    return {
      found: false,
      patterns: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Discover backend framework with caching
 */
export async function discoverBackendFrameworkCached(
  domain: string,
  options: FingerprintOptions = {}
): Promise<BackendFrameworkDiscoveryResult> {
  // Check cache first
  const cached = getCachedFingerprint(domain);
  if (cached) {
    fingerprintLogger.debug('Cache hit for framework fingerprint', { domain });
    return cached;
  }

  // Perform discovery
  const result = await discoverBackendFramework(domain, options);

  // Cache if found
  if (result.found) {
    cacheFingerprint(domain, result);
  }

  return result;
}

// ============================================
// EXPORTS
// ============================================

export {
  fingerprintBackendFramework as fingerprint,
  discoverBackendFramework as discover,
  discoverBackendFrameworkCached as discoverCached,
};
