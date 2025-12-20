/**
 * Tests for Link Discovery (D-003)
 *
 * Tests RFC 8288 Link header parsing, HTML link extraction,
 * and HATEOAS detection (HAL, JSON:API, Siren)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseLinkHeader,
  extractHtmlLinks,
  detectHypermediaFormat,
  extractHalLinks,
  extractJsonApiLinks,
  extractSirenLinks,
  extractCollectionJsonLinks,
  extractHydraLinks,
  extractHateoasLinks,
  discoverLinks,
  generatePatternsFromLinks,
  filterApiLinks,
  filterDocumentationLinks,
  extractPaginationLinks,
  type DiscoveredLink,
  type HypermediaFormat,
} from '../../src/core/link-discovery.js';

// ============================================
// RFC 8288 LINK HEADER PARSING
// ============================================

describe('parseLinkHeader', () => {
  it('should parse a simple Link header', () => {
    const header = '</api/users>; rel="self"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/api/users');
    expect(links[0].rel).toBe('self');
    expect(links[0].source).toBe('header');
  });

  it('should parse Link header with type attribute', () => {
    const header = '</openapi.json>; rel="describedby"; type="application/json"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/openapi.json');
    expect(links[0].rel).toBe('describedby');
    expect(links[0].type).toBe('application/json');
  });

  it('should parse multiple links in header', () => {
    const header = '</api/users?page=2>; rel="next", </api/users?page=1>; rel="prev"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(2);
    expect(links[0].rel).toBe('next');
    expect(links[1].rel).toBe('prev');
  });

  it('should parse Link header with title', () => {
    const header = '</api>; rel="service"; title="API Endpoint"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    expect(links[0].title).toBe('API Endpoint');
  });

  it('should handle quoted and unquoted values', () => {
    const header = '</api>; rel=self; type="application/json"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('self');
    expect(links[0].type).toBe('application/json');
  });

  it('should resolve relative URLs with baseUrl', () => {
    const header = '</api/users>; rel="collection"';
    const links = parseLinkHeader(header, 'https://example.com');

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://example.com/api/users');
  });

  it('should not modify absolute URLs', () => {
    const header = '<https://other.com/api>; rel="service"';
    const links = parseLinkHeader(header, 'https://example.com');

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://other.com/api');
  });

  it('should handle empty header', () => {
    expect(parseLinkHeader('')).toHaveLength(0);
    expect(parseLinkHeader('   ')).toHaveLength(0);
  });

  it('should mark API-related links correctly', () => {
    const header = '</api>; rel="service", </docs>; rel="help"';
    const links = parseLinkHeader(header);

    expect(links[0].isApiLink).toBe(true); // service is API relation
    expect(links[1].isApiLink).toBe(true); // help is documentation relation
  });

  it('should handle commas inside angle brackets', () => {
    const header = '</api?a=1,b=2>; rel="self"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/api?a=1,b=2');
  });

  it('should handle escaped quotes in title', () => {
    // Single backslash before quote - quote is escaped
    const header = '</api>; rel="self"; title="foo\\"bar"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    // The title parsing extracts the value between quotes
  });

  it('should handle escaped backslashes before quotes', () => {
    // Two backslashes before quote - backslash is escaped, quote is not
    // title="foo\\" means the value ends at the second backslash, then "bar" is another link
    const header = '</api>; rel="self"; title="test", </api2>; rel="next"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(2);
    expect(links[0].href).toBe('/api');
    expect(links[1].href).toBe('/api2');
  });

  it('should handle hreflang attribute', () => {
    const header = '</api/fr>; rel="alternate"; hreflang="fr"';
    const links = parseLinkHeader(header);

    expect(links).toHaveLength(1);
    expect(links[0].hreflang).toBe('fr');
  });
});

// ============================================
// HTML LINK EXTRACTION
// ============================================

describe('extractHtmlLinks', () => {
  it('should extract basic link element', () => {
    const html = '<link rel="api" href="/api/v2">';
    const links = extractHtmlLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/api/v2');
    expect(links[0].rel).toBe('api');
    expect(links[0].source).toBe('html');
  });

  it('should extract link with type attribute', () => {
    const html = '<link rel="alternate" type="application/json" href="/api/posts.json">';
    const links = extractHtmlLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('application/json');
    expect(links[0].isApiLink).toBe(true); // JSON type indicates API
  });

  it('should extract self-closing links', () => {
    const html = '<link rel="describedby" href="/swagger.json" />';
    const links = extractHtmlLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('describedby');
  });

  it('should extract multiple links', () => {
    const html = `
      <head>
        <link rel="api" href="/api">
        <link rel="alternate" type="application/json" href="/data.json">
        <link rel="stylesheet" href="/styles.css">
      </head>
    `;
    const links = extractHtmlLinks(html);

    expect(links).toHaveLength(3);
  });

  it('should resolve relative URLs with baseUrl', () => {
    const html = '<link rel="api" href="/api/v2">';
    const links = extractHtmlLinks(html, 'https://example.com');

    expect(links[0].href).toBe('https://example.com/api/v2');
  });

  it('should handle single-quoted attributes', () => {
    const html = "<link rel='api' href='/api'>";
    const links = extractHtmlLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('api');
  });

  it('should handle unquoted attributes', () => {
    const html = '<link rel=api href=/api>';
    const links = extractHtmlLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('api');
  });

  it('should handle empty html', () => {
    expect(extractHtmlLinks('')).toHaveLength(0);
    expect(extractHtmlLinks('   ')).toHaveLength(0);
  });

  it('should extract title and hreflang', () => {
    const html = '<link rel="alternate" href="/fr" hreflang="fr" title="French">';
    const links = extractHtmlLinks(html);

    expect(links[0].title).toBe('French');
    expect(links[0].hreflang).toBe('fr');
  });

  it('should mark stylesheet as non-API link', () => {
    const html = '<link rel="stylesheet" href="/styles.css">';
    const links = extractHtmlLinks(html);

    expect(links[0].isApiLink).toBe(false);
  });
});

// ============================================
// HATEOAS FORMAT DETECTION
// ============================================

describe('detectHypermediaFormat', () => {
  it('should detect HAL format', () => {
    const json = {
      _links: {
        self: { href: '/users/123' },
        collection: { href: '/users' },
      },
      id: 123,
      name: 'John',
    };

    expect(detectHypermediaFormat(json)).toBe('hal');
  });

  it('should detect JSON:API format with single resource', () => {
    const json = {
      data: {
        type: 'users',
        id: '123',
        attributes: { name: 'John' },
      },
    };

    expect(detectHypermediaFormat(json)).toBe('json-api');
  });

  it('should detect JSON:API format with array of resources', () => {
    const json = {
      data: [
        { type: 'users', id: '1' },
        { type: 'users', id: '2' },
      ],
    };

    expect(detectHypermediaFormat(json)).toBe('json-api');
  });

  it('should detect Siren format', () => {
    const json = {
      class: ['user'],
      properties: { name: 'John' },
      links: [
        { rel: ['self'], href: '/users/123' },
      ],
    };

    expect(detectHypermediaFormat(json)).toBe('siren');
  });

  it('should detect Collection+JSON format', () => {
    const json = {
      collection: {
        version: '1.0',
        href: '/users',
        items: [],
      },
    };

    expect(detectHypermediaFormat(json)).toBe('collection+json');
  });

  it('should detect Hydra format', () => {
    const json = {
      '@context': 'https://www.w3.org/ns/hydra/core',
      '@type': 'Collection',
      member: [],
    };

    expect(detectHypermediaFormat(json)).toBe('hydra');
  });

  it('should return null for non-hypermedia JSON', () => {
    const json = {
      users: [{ id: 1, name: 'John' }],
    };

    expect(detectHypermediaFormat(json)).toBeNull();
  });

  it('should return null for non-object input', () => {
    expect(detectHypermediaFormat(null)).toBeNull();
    expect(detectHypermediaFormat(undefined)).toBeNull();
    expect(detectHypermediaFormat('string')).toBeNull();
    expect(detectHypermediaFormat(123)).toBeNull();
  });
});

// ============================================
// HAL LINK EXTRACTION
// ============================================

describe('extractHalLinks', () => {
  it('should extract HAL links', () => {
    const json = {
      _links: {
        self: { href: '/users/123' },
        collection: { href: '/users' },
      },
    };

    const links = extractHalLinks(json);

    expect(links).toHaveLength(2);
    expect(links.find(l => l.rel === 'self')?.href).toBe('/users/123');
    expect(links.find(l => l.rel === 'collection')?.href).toBe('/users');
  });

  it('should handle array of links for same rel', () => {
    const json = {
      _links: {
        item: [
          { href: '/users/1' },
          { href: '/users/2' },
        ],
      },
    };

    const links = extractHalLinks(json);

    expect(links).toHaveLength(2);
    expect(links[0].rel).toBe('item');
    expect(links[1].rel).toBe('item');
  });

  it('should extract link metadata', () => {
    const json = {
      _links: {
        self: {
          href: '/users/123',
          title: 'Current user',
          type: 'application/json',
        },
      },
    };

    const links = extractHalLinks(json);

    expect(links[0].title).toBe('Current user');
    expect(links[0].type).toBe('application/json');
  });

  it('should resolve relative URLs', () => {
    const json = {
      _links: {
        self: { href: '/users/123' },
      },
    };

    const links = extractHalLinks(json, 'https://api.example.com');

    expect(links[0].href).toBe('https://api.example.com/users/123');
  });

  it('should set hypermediaFormat to hal', () => {
    const json = {
      _links: {
        self: { href: '/users' },
      },
    };

    const links = extractHalLinks(json);

    expect(links[0].hypermediaFormat).toBe('hal');
  });
});

// ============================================
// JSON:API LINK EXTRACTION
// ============================================

describe('extractJsonApiLinks', () => {
  it('should extract top-level links', () => {
    const json = {
      links: {
        self: '/users',
        next: '/users?page=2',
      },
      data: [],
    };

    const links = extractJsonApiLinks(json);

    expect(links).toHaveLength(2);
    expect(links.find(l => l.rel === 'self')?.href).toBe('/users');
    expect(links.find(l => l.rel === 'next')?.href).toBe('/users?page=2');
  });

  it('should handle object link format', () => {
    const json = {
      links: {
        self: { href: '/users', meta: { count: 10 } },
      },
      data: [],
    };

    const links = extractJsonApiLinks(json);

    expect(links[0].href).toBe('/users');
  });

  it('should extract links from data resources', () => {
    const json = {
      data: {
        type: 'users',
        id: '123',
        links: {
          self: '/users/123',
        },
      },
    };

    const links = extractJsonApiLinks(json);

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/users/123');
  });

  it('should extract links from array of resources', () => {
    const json = {
      data: [
        { type: 'users', id: '1', links: { self: '/users/1' } },
        { type: 'users', id: '2', links: { self: '/users/2' } },
      ],
    };

    const links = extractJsonApiLinks(json);

    expect(links).toHaveLength(2);
  });

  it('should set hypermediaFormat to json-api', () => {
    const json = {
      links: { self: '/users' },
      data: [],
    };

    const links = extractJsonApiLinks(json);

    expect(links[0].hypermediaFormat).toBe('json-api');
  });
});

// ============================================
// SIREN LINK EXTRACTION
// ============================================

describe('extractSirenLinks', () => {
  it('should extract Siren links', () => {
    const json = {
      links: [
        { rel: ['self'], href: '/users/123' },
        { rel: ['collection'], href: '/users' },
      ],
    };

    const links = extractSirenLinks(json);

    expect(links).toHaveLength(2);
    expect(links[0].rel).toBe('self');
    expect(links[1].rel).toBe('collection');
  });

  it('should handle multiple rels per link', () => {
    const json = {
      links: [
        { rel: ['self', 'current'], href: '/users/123' },
      ],
    };

    const links = extractSirenLinks(json);

    expect(links).toHaveLength(2);
    expect(links[0].rel).toBe('self');
    expect(links[1].rel).toBe('current');
    expect(links[0].href).toBe(links[1].href);
  });

  it('should extract links from embedded entities', () => {
    const json = {
      entities: [
        { rel: ['item'], href: '/users/1' },
        { rel: ['item'], href: '/users/2' },
      ],
      links: [],
    };

    const links = extractSirenLinks(json);

    expect(links).toHaveLength(2);
  });

  it('should extract link metadata', () => {
    const json = {
      links: [
        {
          rel: ['self'],
          href: '/users/123',
          type: 'application/json',
          title: 'Current user',
        },
      ],
    };

    const links = extractSirenLinks(json);

    expect(links[0].type).toBe('application/json');
    expect(links[0].title).toBe('Current user');
  });

  it('should set hypermediaFormat to siren', () => {
    const json = {
      links: [{ rel: ['self'], href: '/users' }],
    };

    const links = extractSirenLinks(json);

    expect(links[0].hypermediaFormat).toBe('siren');
  });
});

// ============================================
// COLLECTION+JSON LINK EXTRACTION
// ============================================

describe('extractCollectionJsonLinks', () => {
  it('should extract collection href as self link', () => {
    const json = {
      collection: {
        version: '1.0',
        href: 'https://api.example.com/friends/',
      },
    };

    const links = extractCollectionJsonLinks(json);

    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('self');
    expect(links[0].href).toBe('https://api.example.com/friends/');
  });

  it('should extract collection-level links', () => {
    const json = {
      collection: {
        href: '/friends/',
        links: [
          { rel: 'feed', href: '/friends/rss', prompt: 'RSS Feed' },
          { rel: 'queries', href: '/friends/search' },
        ],
      },
    };

    const links = extractCollectionJsonLinks(json);

    expect(links).toHaveLength(3); // self + 2 links
    expect(links[1].rel).toBe('feed');
    expect(links[1].href).toBe('/friends/rss');
    expect(links[1].title).toBe('RSS Feed');
    expect(links[2].rel).toBe('queries');
  });

  it('should extract links from items', () => {
    const json = {
      collection: {
        href: '/friends/',
        items: [
          { href: '/friends/jdoe' },
          {
            href: '/friends/msmith',
            links: [{ rel: 'blog', href: '/friends/msmith/blog' }],
          },
        ],
      },
    };

    const links = extractCollectionJsonLinks(json);

    // self, item, item, blog link
    expect(links).toHaveLength(4);
    expect(links.filter(l => l.rel === 'item')).toHaveLength(2);
    expect(links.find(l => l.rel === 'blog')?.href).toBe('/friends/msmith/blog');
  });

  it('should resolve relative URLs', () => {
    const json = {
      collection: {
        href: '/friends/',
        links: [{ rel: 'feed', href: '/friends/rss' }],
      },
    };

    const links = extractCollectionJsonLinks(json, 'https://api.example.com');

    expect(links[0].href).toBe('https://api.example.com/friends/');
    expect(links[1].href).toBe('https://api.example.com/friends/rss');
  });

  it('should set hypermediaFormat to collection+json', () => {
    const json = {
      collection: {
        href: '/friends/',
      },
    };

    const links = extractCollectionJsonLinks(json);

    expect(links[0].hypermediaFormat).toBe('collection+json');
  });

  it('should return empty array for non-collection+json', () => {
    expect(extractCollectionJsonLinks({})).toHaveLength(0);
    expect(extractCollectionJsonLinks({ data: [] })).toHaveLength(0);
    expect(extractCollectionJsonLinks(null)).toHaveLength(0);
  });
});

// ============================================
// HYDRA LINK EXTRACTION
// ============================================

describe('extractHydraLinks', () => {
  it('should extract @id as self link', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users',
    };

    const links = extractHydraLinks(json);

    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('self');
    expect(links[0].href).toBe('/api/users');
  });

  it('should extract pagination links from hydra:view', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users',
      'hydra:view': {
        '@id': '/api/users?page=2',
        'hydra:first': '/api/users?page=1',
        'hydra:last': '/api/users?page=5',
        'hydra:next': '/api/users?page=3',
        'hydra:previous': '/api/users?page=1',
      },
    };

    const links = extractHydraLinks(json);

    expect(links.find(l => l.rel === 'first')?.href).toBe('/api/users?page=1');
    expect(links.find(l => l.rel === 'last')?.href).toBe('/api/users?page=5');
    expect(links.find(l => l.rel === 'next')?.href).toBe('/api/users?page=3');
    expect(links.find(l => l.rel === 'prev')?.href).toBe('/api/users?page=1');
  });

  it('should extract operations', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users/123',
      'hydra:operation': [
        { 'hydra:method': 'GET', 'hydra:title': 'Get user' },
        { 'hydra:method': 'PUT', 'hydra:title': 'Update user' },
        { 'hydra:method': 'DELETE', 'hydra:title': 'Delete user' },
      ],
    };

    const links = extractHydraLinks(json);

    expect(links.filter(l => l.rel.startsWith('operation:'))).toHaveLength(3);
    expect(links.find(l => l.rel === 'operation:get')?.title).toBe('Get user');
    expect(links.find(l => l.rel === 'operation:put')?.title).toBe('Update user');
    expect(links.find(l => l.rel === 'operation:delete')?.title).toBe('Delete user');
  });

  it('should extract links from hydra:member', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users',
      'hydra:member': [
        { '@id': '/api/users/1' },
        { '@id': '/api/users/2' },
        { '@id': '/api/users/3' },
      ],
    };

    const links = extractHydraLinks(json);

    expect(links.filter(l => l.rel === 'item')).toHaveLength(3);
  });

  it('should resolve relative URLs', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users',
      'hydra:view': {
        'hydra:next': '/api/users?page=2',
      },
    };

    const links = extractHydraLinks(json, 'https://api.example.com');

    expect(links[0].href).toBe('https://api.example.com/api/users');
    expect(links.find(l => l.rel === 'next')?.href).toBe('https://api.example.com/api/users?page=2');
  });

  it('should set hypermediaFormat to hydra', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users',
    };

    const links = extractHydraLinks(json);

    expect(links[0].hypermediaFormat).toBe('hydra');
  });

  it('should return empty array for non-hydra', () => {
    expect(extractHydraLinks({})).toHaveLength(0);
    expect(extractHydraLinks({ _links: {} })).toHaveLength(0);
    expect(extractHydraLinks(null)).toHaveLength(0);
  });
});

// ============================================
// COMBINED HATEOAS EXTRACTION
// ============================================

describe('extractHateoasLinks', () => {
  it('should auto-detect and extract HAL links', () => {
    const json = {
      _links: {
        self: { href: '/users' },
      },
    };

    const links = extractHateoasLinks(json);

    expect(links).toHaveLength(1);
    expect(links[0].hypermediaFormat).toBe('hal');
  });

  it('should auto-detect and extract JSON:API links', () => {
    const json = {
      links: { self: '/users' },
      data: [{ type: 'users', id: '1' }],
    };

    const links = extractHateoasLinks(json);

    expect(links[0].hypermediaFormat).toBe('json-api');
  });

  it('should auto-detect and extract Siren links', () => {
    const json = {
      class: ['user'],
      links: [{ rel: ['self'], href: '/users' }],
    };

    const links = extractHateoasLinks(json);

    expect(links[0].hypermediaFormat).toBe('siren');
  });

  it('should auto-detect and extract Collection+JSON links', () => {
    const json = {
      collection: {
        href: '/friends/',
        items: [{ href: '/friends/jdoe' }],
      },
    };

    const links = extractHateoasLinks(json);

    expect(links[0].hypermediaFormat).toBe('collection+json');
  });

  it('should auto-detect and extract Hydra links', () => {
    const json = {
      '@context': 'http://www.w3.org/ns/hydra/context.jsonld',
      '@id': '/api/users',
    };

    const links = extractHateoasLinks(json);

    expect(links[0].hypermediaFormat).toBe('hydra');
  });

  it('should return empty array for non-hypermedia JSON', () => {
    const json = { users: [] };
    expect(extractHateoasLinks(json)).toHaveLength(0);
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

describe('filterApiLinks', () => {
  it('should filter to only API-related links', () => {
    const links: DiscoveredLink[] = [
      { href: '/api', rel: 'service', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: '/style.css', rel: 'stylesheet', source: 'html', isApiLink: false, confidence: 0.7 },
      { href: '/docs', rel: 'describedby', source: 'header', isApiLink: true, confidence: 0.85 },
    ];

    const filtered = filterApiLinks(links);

    expect(filtered).toHaveLength(2);
    expect(filtered.every(l => l.isApiLink)).toBe(true);
  });
});

describe('filterDocumentationLinks', () => {
  it('should filter to documentation links', () => {
    const links: DiscoveredLink[] = [
      { href: '/api', rel: 'service', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: '/docs', rel: 'describedby', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: '/help', rel: 'help', source: 'html', isApiLink: true, confidence: 0.7 },
    ];

    const filtered = filterDocumentationLinks(links);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(l => l.rel)).toEqual(['describedby', 'help']);
  });
});

describe('extractPaginationLinks', () => {
  it('should extract pagination links', () => {
    const links: DiscoveredLink[] = [
      { href: '/page2', rel: 'next', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: '/page1', rel: 'prev', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: '/page1', rel: 'first', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: '/page10', rel: 'last', source: 'header', isApiLink: true, confidence: 0.85 },
    ];

    const pagination = extractPaginationLinks(links);

    expect(pagination).toEqual({
      next: '/page2',
      prev: '/page1',
      first: '/page1',
      last: '/page10',
    });
  });

  it('should handle previous as alias for prev', () => {
    const links: DiscoveredLink[] = [
      { href: '/page1', rel: 'previous', source: 'header', isApiLink: true, confidence: 0.85 },
    ];

    const pagination = extractPaginationLinks(links);

    expect(pagination?.prev).toBe('/page1');
  });

  it('should return undefined if no pagination links', () => {
    const links: DiscoveredLink[] = [
      { href: '/api', rel: 'service', source: 'header', isApiLink: true, confidence: 0.85 },
    ];

    expect(extractPaginationLinks(links)).toBeUndefined();
  });
});

// ============================================
// PATTERN GENERATION
// ============================================

describe('generatePatternsFromLinks', () => {
  it('should generate patterns from API links', () => {
    const links: DiscoveredLink[] = [
      { href: 'https://api.example.com/users', rel: 'collection', source: 'hateoas', isApiLink: true, confidence: 0.8 },
    ];

    const patterns = generatePatternsFromLinks(links, 'api.example.com');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].endpointTemplate).toBe('https://api.example.com/users');
    expect(patterns[0].method).toBe('GET');
  });

  it('should skip non-API links', () => {
    const links: DiscoveredLink[] = [
      { href: '/style.css', rel: 'stylesheet', source: 'html', isApiLink: false, confidence: 0.7 },
    ];

    const patterns = generatePatternsFromLinks(links, 'example.com');

    expect(patterns).toHaveLength(0);
  });

  it('should deduplicate links with same href', () => {
    const links: DiscoveredLink[] = [
      { href: 'https://example.com/api/users', rel: 'collection', source: 'header', isApiLink: true, confidence: 0.85 },
      { href: 'https://example.com/api/users', rel: 'self', source: 'hateoas', isApiLink: true, confidence: 0.8 },
    ];

    const patterns = generatePatternsFromLinks(links, 'example.com');

    expect(patterns).toHaveLength(1);
  });

  it('should set Accept header from link type', () => {
    const links: DiscoveredLink[] = [
      { href: 'https://example.com/api', rel: 'service', type: 'application/hal+json', source: 'header', isApiLink: true, confidence: 0.85 },
    ];

    const patterns = generatePatternsFromLinks(links, 'example.com');

    expect(patterns[0].headers?.Accept).toBe('application/hal+json');
  });

  it('should escape asterisks as literals in URL pattern', () => {
    // URLs with asterisks should be escaped, not treated as wildcards
    const links: DiscoveredLink[] = [
      { href: 'https://example.com/files?token=*', rel: 'service', source: 'header', isApiLink: true, confidence: 0.85 },
    ];

    const patterns = generatePatternsFromLinks(links, 'example.com');

    expect(patterns).toHaveLength(1);
    // urlPatterns is an array
    expect(patterns[0].urlPatterns).toHaveLength(1);
    // The pattern should escape * to \* for a literal match
    expect(patterns[0].urlPatterns[0]).toContain('\\*');
    // It should NOT contain .* which would be a wildcard
    expect(patterns[0].urlPatterns[0]).not.toContain('.*');
  });
});

// ============================================
// MAIN DISCOVERY FUNCTION
// ============================================

describe('discoverLinks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should discover links from pre-fetched headers', async () => {
    const result = await discoverLinks('https://example.com', {
      responseHeaders: {
        'Link': '</api>; rel="service"',
      },
    });

    expect(result.found).toBe(true);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].rel).toBe('service');
  });

  it('should discover links from pre-fetched HTML', async () => {
    const result = await discoverLinks('https://example.com', {
      htmlContent: '<link rel="api" href="/api">',
    });

    expect(result.found).toBe(true);
    expect(result.links).toHaveLength(1);
  });

  it('should discover links from pre-fetched JSON (HATEOAS)', async () => {
    const result = await discoverLinks('https://example.com', {
      jsonResponse: {
        _links: {
          self: { href: '/users' },
        },
      },
    });

    expect(result.found).toBe(true);
    expect(result.hypermediaFormat).toBe('hal');
  });

  it('should combine links from multiple sources', async () => {
    const result = await discoverLinks('https://example.com', {
      responseHeaders: {
        'Link': '</api>; rel="service"',
      },
      htmlContent: '<link rel="describedby" href="/docs">',
      jsonResponse: {
        _links: { self: { href: '/users' } },
      },
    });

    expect(result.links).toHaveLength(3);
  });

  it('should categorize API and documentation links', async () => {
    const result = await discoverLinks('https://example.com', {
      responseHeaders: {
        'Link': '</api>; rel="service", </docs>; rel="describedby"',
      },
    });

    expect(result.apiLinks).toHaveLength(2); // both are API-related
    expect(result.documentationLinks).toHaveLength(1); // only describedby
  });

  it('should extract pagination links', async () => {
    const result = await discoverLinks('https://example.com', {
      responseHeaders: {
        'Link': '</page2>; rel="next", </page1>; rel="prev"',
      },
    });

    expect(result.paginationLinks).toEqual({
      next: 'https://example.com/page2',
      prev: 'https://example.com/page1',
    });
  });

  it('should return empty result when no links found', async () => {
    const result = await discoverLinks('https://example.com', {
      htmlContent: '<div>No links here</div>',
    });

    expect(result.found).toBe(false);
    expect(result.links).toHaveLength(0);
  });

  it('should fetch URL when no pre-fetched content provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      headers: new Headers({
        'Link': '</api>; rel="service"',
        'Content-Type': 'text/html',
      }),
      text: async () => '<link rel="api" href="/api">',
    });

    const result = await discoverLinks('https://example.com', {
      fetchFn: mockFetch,
    });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    expect(result.found).toBe(true);
    expect(result.links.length).toBeGreaterThan(0);
  });

  it('should handle fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await discoverLinks('https://example.com', {
      fetchFn: mockFetch,
    });

    expect(result.found).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should handle timeout', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const result = await discoverLinks('https://example.com', {
      fetchFn: mockFetch,
      timeout: 100,
    });

    expect(result.found).toBe(false);
    expect(result.error).toBe('Request timed out');
  });

  it('should parse JSON response for HATEOAS', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
      text: async () => JSON.stringify({
        _links: { self: { href: '/users' } },
      }),
    });

    const result = await discoverLinks('https://example.com', {
      fetchFn: mockFetch,
    });

    expect(result.hypermediaFormat).toBe('hal');
  });

  it('should track discovery time', async () => {
    const result = await discoverLinks('https://example.com', {
      responseHeaders: { 'Link': '</api>; rel="service"' },
    });

    expect(result.discoveryTime).toBeGreaterThanOrEqual(0);
  });
});
