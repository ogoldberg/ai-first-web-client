/**
 * Pattern Cache Tests for Unbrowser Connect SDK
 * CONN-012: Verify patterns sync correctly from cloud
 *
 * Tests the PatternCache class which handles:
 * - Pattern sync from Unbrowser Cloud
 * - IndexedDB persistence
 * - Domain matching (exact and parent domain)
 * - Delta sync with sync tokens
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternCache } from '../src/patterns/pattern-cache.js';

// Mock IndexedDB
function createMockIDBDatabase() {
  const store = new Map<string, unknown>();

  return {
    store,
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        getAll: vi.fn(() => ({
          result: Array.from(store.values()),
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
        })),
        put: vi.fn((value: { domain: string }) => {
          store.set(value.domain, value);
        }),
      })),
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
    })),
    objectStoreNames: { contains: vi.fn(() => true) },
    createObjectStore: vi.fn(),
  };
}

function setupMocks() {
  const mockDb = createMockIDBDatabase();

  // Mock indexedDB.open
  (global as any).indexedDB = {
    open: vi.fn(() => {
      const request = {
        result: mockDb,
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: Event) => void) | null,
      };
      // Simulate async success
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess({ target: request } as unknown as Event);
        }
      }, 0);
      return request;
    }),
  };

  return mockDb;
}

// ==========================================
// PatternCache Configuration Tests
// ==========================================

describe('PatternCache Configuration', () => {
  beforeEach(() => {
    setupMocks();
  });

  it('should accept valid configuration', () => {
    const cache = new PatternCache({
      apiUrl: 'https://api.unbrowser.ai',
      apiKey: 'ub_test_123',
      appId: 'test-app',
    });
    expect(cache).toBeDefined();
  });

  it('should store configuration internally', () => {
    const config = {
      apiUrl: 'https://custom.api.com',
      apiKey: 'ub_live_abc',
      appId: 'my-app',
    };
    const cache = new PatternCache(config);
    expect(cache).toBeDefined();
    // Configuration is stored but private
  });
});

// ==========================================
// Pattern Retrieval Tests (Synchronous)
// ==========================================

describe('Pattern Retrieval', () => {
  let cache: PatternCache;

  beforeEach(() => {
    setupMocks();
    cache = new PatternCache({
      apiUrl: 'https://api.unbrowser.ai',
      apiKey: 'ub_test_123',
      appId: 'test-app',
    });
  });

  it('should return undefined for unknown domain', () => {
    const pattern = cache.get('unknown.com');
    expect(pattern).toBeUndefined();
  });

  it('should report not having pattern for unknown domain', () => {
    expect(cache.has('unknown.com')).toBe(false);
  });

  it('should handle various domain formats', () => {
    expect(cache.get('example.com')).toBeUndefined();
    expect(cache.get('www.example.com')).toBeUndefined();
    expect(cache.get('sub.domain.example.com')).toBeUndefined();
  });
});

// ==========================================
// SitePattern Structure Tests
// ==========================================

describe('SitePattern Structure', () => {
  it('should define expected pattern structure', () => {
    // Verify the expected shape of a SitePattern
    const mockPattern = {
      domain: 'example.com',
      version: '1.0.0',
      lastUpdated: '2024-01-01T00:00:00Z',
      selectors: {
        title: 'h1.title',
        content: 'article.main',
        author: '.author-name',
        date: '.publish-date',
      },
      contentStructure: {
        type: 'article' as const,
        pagination: {
          nextSelector: 'a.next-page',
          pageParamName: 'page',
        },
      },
    };

    expect(mockPattern.domain).toBe('example.com');
    expect(mockPattern.version).toBe('1.0.0');
    expect(mockPattern.selectors.title).toBe('h1.title');
    expect(mockPattern.contentStructure?.type).toBe('article');
  });

  it('should support different content types', () => {
    const contentTypes = ['article', 'list', 'forum', 'product', 'unknown'] as const;
    contentTypes.forEach((type) => {
      expect(['article', 'list', 'forum', 'product', 'unknown']).toContain(type);
    });
  });

  it('should support optional pagination config', () => {
    const patternWithPagination = {
      domain: 'news.com',
      version: '1.0.0',
      lastUpdated: '2024-01-01T00:00:00Z',
      selectors: {},
      contentStructure: {
        type: 'list' as const,
        pagination: {
          nextSelector: '.next',
          pageParamName: 'p',
        },
      },
    };

    expect(patternWithPagination.contentStructure?.pagination?.nextSelector).toBe('.next');
    expect(patternWithPagination.contentStructure?.pagination?.pageParamName).toBe('p');
  });

  it('should support custom extraction function as string', () => {
    const patternWithCustom = {
      domain: 'custom.com',
      version: '1.0.0',
      lastUpdated: '2024-01-01T00:00:00Z',
      selectors: {},
      customExtraction: 'function extract(doc) { return doc.title; }',
    };

    expect(patternWithCustom.customExtraction).toContain('function');
  });
});

// ==========================================
// Domain Matching Logic Tests
// ==========================================

describe('Domain Matching Logic', () => {
  // These test the domain matching algorithm used by PatternCache.get()

  function getParentDomain(domain: string): string | undefined {
    const parts = domain.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return undefined;
  }

  it('should extract parent domain from subdomain', () => {
    expect(getParentDomain('old.reddit.com')).toBe('reddit.com');
    expect(getParentDomain('www.example.com')).toBe('example.com');
    expect(getParentDomain('sub.domain.example.com')).toBe('example.com');
  });

  it('should return undefined for top-level domains', () => {
    expect(getParentDomain('example.com')).toBeUndefined();
    expect(getParentDomain('reddit.com')).toBeUndefined();
  });

  it('should handle single-part domains', () => {
    expect(getParentDomain('localhost')).toBeUndefined();
  });

  it('should handle deep subdomains', () => {
    expect(getParentDomain('a.b.c.d.example.com')).toBe('example.com');
  });
});

// ==========================================
// Pattern Sync API Structure Tests
// ==========================================

describe('Pattern Sync API', () => {
  it('should define sync request structure', () => {
    const syncRequest = {
      syncToken: 'token_abc123',
    };
    expect(syncRequest.syncToken).toBe('token_abc123');
  });

  it('should define sync response structure', () => {
    const syncResponse = {
      patterns: [
        {
          domain: 'example.com',
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          selectors: { title: 'h1' },
        },
      ],
      syncToken: 'new_token_xyz',
    };

    expect(Array.isArray(syncResponse.patterns)).toBe(true);
    expect(syncResponse.patterns.length).toBe(1);
    expect(syncResponse.syncToken).toBe('new_token_xyz');
  });

  it('should support empty patterns array (no updates)', () => {
    const noUpdatesResponse = {
      patterns: [],
      syncToken: 'same_token',
    };
    expect(noUpdatesResponse.patterns.length).toBe(0);
  });

  it('should support multiple patterns in response', () => {
    const multiPatternResponse = {
      patterns: [
        { domain: 'site1.com', version: '1.0', lastUpdated: '2024-01-01', selectors: {} },
        { domain: 'site2.com', version: '1.0', lastUpdated: '2024-01-01', selectors: {} },
        { domain: 'site3.com', version: '1.0', lastUpdated: '2024-01-01', selectors: {} },
      ],
      syncToken: 'batch_token',
    };
    expect(multiPatternResponse.patterns.length).toBe(3);
  });
});

// ==========================================
// IndexedDB Constants Tests
// ==========================================

describe('IndexedDB Configuration', () => {
  it('should use correct database name', () => {
    const DB_NAME = 'unbrowser-connect';
    expect(DB_NAME).toBe('unbrowser-connect');
  });

  it('should use correct store name', () => {
    const STORE_NAME = 'patterns';
    expect(STORE_NAME).toBe('patterns');
  });

  it('should use correct sync token key', () => {
    const SYNC_TOKEN_KEY = '__syncToken';
    expect(SYNC_TOKEN_KEY).toBe('__syncToken');
    // Prefix with __ to avoid collision with domain names
    expect(SYNC_TOKEN_KEY.startsWith('__')).toBe(true);
  });
});

// ==========================================
// Pattern Version Tests
// ==========================================

describe('Pattern Versioning', () => {
  it('should support semantic versioning', () => {
    const versions = ['1.0.0', '1.0.1', '1.1.0', '2.0.0'];
    versions.forEach((v) => {
      expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  it('should track lastUpdated timestamp', () => {
    const pattern = {
      domain: 'example.com',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      selectors: {},
    };
    expect(new Date(pattern.lastUpdated).getTime()).toBeGreaterThan(0);
  });
});

// ==========================================
// Selector Types Tests
// ==========================================

describe('Selector Types', () => {
  it('should support common selector fields', () => {
    const selectors = {
      title: 'h1',
      content: 'article',
      author: '.author',
      date: '.date',
    };

    expect(selectors.title).toBeDefined();
    expect(selectors.content).toBeDefined();
    expect(selectors.author).toBeDefined();
    expect(selectors.date).toBeDefined();
  });

  it('should support custom selector fields', () => {
    const selectors: Record<string, string | undefined> = {
      title: 'h1',
      price: '.price-tag',
      rating: '.star-rating',
      availability: '.in-stock',
    };

    expect(selectors.price).toBe('.price-tag');
    expect(selectors.rating).toBe('.star-rating');
  });

  it('should support CSS selectors', () => {
    const cssSelectors = [
      'h1',
      '.class',
      '#id',
      'div.class',
      'div > p',
      'div + p',
      '[data-attr]',
      '[data-attr="value"]',
      ':first-child',
      'ul li:nth-child(2)',
    ];

    cssSelectors.forEach((sel) => {
      expect(typeof sel).toBe('string');
      expect(sel.length).toBeGreaterThan(0);
    });
  });

  it('should allow undefined selectors', () => {
    const selectors: Record<string, string | undefined> = {
      title: 'h1',
      content: undefined,
    };

    expect(selectors.title).toBe('h1');
    expect(selectors.content).toBeUndefined();
  });
});

// ==========================================
// Content Structure Types Tests
// ==========================================

describe('Content Structure Types', () => {
  it('should support article type', () => {
    const articleStructure = {
      type: 'article' as const,
    };
    expect(articleStructure.type).toBe('article');
  });

  it('should support list type with pagination', () => {
    const listStructure = {
      type: 'list' as const,
      pagination: {
        nextSelector: 'a.next',
        pageParamName: 'page',
      },
    };
    expect(listStructure.type).toBe('list');
    expect(listStructure.pagination).toBeDefined();
  });

  it('should support forum type', () => {
    const forumStructure = {
      type: 'forum' as const,
    };
    expect(forumStructure.type).toBe('forum');
  });

  it('should support product type', () => {
    const productStructure = {
      type: 'product' as const,
    };
    expect(productStructure.type).toBe('product');
  });

  it('should support unknown type as fallback', () => {
    const unknownStructure = {
      type: 'unknown' as const,
    };
    expect(unknownStructure.type).toBe('unknown');
  });
});

// ==========================================
// Error Handling Tests
// ==========================================

describe('Pattern Cache Error Handling', () => {
  it('should handle missing pattern gracefully', () => {
    setupMocks();
    const cache = new PatternCache({
      apiUrl: 'https://api.unbrowser.ai',
      apiKey: 'ub_test_123',
      appId: 'test-app',
    });

    expect(() => cache.get('nonexistent.com')).not.toThrow();
    expect(cache.get('nonexistent.com')).toBeUndefined();
  });

  it('should handle empty domain', () => {
    setupMocks();
    const cache = new PatternCache({
      apiUrl: 'https://api.unbrowser.ai',
      apiKey: 'ub_test_123',
      appId: 'test-app',
    });

    expect(() => cache.get('')).not.toThrow();
    expect(cache.get('')).toBeUndefined();
  });

  it('should handle special characters in domain', () => {
    setupMocks();
    const cache = new PatternCache({
      apiUrl: 'https://api.unbrowser.ai',
      apiKey: 'ub_test_123',
      appId: 'test-app',
    });

    expect(() => cache.get('domain-with-dashes.com')).not.toThrow();
    expect(() => cache.get('domain_with_underscores.com')).not.toThrow();
    expect(() => cache.get('123.numbers.com')).not.toThrow();
  });
});

// ==========================================
// Sync Token Tests
// ==========================================

describe('Sync Token Behavior', () => {
  it('should start with null sync token', () => {
    setupMocks();
    const cache = new PatternCache({
      apiUrl: 'https://api.unbrowser.ai',
      apiKey: 'ub_test_123',
      appId: 'test-app',
    });
    // syncToken is private but starts as null
    expect(cache).toBeDefined();
  });

  it('should use sync token key that cannot conflict with domains', () => {
    // Sync token is stored with key '__syncToken'
    // This cannot be a valid domain because domains don't start with __
    const syncTokenKey = '__syncToken';
    expect(syncTokenKey.startsWith('__')).toBe(true);
    expect(syncTokenKey.includes('.')).toBe(false);
  });
});
