/**
 * Tests for Backend Framework Fingerprinting (D-010)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  analyzeHeaders,
  analyzeCookies,
  analyzeHtml,
  combineEvidence,
  fingerprintBackendFramework,
  generatePatternsFromFramework,
  discoverBackendFramework,
  discoverBackendFrameworkCached,
  getCachedFingerprint,
  cacheFingerprint,
  clearFingerprintCache,
  HEADER_SIGNATURES,
  COOKIE_SIGNATURES,
  HTML_SIGNATURES,
  API_CONVENTIONS,
  MIN_DETECTION_CONFIDENCE,
  type BackendFramework,
  type FrameworkEvidence,
  type FrameworkFingerprintResult,
  type BackendFrameworkDiscoveryResult,
} from '../../src/core/backend-framework-fingerprinting.js';

// ============================================
// HEADER ANALYSIS TESTS
// ============================================

describe('analyzeHeaders', () => {
  it('should detect Rails from x-runtime header', () => {
    const headers = new Headers({
      'x-runtime': '0.123456',
      'x-request-id': '550e8400-e29b-41d4-a716-446655440000',
    });

    const results = analyzeHeaders(headers);
    const railsEvidence = results.get('rails') || [];

    expect(railsEvidence.length).toBeGreaterThan(0);
    expect(railsEvidence.some(e => e.indicator === 'x-runtime')).toBe(true);
  });

  it('should detect Express from x-powered-by header', () => {
    const headers = new Headers({
      'x-powered-by': 'Express',
    });

    const results = analyzeHeaders(headers);
    const expressEvidence = results.get('express') || [];

    expect(expressEvidence.length).toBe(1);
    expect(expressEvidence[0].indicator).toBe('x-powered-by');
    expect(expressEvidence[0].value).toBe('Express');
    expect(expressEvidence[0].weight).toBe(0.9);
  });

  it('should detect FastAPI from uvicorn server header', () => {
    const headers = new Headers({
      'server': 'uvicorn',
    });

    const results = analyzeHeaders(headers);
    const fastApiEvidence = results.get('fastapi') || [];

    expect(fastApiEvidence.length).toBe(1);
    expect(fastApiEvidence[0].indicator).toBe('server');
    expect(fastApiEvidence[0].weight).toBe(0.8);
  });

  it('should detect Spring Boot from x-application-context', () => {
    const headers = new Headers({
      'x-application-context': 'application:8080',
    });

    const results = analyzeHeaders(headers);
    const springEvidence = results.get('spring-boot') || [];

    expect(springEvidence.length).toBe(1);
    expect(springEvidence[0].indicator).toBe('x-application-context');
    expect(springEvidence[0].weight).toBe(0.9);
  });

  it('should detect ASP.NET from x-aspnet-version', () => {
    const headers = new Headers({
      'x-aspnet-version': '4.0.30319',
    });

    const results = analyzeHeaders(headers);
    const aspnetEvidence = results.get('aspnet-core') || [];

    expect(aspnetEvidence.length).toBe(1);
    expect(aspnetEvidence[0].indicator).toBe('x-aspnet-version');
  });

  it('should detect Phoenix from cowboy server', () => {
    const headers = new Headers({
      'server': 'Cowboy',
    });

    const results = analyzeHeaders(headers);
    const phoenixEvidence = results.get('phoenix') || [];

    expect(phoenixEvidence.length).toBe(1);
    expect(phoenixEvidence[0].indicator).toBe('server');
    expect(phoenixEvidence[0].weight).toBe(0.6);
  });

  it('should handle Record<string, string> headers', () => {
    const headers: Record<string, string> = {
      'x-powered-by': 'Express',
      'etag': 'W/"abc123"',
    };

    const results = analyzeHeaders(headers);
    const expressEvidence = results.get('express') || [];

    expect(expressEvidence.length).toBe(2);
  });

  it('should return empty evidence for unknown framework headers', () => {
    const headers = new Headers({
      'content-type': 'text/html',
      'cache-control': 'no-cache',
    });

    const results = analyzeHeaders(headers);

    // All frameworks should have empty or minimal evidence
    let totalEvidence = 0;
    for (const evidence of results.values()) {
      totalEvidence += evidence.length;
    }
    // Some frameworks have weak matches for common headers
    expect(totalEvidence).toBeLessThan(5);
  });

  it('should detect multiple pieces of evidence for Rails', () => {
    const headers = new Headers({
      'x-runtime': '0.05',
      'x-request-id': '550e8400-e29b-41d4-a716-446655440000',
      'x-content-type-options': 'nosniff',
      'x-download-options': 'noopen',
      'x-permitted-cross-domain-policies': 'none',
    });

    const results = analyzeHeaders(headers);
    const railsEvidence = results.get('rails') || [];

    expect(railsEvidence.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================
// COOKIE ANALYSIS TESTS
// ============================================

describe('analyzeCookies', () => {
  it('should detect Rails session cookie', () => {
    const cookieHeader = '_myapp_session=abc123; path=/; HttpOnly';

    const results = analyzeCookies(cookieHeader);
    const railsEvidence = results.get('rails') || [];

    expect(railsEvidence.length).toBe(1);
    expect(railsEvidence[0].type).toBe('cookie');
    expect(railsEvidence[0].value).toBe('_myapp_session');
  });

  it('should detect Django CSRF token', () => {
    const cookieHeader = 'csrftoken=abc123; path=/';

    const results = analyzeCookies(cookieHeader);
    const djangoEvidence = results.get('django') || [];

    expect(djangoEvidence.length).toBe(1);
    expect(djangoEvidence[0].value).toBe('csrftoken');
    expect(djangoEvidence[0].weight).toBe(0.8);
  });

  it('should detect Laravel session cookie', () => {
    const cookieHeader = 'laravel_session=abc123; path=/';

    const results = analyzeCookies(cookieHeader);
    const laravelEvidence = results.get('laravel') || [];

    expect(laravelEvidence.length).toBeGreaterThanOrEqual(1);
    expect(laravelEvidence.some(e => e.value === 'laravel_session')).toBe(true);
  });

  it('should detect Spring Boot JSESSIONID', () => {
    const cookieHeader = 'JSESSIONID=abc123; path=/; HttpOnly';

    const results = analyzeCookies(cookieHeader);
    const springEvidence = results.get('spring-boot') || [];

    expect(springEvidence.length).toBe(1);
    expect(springEvidence[0].value).toBe('JSESSIONID');
  });

  it('should detect Express connect.sid', () => {
    const cookieHeader = 'connect.sid=s%3Aabc123.xyz; path=/; HttpOnly';

    const results = analyzeCookies(cookieHeader);
    const expressEvidence = results.get('express') || [];

    expect(expressEvidence.length).toBe(1);
    expect(expressEvidence[0].value).toBe('connect.sid');
  });

  it('should detect ASP.NET session cookie', () => {
    const cookieHeader = '.AspNetCore.Session=abc123; path=/';

    const results = analyzeCookies(cookieHeader);
    const aspnetEvidence = results.get('aspnet-core') || [];

    expect(aspnetEvidence.length).toBe(1);
  });

  it('should handle null cookie header', () => {
    const results = analyzeCookies(null);

    for (const evidence of results.values()) {
      expect(evidence.length).toBe(0);
    }
  });

  it('should handle multiple cookies', () => {
    const cookieHeader = 'csrftoken=abc; sessionid=xyz; django_language=en';

    const results = analyzeCookies(cookieHeader);
    const djangoEvidence = results.get('django') || [];

    expect(djangoEvidence.length).toBe(3);
  });
});

// ============================================
// HTML ANALYSIS TESTS
// ============================================

describe('analyzeHtml', () => {
  it('should detect Rails authenticity_token', () => {
    const html = `
      <html>
        <head>
          <meta name="csrf-param" content="authenticity_token">
          <meta name="csrf-token" content="abc123">
        </head>
        <body>
          <input name="authenticity_token" value="abc123" type="hidden">
        </body>
      </html>
    `;

    const results = analyzeHtml(html);
    const railsEvidence = results.get('rails') || [];

    expect(railsEvidence.length).toBeGreaterThanOrEqual(2);
    expect(railsEvidence.some(e => e.indicator === 'meta')).toBe(true);
    expect(railsEvidence.some(e => e.indicator === 'input')).toBe(true);
  });

  it('should detect Django csrfmiddlewaretoken', () => {
    const html = `
      <form>
        <input type="hidden" name="csrfmiddlewaretoken" value="abc123">
      </form>
    `;

    const results = analyzeHtml(html);
    const djangoEvidence = results.get('django') || [];

    expect(djangoEvidence.length).toBe(1);
    expect(djangoEvidence[0].weight).toBe(0.95);
  });

  it('should detect Phoenix LiveView', () => {
    const html = `
      <html>
        <head>
          <meta name="csrf-token" content="abc123">
        </head>
        <body class="phx-connected">
          <script src="/assets/phoenix_live_view.js"></script>
        </body>
      </html>
    `;

    const results = analyzeHtml(html);
    const phoenixEvidence = results.get('phoenix') || [];

    expect(phoenixEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect Laravel _token input', () => {
    const html = `
      <form>
        <input type="hidden" name="_token" value="abc123">
        <meta name="csrf-token" content="abc123">
      </form>
    `;

    const results = analyzeHtml(html);
    const laravelEvidence = results.get('laravel') || [];

    expect(laravelEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect Spring Boot _csrf', () => {
    const html = `
      <form>
        <input type="hidden" name="_csrf" value="abc123">
      </form>
    `;

    const results = analyzeHtml(html);
    const springEvidence = results.get('spring-boot') || [];

    // May match both input and meta patterns since both use name="_csrf"
    expect(springEvidence.length).toBeGreaterThanOrEqual(1);
    expect(springEvidence.some(e => e.indicator === 'input')).toBe(true);
  });

  it('should detect ASP.NET RequestVerificationToken', () => {
    const html = `
      <form>
        <input name="__RequestVerificationToken" type="hidden" value="abc123">
      </form>
    `;

    const results = analyzeHtml(html);
    const aspnetEvidence = results.get('aspnet-core') || [];

    expect(aspnetEvidence.length).toBe(1);
    expect(aspnetEvidence[0].weight).toBe(0.95);
  });

  it('should detect Blazor', () => {
    const html = `
      <script src="/_framework/blazor.server.js"></script>
    `;

    const results = analyzeHtml(html);
    const aspnetEvidence = results.get('aspnet-core') || [];

    expect(aspnetEvidence.length).toBeGreaterThanOrEqual(1);
    expect(aspnetEvidence.some(e => e.weight >= 0.9)).toBe(true);
  });

  it('should detect Rails Turbo', () => {
    const html = `
      <head>
        <meta name="turbo-visit-control" content="reload">
        <script src="/assets/turbo.es2017-esm.js"></script>
      </head>
    `;

    const results = analyzeHtml(html);
    const railsEvidence = results.get('rails') || [];

    expect(railsEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty evidence for plain HTML', () => {
    const html = `
      <html>
        <head><title>Hello</title></head>
        <body><p>World</p></body>
      </html>
    `;

    const results = analyzeHtml(html);

    let totalEvidence = 0;
    for (const evidence of results.values()) {
      totalEvidence += evidence.length;
    }
    expect(totalEvidence).toBe(0);
  });
});

// ============================================
// COMBINE EVIDENCE TESTS
// ============================================

describe('combineEvidence', () => {
  it('should return the framework with highest score', () => {
    const headerEvidence = new Map<BackendFramework, FrameworkEvidence[]>([
      ['express', [{ type: 'header', indicator: 'x-powered-by', value: 'Express', weight: 0.9 }]],
      ['rails', []],
      ['django', []],
      ['phoenix', []],
      ['fastapi', []],
      ['spring-boot', []],
      ['laravel', []],
      ['aspnet-core', []],
      ['unknown', []],
    ]);
    const cookieEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const htmlEvidence = new Map<BackendFramework, FrameworkEvidence[]>();

    // Initialize other frameworks with empty arrays
    for (const fw of ['rails', 'django', 'phoenix', 'fastapi', 'spring-boot', 'laravel', 'aspnet-core', 'unknown'] as BackendFramework[]) {
      cookieEvidence.set(fw, []);
      htmlEvidence.set(fw, []);
    }
    cookieEvidence.set('express', []);
    htmlEvidence.set('express', []);

    const result = combineEvidence(headerEvidence, cookieEvidence, htmlEvidence);

    expect(result.framework).toBe('express');
    expect(result.confidence).toBeGreaterThan(MIN_DETECTION_CONFIDENCE);
  });

  it('should combine evidence from multiple sources', () => {
    const headerEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const cookieEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const htmlEvidence = new Map<BackendFramework, FrameworkEvidence[]>();

    // Initialize all frameworks
    for (const fw of ['rails', 'django', 'phoenix', 'fastapi', 'spring-boot', 'laravel', 'express', 'aspnet-core', 'unknown'] as BackendFramework[]) {
      headerEvidence.set(fw, []);
      cookieEvidence.set(fw, []);
      htmlEvidence.set(fw, []);
    }

    // Add Rails evidence across sources
    headerEvidence.set('rails', [
      { type: 'header', indicator: 'x-runtime', value: '0.05', weight: 0.6 },
    ]);
    cookieEvidence.set('rails', [
      { type: 'cookie', indicator: 'cookie-name', value: '_app_session', weight: 0.7 },
    ]);
    htmlEvidence.set('rails', [
      { type: 'html', indicator: 'input', value: 'authenticity_token', weight: 0.9 },
    ]);

    const result = combineEvidence(headerEvidence, cookieEvidence, htmlEvidence);

    expect(result.framework).toBe('rails');
    expect(result.evidence.length).toBe(3);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should return unknown if confidence is too low', () => {
    const headerEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const cookieEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const htmlEvidence = new Map<BackendFramework, FrameworkEvidence[]>();

    // Initialize all frameworks with empty
    for (const fw of ['rails', 'django', 'phoenix', 'fastapi', 'spring-boot', 'laravel', 'express', 'aspnet-core', 'unknown'] as BackendFramework[]) {
      headerEvidence.set(fw, []);
      cookieEvidence.set(fw, []);
      htmlEvidence.set(fw, []);
    }

    // Add very weak evidence
    headerEvidence.set('django', [
      { type: 'header', indicator: 'vary', value: 'Cookie', weight: 0.2 },
    ]);

    const result = combineEvidence(headerEvidence, cookieEvidence, htmlEvidence);

    expect(result.framework).toBe('unknown');
    expect(result.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
  });

  it('should cap confidence at 1.0', () => {
    const headerEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const cookieEvidence = new Map<BackendFramework, FrameworkEvidence[]>();
    const htmlEvidence = new Map<BackendFramework, FrameworkEvidence[]>();

    // Initialize all frameworks
    for (const fw of ['rails', 'django', 'phoenix', 'fastapi', 'spring-boot', 'laravel', 'express', 'aspnet-core', 'unknown'] as BackendFramework[]) {
      headerEvidence.set(fw, []);
      cookieEvidence.set(fw, []);
      htmlEvidence.set(fw, []);
    }

    // Add overwhelming evidence for Rails
    headerEvidence.set('rails', [
      { type: 'header', indicator: 'x-runtime', value: '0.05', weight: 0.6 },
      { type: 'header', indicator: 'x-request-id', value: 'abc', weight: 0.3 },
      { type: 'header', indicator: 'x-powered-by', value: 'Phusion Passenger', weight: 0.7 },
    ]);
    cookieEvidence.set('rails', [
      { type: 'cookie', indicator: 'cookie-name', value: '_app_session', weight: 0.7 },
    ]);
    htmlEvidence.set('rails', [
      { type: 'html', indicator: 'input', value: 'authenticity_token', weight: 0.9 },
      { type: 'html', indicator: 'meta', value: 'csrf-param', weight: 0.9 },
    ]);

    const result = combineEvidence(headerEvidence, cookieEvidence, htmlEvidence);

    expect(result.confidence).toBeLessThanOrEqual(1.0);
    expect(result.framework).toBe('rails');
  });
});

// ============================================
// PATTERN GENERATION TESTS
// ============================================

describe('generatePatternsFromFramework', () => {
  it('should generate patterns for Rails', () => {
    const patterns = generatePatternsFromFramework('rails', 'example.com', 0.8);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(p => p.endpointTemplate.includes('/api/'))).toBe(true);
    expect(patterns.every(p => p.metadata?.framework === 'rails')).toBe(true);
    expect(patterns.every(p => p.metadata?.source === 'framework-fingerprint')).toBe(true);
  });

  it('should generate patterns for FastAPI with docs endpoints', () => {
    const patterns = generatePatternsFromFramework('fastapi', 'api.example.com', 0.9);

    expect(patterns.some(p => p.endpointTemplate.includes('/docs'))).toBe(true);
    expect(patterns.some(p => p.endpointTemplate.includes('/redoc'))).toBe(true);
    expect(patterns.some(p => p.endpointTemplate.includes('/openapi.json'))).toBe(true);
  });

  it('should generate patterns for Spring Boot with actuator', () => {
    const patterns = generatePatternsFromFramework('spring-boot', 'example.com', 0.85);

    expect(patterns.some(p => p.endpointTemplate.includes('/actuator'))).toBe(true);
    expect(patterns.some(p => p.endpointTemplate.includes('/actuator/health'))).toBe(true);
  });

  it('should generate patterns for Laravel with sanctum', () => {
    const patterns = generatePatternsFromFramework('laravel', 'example.com', 0.8);

    expect(patterns.some(p => p.endpointTemplate.includes('/sanctum/csrf-cookie'))).toBe(true);
  });

  it('should apply framework confidence to pattern confidence', () => {
    const patterns = generatePatternsFromFramework('django', 'example.com', 0.7);

    // Pattern confidence should be frameworkConfidence * patternConfidence
    for (const pattern of patterns) {
      expect(pattern.metrics.confidence).toBeLessThanOrEqual(0.7);
    }
  });

  it('should include domain in pattern URL', () => {
    const patterns = generatePatternsFromFramework('express', 'myapi.example.com', 0.8);

    expect(patterns.every(p => p.urlPatterns[0].includes('myapi.example.com'))).toBe(true);
    expect(patterns.every(p => p.metrics.domains.includes('myapi.example.com'))).toBe(true);
  });

  it('should return empty array for unknown framework', () => {
    const patterns = generatePatternsFromFramework('unknown', 'example.com', 0.5);

    expect(patterns).toEqual([]);
  });

  it('should include method metadata', () => {
    const patterns = generatePatternsFromFramework('rails', 'example.com', 0.8);

    for (const pattern of patterns) {
      expect(pattern.metadata?.methods).toBeDefined();
      expect(Array.isArray(pattern.metadata?.methods)).toBe(true);
    }
  });
});

// ============================================
// FINGERPRINT FUNCTION TESTS
// ============================================

describe('fingerprintBackendFramework', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should detect Express from response', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'x-powered-by': 'Express',
        'content-type': 'text/html',
      }),
      text: () => Promise.resolve('<html><body>Hello</body></html>'),
    });

    const result = await fingerprintBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    expect(result.framework).toBe('express');
    expect(result.confidence).toBeGreaterThan(MIN_DETECTION_CONFIDENCE);
    expect(result.evidence.some(e => e.indicator === 'x-powered-by')).toBe(true);
  });

  it('should detect Rails from combined evidence', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'x-runtime': '0.123',
        'set-cookie': '_myapp_session=abc123; HttpOnly',
      }),
      text: () => Promise.resolve(`
        <html>
          <head>
            <meta name="csrf-param" content="authenticity_token">
          </head>
          <body>
            <input name="authenticity_token" type="hidden">
          </body>
        </html>
      `),
    });

    const result = await fingerprintBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    expect(result.framework).toBe('rails');
    expect(result.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it('should return unknown on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fingerprintBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    expect(result.framework).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('should respect timeout', async () => {
    mockFetch.mockImplementation((_url, options) => {
      return new Promise((resolve, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new Error('Aborted'));
          });
        }
        // Never resolve - simulating slow server
      });
    });

    const result = await fingerprintBackendFramework('slow.example.com', {
      fetchFn: mockFetch,
      timeout: 100, // Very short timeout
    });

    expect(result.framework).toBe('unknown');
  });

  it('should include fingerprint timing', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({}),
      text: () => Promise.resolve('<html></html>'),
    });

    const result = await fingerprintBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    // fingerprintTime is calculated but may be 0 in fast test environments
    expect(result.fingerprintTime).toBeGreaterThanOrEqual(0);
    expect(typeof result.fingerprintTime).toBe('number');
  });

  it('should include suggested patterns for detected framework', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'x-powered-by': 'Express',
      }),
      text: () => Promise.resolve('<html></html>'),
    });

    const result = await fingerprintBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    expect(result.suggestedPatterns.length).toBeGreaterThan(0);
    expect(result.suggestedPatterns.every(p => p.path)).toBe(true);
    expect(result.suggestedPatterns.every(p => p.methods.length > 0)).toBe(true);
  });

  it('should skip specified detection methods', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'x-powered-by': 'Express',
      }),
      text: () => Promise.resolve(`
        <input name="csrfmiddlewaretoken">
      `),
    });

    const result = await fingerprintBackendFramework('example.com', {
      fetchFn: mockFetch,
      skipMethods: ['html'],
    });

    // Should only detect Express (from headers), not Django (from HTML)
    expect(result.framework).toBe('express');
    expect(result.evidence.every(e => e.type !== 'html')).toBe(true);
  });
});

// ============================================
// DISCOVERY FUNCTION TESTS
// ============================================

describe('discoverBackendFramework', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return found=true with patterns for detected framework', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'server': 'uvicorn',
      }),
      text: () => Promise.resolve('<html></html>'),
    });

    const result = await discoverBackendFramework('api.example.com', {
      fetchFn: mockFetch,
    });

    expect(result.found).toBe(true);
    expect(result.result?.framework).toBe('fastapi');
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('should return found=false when no framework detected', async () => {
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'content-type': 'text/html',
      }),
      text: () => Promise.resolve('<html><body>Plain page</body></html>'),
    });

    const result = await discoverBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    expect(result.found).toBe(false);
    expect(result.patterns).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('should return found=false on error', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = await discoverBackendFramework('example.com', {
      fetchFn: mockFetch,
    });

    expect(result.found).toBe(false);
    expect(result.patterns).toEqual([]);
  });
});

// ============================================
// CACHING TESTS
// ============================================

describe('caching', () => {
  beforeEach(async () => {
    await clearFingerprintCache();
  });

  afterEach(async () => {
    await clearFingerprintCache();
  });

  it('should cache fingerprint results', async () => {
    const result: BackendFrameworkDiscoveryResult = {
      found: true,
      result: {
        framework: 'rails',
        confidence: 0.9,
        evidence: [],
        suggestedPatterns: [],
        fingerprintTime: 100,
      },
      patterns: [],
    };

    await cacheFingerprint('example.com', result);
    const cached = await getCachedFingerprint('example.com');

    expect(cached).not.toBeNull();
    expect(cached?.found).toBe(true);
    expect(cached?.result?.framework).toBe('rails');
    expect(cached?.cachedAt).toBeDefined();
  });

  it('should return null for uncached domain', async () => {
    const cached = await getCachedFingerprint('uncached.com');
    expect(cached).toBeNull();
  });

  it('should clear specific domain cache', async () => {
    const result: BackendFrameworkDiscoveryResult = {
      found: true,
      patterns: [],
    };

    await cacheFingerprint('example1.com', result);
    await cacheFingerprint('example2.com', result);

    await clearFingerprintCache('example1.com');

    expect(await getCachedFingerprint('example1.com')).toBeNull();
    expect(await getCachedFingerprint('example2.com')).not.toBeNull();
  });

  it('should clear all cache', async () => {
    const result: BackendFrameworkDiscoveryResult = {
      found: true,
      patterns: [],
    };

    await cacheFingerprint('example1.com', result);
    await cacheFingerprint('example2.com', result);

    await clearFingerprintCache();

    expect(await getCachedFingerprint('example1.com')).toBeNull();
    expect(await getCachedFingerprint('example2.com')).toBeNull();
  });

  it('should use cached result in discoverBackendFrameworkCached', async () => {
    const mockFetch = vi.fn();

    // First call - no cache
    mockFetch.mockResolvedValue({
      headers: new Headers({
        'x-powered-by': 'Express',
      }),
      text: () => Promise.resolve('<html></html>'),
    });

    const result1 = await discoverBackendFrameworkCached('example.com', {
      fetchFn: mockFetch,
    });

    expect(result1.found).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await discoverBackendFrameworkCached('example.com', {
      fetchFn: mockFetch,
    });

    expect(result2.found).toBe(true);
    expect(result2.cachedAt).toBeDefined();
    // Fetch should not be called again
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('signature constants', () => {
  it('should have signatures for all frameworks', () => {
    const frameworks: BackendFramework[] = [
      'rails', 'django', 'phoenix', 'fastapi',
      'spring-boot', 'laravel', 'express', 'aspnet-core',
    ];

    for (const framework of frameworks) {
      // At least one source of signatures
      const hasHeaderSigs = (HEADER_SIGNATURES[framework]?.length || 0) > 0;
      const hasCookieSigs = (COOKIE_SIGNATURES[framework]?.length || 0) > 0;
      const hasHtmlSigs = (HTML_SIGNATURES[framework]?.length || 0) > 0;

      expect(hasHeaderSigs || hasCookieSigs || hasHtmlSigs).toBe(true);
    }
  });

  it('should have API conventions for all frameworks', () => {
    const frameworks: BackendFramework[] = [
      'rails', 'django', 'phoenix', 'fastapi',
      'spring-boot', 'laravel', 'express', 'aspnet-core',
    ];

    for (const framework of frameworks) {
      expect(API_CONVENTIONS[framework].length).toBeGreaterThan(0);
    }
  });

  it('should have valid weights in signatures (0-1)', () => {
    for (const sigs of Object.values(HEADER_SIGNATURES)) {
      for (const sig of sigs) {
        expect(sig.weight).toBeGreaterThanOrEqual(0);
        expect(sig.weight).toBeLessThanOrEqual(1);
      }
    }

    for (const sigs of Object.values(COOKIE_SIGNATURES)) {
      for (const sig of sigs) {
        expect(sig.weight).toBeGreaterThanOrEqual(0);
        expect(sig.weight).toBeLessThanOrEqual(1);
      }
    }

    for (const sigs of Object.values(HTML_SIGNATURES)) {
      for (const sig of sigs) {
        expect(sig.weight).toBeGreaterThanOrEqual(0);
        expect(sig.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it('should have valid confidence in API conventions (0-1)', () => {
    for (const conventions of Object.values(API_CONVENTIONS)) {
      for (const conv of conventions) {
        expect(conv.confidence).toBeGreaterThanOrEqual(0);
        expect(conv.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});
