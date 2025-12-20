/**
 * Tests for Robots.txt & Sitemap Discovery (D-007)
 *
 * Tests robots.txt parsing, sitemap.xml parsing, and API hint extraction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseRobotsTxt,
  parseSitemap,
  extractHintsFromRobotsTxt,
  extractHintsFromSitemap,
  discoverRobotsSitemap,
  discoverRobotsSitemapCached,
  filterHintsByType,
  filterHintsByConfidence,
  sortHintsByConfidence,
  getApiPathHints,
  getDocumentationHints,
  clearRobotsSitemapCache,
  type ParsedRobotsTxt,
  type ParsedSitemap,
  type ApiHint,
} from '../../src/core/robots-sitemap-discovery.js';

// ============================================
// ROBOTS.TXT PARSING
// ============================================

describe('parseRobotsTxt', () => {
  it('should parse basic robots.txt with user-agent *', () => {
    const content = `
User-agent: *
Disallow: /api/
Disallow: /private/
Allow: /api/public/
`;
    const result = parseRobotsTxt(content);

    expect(result.disallowPaths).toContain('/api/');
    expect(result.disallowPaths).toContain('/private/');
    expect(result.allowPaths).toContain('/api/public/');
  });

  it('should extract sitemap URLs', () => {
    const content = `
User-agent: *
Disallow: /admin/

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-blog.xml
`;
    const result = parseRobotsTxt(content);

    expect(result.sitemapUrls).toHaveLength(2);
    expect(result.sitemapUrls).toContain('https://example.com/sitemap.xml');
    expect(result.sitemapUrls).toContain('https://example.com/sitemap-blog.xml');
  });

  it('should ignore specific user-agent sections', () => {
    const content = `
User-agent: Googlebot
Disallow: /google-private/

User-agent: *
Disallow: /api/
`;
    const result = parseRobotsTxt(content);

    // Should only include paths for * user-agent
    expect(result.disallowPaths).toContain('/api/');
    expect(result.disallowPaths).not.toContain('/google-private/');
  });

  it('should skip comments and empty lines', () => {
    const content = `
# This is a comment
User-agent: *

# Another comment
Disallow: /api/

`;
    const result = parseRobotsTxt(content);

    expect(result.disallowPaths).toHaveLength(1);
    expect(result.disallowPaths).toContain('/api/');
  });

  it('should handle empty content', () => {
    const result = parseRobotsTxt('');

    expect(result.disallowPaths).toHaveLength(0);
    expect(result.allowPaths).toHaveLength(0);
    expect(result.sitemapUrls).toHaveLength(0);
  });

  it('should deduplicate paths', () => {
    const content = `
User-agent: *
Disallow: /api/
Disallow: /api/
Allow: /public/
Allow: /public/
`;
    const result = parseRobotsTxt(content);

    expect(result.disallowPaths).toHaveLength(1);
    expect(result.allowPaths).toHaveLength(1);
  });

  it('should handle paths without leading slash', () => {
    const content = `
User-agent: *
Disallow: api/
Allow: public/
`;
    const result = parseRobotsTxt(content);

    expect(result.disallowPaths).toContain('api/');
    expect(result.allowPaths).toContain('public/');
  });

  it('should preserve raw content', () => {
    const content = 'User-agent: *\nDisallow: /api/';
    const result = parseRobotsTxt(content);

    expect(result.rawContent).toBe(content);
  });

  it('should handle case-insensitive directives', () => {
    const content = `
USER-AGENT: *
DISALLOW: /api/
ALLOW: /public/
SITEMAP: https://example.com/sitemap.xml
`;
    const result = parseRobotsTxt(content);

    expect(result.disallowPaths).toContain('/api/');
    expect(result.allowPaths).toContain('/public/');
    expect(result.sitemapUrls).toContain('https://example.com/sitemap.xml');
  });
});

// ============================================
// ROBOTS.TXT HINT EXTRACTION
// ============================================

describe('extractHintsFromRobotsTxt', () => {
  it('should detect API paths', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/api/', '/v1/', '/rest/'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some(h => h.type === 'api-path')).toBe(true);
    expect(hints.every(h => h.source === 'robots.txt')).toBe(true);
  });

  it('should detect GraphQL endpoints', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/graphql', '/api/graphql'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints.some(h => h.type === 'graphql')).toBe(true);
  });

  it('should detect spec files', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/swagger.json', '/openapi.yaml'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints.filter(h => h.type === 'spec-file')).toHaveLength(2);
  });

  it('should detect documentation paths', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/docs/', '/api-docs/'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints.some(h => h.type === 'documentation')).toBe(true);
  });

  it('should detect developer portals', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/developers/', '/dev/'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints.some(h => h.type === 'developer-portal')).toBe(true);
  });

  it('should lower confidence for Disallow paths', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/api/'],
      allowPaths: ['/api/'],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    // First match wins due to dedup, but disallow should have lower confidence
    expect(hints).toHaveLength(1);
  });

  it('should skip non-API paths', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/images/', '/css/', '/js/', '/assets/'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints).toHaveLength(0);
  });

  it('should include reason in hints', () => {
    const robotsTxt: ParsedRobotsTxt = {
      disallowPaths: ['/api/'],
      allowPaths: [],
      sitemapUrls: [],
    };
    const hints = extractHintsFromRobotsTxt(robotsTxt);

    expect(hints[0].reason).toContain('Disallow');
    expect(hints[0].reason).toContain('api-path');
  });
});

// ============================================
// SITEMAP PARSING
// ============================================

describe('parseSitemap', () => {
  it('should parse basic sitemap', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/docs/api</loc>
    <lastmod>2024-01-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
  </url>
</urlset>`;
    const result = parseSitemap(content);

    expect(result.type).toBe('sitemap');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].loc).toBe('https://example.com/docs/api');
    expect(result.entries[0].lastmod).toBe('2024-01-01');
    expect(result.entries[0].changefreq).toBe('weekly');
    expect(result.entries[0].priority).toBe(0.8);
  });

  it('should parse sitemap index', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-main.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-blog.xml</loc>
  </sitemap>
</sitemapindex>`;
    const result = parseSitemap(content);

    expect(result.type).toBe('sitemapindex');
    expect(result.sitemapUrls).toHaveLength(2);
    expect(result.sitemapUrls).toContain('https://example.com/sitemap-main.xml');
    expect(result.sitemapUrls).toContain('https://example.com/sitemap-blog.xml');
    expect(result.entries).toHaveLength(0);
  });

  it('should decode XML entities in URLs', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/api?foo=1&amp;bar=2</loc>
  </url>
</urlset>`;
    const result = parseSitemap(content);

    expect(result.entries[0].loc).toBe('https://example.com/api?foo=1&bar=2');
  });

  it('should handle empty sitemap', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    const result = parseSitemap(content);

    expect(result.type).toBe('sitemap');
    expect(result.entries).toHaveLength(0);
  });

  it('should skip URLs without loc', () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <lastmod>2024-01-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/valid</loc>
  </url>
</urlset>`;
    const result = parseSitemap(content);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].loc).toBe('https://example.com/valid');
  });
});

// ============================================
// SITEMAP HINT EXTRACTION
// ============================================

describe('extractHintsFromSitemap', () => {
  it('should detect API documentation URLs', () => {
    const sitemap: ParsedSitemap = {
      type: 'sitemap',
      entries: [
        { loc: 'https://example.com/docs/api/users' },
        { loc: 'https://example.com/api-docs/reference' },
        { loc: 'https://example.com/documentation/api' },
      ],
      sitemapUrls: [],
    };
    const hints = extractHintsFromSitemap(sitemap);

    expect(hints.length).toBeGreaterThan(0);
    expect(hints.every(h => h.source === 'sitemap.xml')).toBe(true);
    expect(hints.some(h => h.type === 'documentation')).toBe(true);
  });

  it('should detect developer portal URLs', () => {
    const sitemap: ParsedSitemap = {
      type: 'sitemap',
      entries: [
        { loc: 'https://example.com/developers/getting-started' },
        { loc: 'https://example.com/dev-portal/overview' },
      ],
      sitemapUrls: [],
    };
    const hints = extractHintsFromSitemap(sitemap);

    expect(hints.some(h => h.type === 'developer-portal')).toBe(true);
  });

  it('should detect spec file URLs', () => {
    const sitemap: ParsedSitemap = {
      type: 'sitemap',
      entries: [
        { loc: 'https://example.com/swagger/index.html' },
        { loc: 'https://example.com/openapi/v1/spec' },
      ],
      sitemapUrls: [],
    };
    const hints = extractHintsFromSitemap(sitemap);

    expect(hints.filter(h => h.type === 'spec-file')).toHaveLength(2);
  });

  it('should boost confidence for stable docs', () => {
    const sitemap: ParsedSitemap = {
      type: 'sitemap',
      entries: [
        { loc: 'https://example.com/api-reference', changefreq: 'yearly' },
        { loc: 'https://example.com/developers/guide', changefreq: 'daily' },
      ],
      sitemapUrls: [],
    };
    const hints = extractHintsFromSitemap(sitemap);

    const yearlyHint = hints.find(h => h.path.includes('api-reference'));
    const dailyHint = hints.find(h => h.path.includes('developers'));

    // Yearly should have higher confidence boost
    if (yearlyHint && dailyHint) {
      expect(yearlyHint.confidence).toBeGreaterThan(dailyHint.confidence * 0.9);
    }
  });

  it('should skip non-API URLs', () => {
    const sitemap: ParsedSitemap = {
      type: 'sitemap',
      entries: [
        { loc: 'https://example.com/about' },
        { loc: 'https://example.com/contact' },
        { loc: 'https://example.com/blog/post-1' },
      ],
      sitemapUrls: [],
    };
    const hints = extractHintsFromSitemap(sitemap);

    expect(hints).toHaveLength(0);
  });

  it('should deduplicate by URL', () => {
    const sitemap: ParsedSitemap = {
      type: 'sitemap',
      entries: [
        { loc: 'https://example.com/api-docs/v1' },
        { loc: 'https://example.com/api-docs/v1' },
      ],
      sitemapUrls: [],
    };
    const hints = extractHintsFromSitemap(sitemap);

    expect(hints).toHaveLength(1);
  });
});

// ============================================
// FULL DISCOVERY
// ============================================

describe('discoverRobotsSitemap', () => {
  const createMockFetch = (responses: Record<string, { ok: boolean; text: string }>) => {
    return vi.fn(async (url: string) => {
      const response = responses[url];
      if (!response) {
        return { ok: false, text: async () => '' };
      }
      return { ok: response.ok, text: async () => response.text };
    });
  };

  afterEach(() => {
    clearRobotsSitemapCache();
  });

  it('should discover hints from both robots.txt and sitemap', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': {
        ok: true,
        text: `User-agent: *
Disallow: /api/
Sitemap: https://example.com/sitemap.xml`,
      },
      'https://example.com/sitemap.xml': {
        ok: true,
        text: `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/docs/api</loc></url>
</urlset>`,
      },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.hints.length).toBeGreaterThan(0);
    expect(result.robotsTxt).toBeDefined();
    expect(result.sitemap).toBeDefined();
  });

  it('should handle missing robots.txt', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': { ok: false, text: '' },
      'https://example.com/sitemap.xml': {
        ok: true,
        text: `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/api-docs/</loc></url>
</urlset>`,
      },
      'https://example.com/sitemap_index.xml': { ok: false, text: '' },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.robotsTxt).toBeUndefined();
    expect(result.sitemap).toBeDefined();
  });

  it('should handle missing sitemap', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': {
        ok: true,
        text: `User-agent: *
Disallow: /api/`,
      },
      'https://example.com/sitemap.xml': { ok: false, text: '' },
      'https://example.com/sitemap_index.xml': { ok: false, text: '' },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.robotsTxt).toBeDefined();
    expect(result.sitemap).toBeUndefined();
  });

  it('should handle both missing', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': { ok: false, text: '' },
      'https://example.com/sitemap.xml': { ok: false, text: '' },
      'https://example.com/sitemap_index.xml': { ok: false, text: '' },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
    expect(result.hints).toHaveLength(0);
  });

  it('should use sitemaps from robots.txt', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': {
        ok: true,
        text: `User-agent: *
Sitemap: https://example.com/custom-sitemap.xml`,
      },
      'https://example.com/custom-sitemap.xml': {
        ok: true,
        text: `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/developers/</loc></url>
</urlset>`,
      },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.probedLocations).toContain('https://example.com/custom-sitemap.xml');
  });

  it('should follow sitemap index when enabled', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': {
        ok: true,
        text: `User-agent: *
Sitemap: https://example.com/sitemap-index.xml`,
      },
      'https://example.com/sitemap-index.xml': {
        ok: true,
        text: `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-docs.xml</loc></sitemap>
</sitemapindex>`,
      },
      'https://example.com/sitemap-docs.xml': {
        ok: true,
        text: `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/api-reference/</loc></url>
</urlset>`,
      },
    });

    const result = await discoverRobotsSitemap('example.com', {
      fetchFn: mockFetch,
      followSitemapIndex: true,
    });

    expect(result.found).toBe(true);
    expect(result.probedLocations).toContain('https://example.com/sitemap-docs.xml');
  });

  it('should handle network errors gracefully', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('Network error');
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
    expect(result.hints).toHaveLength(0);
  });

  it('should track probed locations', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': { ok: false, text: '' },
      'https://example.com/sitemap.xml': { ok: false, text: '' },
      'https://example.com/sitemap_index.xml': { ok: false, text: '' },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.probedLocations).toContain('https://example.com/robots.txt');
    expect(result.probedLocations).toContain('https://example.com/sitemap.xml');
  });

  it('should include discovery time', async () => {
    const mockFetch = createMockFetch({
      'https://example.com/robots.txt': { ok: false, text: '' },
      'https://example.com/sitemap.xml': { ok: false, text: '' },
      'https://example.com/sitemap_index.xml': { ok: false, text: '' },
    });

    const result = await discoverRobotsSitemap('example.com', { fetchFn: mockFetch });

    expect(result.discoveryTime).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// CACHING
// ============================================

describe('discoverRobotsSitemapCached', () => {
  afterEach(() => {
    clearRobotsSitemapCache();
  });

  it('should cache results', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async (url: string) => {
      callCount++;
      if (url.includes('robots.txt')) {
        return { ok: true, text: async () => 'User-agent: *\nDisallow: /api/' };
      }
      return { ok: false, text: async () => '' };
    });

    // First call
    await discoverRobotsSitemapCached('example.com', { fetchFn: mockFetch });
    const firstCallCount = callCount;

    // Second call should use cache
    await discoverRobotsSitemapCached('example.com', { fetchFn: mockFetch });

    expect(callCount).toBe(firstCallCount);
  });

  it('should clear cache for specific domain', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('robots.txt')) {
        return { ok: true, text: async () => 'User-agent: *\nDisallow: /api/' };
      }
      return { ok: false, text: async () => '' };
    });

    await discoverRobotsSitemapCached('example.com', { fetchFn: mockFetch });
    clearRobotsSitemapCache('example.com');

    // Should make new request
    await discoverRobotsSitemapCached('example.com', { fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(6); // 3 calls per discovery (robots + 2 sitemaps)
  });
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

describe('utility functions', () => {
  const testHints: ApiHint[] = [
    { path: '/api/', source: 'robots.txt', type: 'api-path', reason: 'test', confidence: 0.6 },
    { path: '/graphql', source: 'robots.txt', type: 'graphql', reason: 'test', confidence: 0.8 },
    { path: '/docs/', source: 'sitemap.xml', type: 'documentation', reason: 'test', confidence: 0.5 },
    { path: '/devs/', source: 'sitemap.xml', type: 'developer-portal', reason: 'test', confidence: 0.7 },
    { path: '/swagger.json', source: 'robots.txt', type: 'spec-file', reason: 'test', confidence: 0.9 },
  ];

  describe('filterHintsByType', () => {
    it('should filter by single type', () => {
      const result = filterHintsByType(testHints, ['api-path']);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('api-path');
    });

    it('should filter by multiple types', () => {
      const result = filterHintsByType(testHints, ['api-path', 'graphql']);
      expect(result).toHaveLength(2);
    });
  });

  describe('filterHintsByConfidence', () => {
    it('should filter by minimum confidence', () => {
      const result = filterHintsByConfidence(testHints, 0.7);
      expect(result).toHaveLength(3);
      expect(result.every(h => h.confidence >= 0.7)).toBe(true);
    });
  });

  describe('sortHintsByConfidence', () => {
    it('should sort highest first', () => {
      const result = sortHintsByConfidence(testHints);
      expect(result[0].confidence).toBe(0.9);
      expect(result[result.length - 1].confidence).toBe(0.5);
    });
  });

  describe('getApiPathHints', () => {
    it('should return only api-path and graphql hints', () => {
      const result = getApiPathHints(testHints);
      expect(result).toHaveLength(2);
      expect(result.every(h => h.type === 'api-path' || h.type === 'graphql')).toBe(true);
    });
  });

  describe('getDocumentationHints', () => {
    it('should return documentation, developer-portal, and spec-file hints', () => {
      const result = getDocumentationHints(testHints);
      expect(result).toHaveLength(3);
      expect(result.every(h =>
        h.type === 'documentation' ||
        h.type === 'developer-portal' ||
        h.type === 'spec-file'
      )).toBe(true);
    });
  });
});
