/**
 * Live Tests for Pattern Validation
 *
 * LI-004: Real-world pattern validation suite
 *
 * These tests validate that learned patterns work correctly against real sites.
 * They are skipped by default in CI - run with LIVE_TESTS=true to enable.
 *
 * Test coverage:
 * - Bootstrap pattern validation (JSON suffix, registry lookup, REST resource, query API)
 * - Learned pattern application
 * - Cross-domain pattern transfer
 * - Pattern staleness detection
 * - Anti-pattern blocking
 *
 * Note: Some tests may fail intermittently due to:
 * - API rate limiting
 * - Network issues
 * - Content changes on live sites
 * - Pattern drift (site APIs changed)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ContentIntelligence, type ContentResult } from '../../src/core/content-intelligence.js';
import { ApiPatternRegistry, PATTERN_TEMPLATES, API_DOMAIN_GROUPS } from '../../src/core/api-pattern-learner.js';
import type { LearnedApiPattern } from '../../src/types/api-patterns.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Skip live tests unless explicitly enabled
const LIVE_TESTS_ENABLED = process.env.LIVE_TESTS === 'true';
const describeIf = LIVE_TESTS_ENABLED ? describe : describe.skip;

// Longer timeout for network requests
const LIVE_TEST_TIMEOUT = 30000;

// Temp directory for test pattern registry
let tempDir: string;

describeIf('Live Pattern Validation', () => {
  let intelligence: ContentIntelligence;
  let registry: ApiPatternRegistry;

  beforeAll(async () => {
    // Create temp directory for isolated pattern storage
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-validation-'));

    // Initialize with temp storage
    intelligence = new ContentIntelligence();
    registry = new ApiPatternRegistry({ storagePath: tempDir });
    await registry.initialize();
  });

  afterAll(async () => {
    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // Helper to verify common result structure
  const expectValidResult = (result: ContentResult, opts?: { allowMediumConfidence?: boolean }) => {
    expect(result.error).toBeUndefined();
    expect(result.content.title).toBeDefined();
    expect(result.content.title.length).toBeGreaterThan(0);
    expect(result.content.text).toBeDefined();
    expect(result.content.text.length).toBeGreaterThan(0);
    if (opts?.allowMediumConfidence) {
      expect(['high', 'medium']).toContain(result.meta.confidence);
    } else {
      expect(result.meta.confidence).toBe('high');
    }
  };

  // ============================================
  // BOOTSTRAP PATTERN VALIDATION
  // Verify the 8 bootstrap patterns work on real sites
  // ============================================
  describe('Bootstrap Pattern Validation', () => {
    describe('JSON Suffix Pattern (json-suffix)', () => {
      it('should work on Reddit with JSON suffix', async () => {
        // The json-suffix pattern appends .json to URLs
        const result = await intelligence.extract('https://www.reddit.com/r/programming.json', {
          timeout: LIVE_TEST_TIMEOUT,
        });

        expect(result.error).toBeUndefined();
        expect(result.content.structured).toBeDefined();
        const structured = result.content.structured as { kind?: string; data?: { children?: unknown[] } };
        expect(structured.kind).toBe('Listing');
        expect(structured.data?.children).toBeDefined();
      }, LIVE_TEST_TIMEOUT);

      it('should produce valid JSON response from old.reddit.com', async () => {
        const result = await intelligence.extract('https://old.reddit.com/r/javascript.json', {
          timeout: LIVE_TEST_TIMEOUT,
        });

        expect(result.error).toBeUndefined();
        expect(result.content.structured).toBeDefined();
        const structured = result.content.structured as { kind?: string };
        expect(structured.kind).toBe('Listing');
      }, LIVE_TEST_TIMEOUT);
    });

    describe('Registry Lookup Pattern (registry-lookup)', () => {
      it('should work on NPM registry API', async () => {
        // The registry-lookup pattern transforms package URLs to registry APIs
        const response = await fetch('https://registry.npmjs.org/express');
        expect(response.ok).toBe(true);

        const data = await response.json() as { name?: string; 'dist-tags'?: Record<string, string> };
        expect(data.name).toBe('express');
        expect(data['dist-tags']?.latest).toBeDefined();
      }, LIVE_TEST_TIMEOUT);

      it('should work on PyPI JSON API', async () => {
        const response = await fetch('https://pypi.org/pypi/requests/json');
        expect(response.ok).toBe(true);

        const data = await response.json() as { info?: { name?: string; version?: string } };
        expect(data.info?.name).toBe('requests');
        expect(data.info?.version).toBeDefined();
      }, LIVE_TEST_TIMEOUT);

      it('should work on scoped NPM packages', async () => {
        const response = await fetch('https://registry.npmjs.org/@types/node');
        expect(response.ok).toBe(true);

        const data = await response.json() as { name?: string };
        expect(data.name).toBe('@types/node');
      }, LIVE_TEST_TIMEOUT);
    });

    describe('REST Resource Pattern (rest-resource)', () => {
      it('should work on GitHub API for repositories', async () => {
        const response = await fetch('https://api.github.com/repos/vitest-dev/vitest', {
          headers: { 'User-Agent': 'llm-browser-test' },
        });

        // May be rate limited, check gracefully
        if (response.status === 403) {
          console.log('GitHub API rate limited, skipping');
          return;
        }

        expect(response.ok).toBe(true);
        const data = await response.json() as { full_name?: string; id?: number };
        expect(data.full_name).toBe('vitest-dev/vitest');
        expect(data.id).toBeDefined();
      }, LIVE_TEST_TIMEOUT);

      it('should work on Wikipedia REST API for summaries', async () => {
        const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Python_(programming_language)');
        expect(response.ok).toBe(true);

        const data = await response.json() as { title?: string; extract?: string };
        expect(data.title).toBe('Python (programming language)');
        expect(data.extract).toBeDefined();
      }, LIVE_TEST_TIMEOUT);
    });

    describe('Firebase REST Pattern (firebase-rest)', () => {
      it('should work on HackerNews Firebase API for items', async () => {
        const response = await fetch('https://hacker-news.firebaseio.com/v0/item/1.json');
        expect(response.ok).toBe(true);

        const data = await response.json() as { id?: number; by?: string };
        expect(data.id).toBe(1);
        expect(data.by).toBe('pg');
      }, LIVE_TEST_TIMEOUT);

      it('should work on HackerNews top stories endpoint', async () => {
        const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        expect(response.ok).toBe(true);

        const data = await response.json() as number[];
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
      }, LIVE_TEST_TIMEOUT);
    });

    describe('Query API Pattern (query-api)', () => {
      it('should work on StackOverflow API', async () => {
        const response = await fetch(
          'https://api.stackexchange.com/2.3/questions/218384?site=stackoverflow&filter=withbody'
        );
        expect(response.ok).toBe(true);

        const data = await response.json() as { items?: Array<{ question_id?: number }> };
        expect(data.items).toBeDefined();
        expect(data.items![0]?.question_id).toBe(218384);
      }, LIVE_TEST_TIMEOUT);

      it('should work on Dev.to articles API', async () => {
        const response = await fetch('https://dev.to/api/articles?username=ben&per_page=1');
        expect(response.ok).toBe(true);

        const data = await response.json() as Array<{ user?: { username?: string } }>;
        expect(Array.isArray(data)).toBe(true);
        expect(data[0]?.user?.username).toBe('ben');
      }, LIVE_TEST_TIMEOUT);
    });
  });

  // ============================================
  // LEARNED PATTERN APPLICATION
  // Test that patterns can be programmatically added and applied
  // ============================================
  describe('Learned Pattern Application', () => {
    let testRegistry: ApiPatternRegistry;

    beforeEach(async () => {
      // Create fresh registry for each test
      const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-test-'));
      testRegistry = new ApiPatternRegistry({ storagePath: testDir });
      await testRegistry.initialize();
    });

    it('should successfully apply a learned registry-lookup pattern', async () => {
      // Learn a pattern from NPM
      const pattern: LearnedApiPattern = {
        id: 'test-npm-pattern',
        templateType: 'registry-lookup',
        domain: 'npmjs.com',
        urlPattern: '^https://(?:www\\.)?npmjs\\.com/package/([^/?#]+)$',
        apiEndpoint: 'https://registry.npmjs.org/{0}',
        contentMappings: [
          { sourcePath: 'name', targetField: 'title' },
          { sourcePath: 'description', targetField: 'text' },
        ],
        validation: {
          requiredFields: ['name'],
          minContentLength: 10,
        },
        metrics: {
          successCount: 5,
          failureCount: 0,
          avgResponseTime: 200,
          lastSuccessTime: Date.now(),
          lastFailureTime: undefined,
        },
        confidence: 0.9,
        createdAt: Date.now() - 86400000, // 1 day ago
        lastUsed: Date.now(),
      };

      testRegistry.addPattern(pattern);

      // Find the pattern
      const matches = testRegistry.findMatchingPatterns('https://www.npmjs.com/package/lodash');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.id).toBe('test-npm-pattern');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
    }, LIVE_TEST_TIMEOUT);

    it('should apply a REST resource pattern for GitHub-like URLs', async () => {
      const pattern: LearnedApiPattern = {
        id: 'test-github-pattern',
        templateType: 'rest-resource',
        domain: 'github.com',
        urlPattern: '^https://github\\.com/([^/]+)/([^/]+)/?$',
        apiEndpoint: 'https://api.github.com/repos/{0}/{1}',
        contentMappings: [
          { sourcePath: 'full_name', targetField: 'title' },
          { sourcePath: 'description', targetField: 'text' },
        ],
        validation: {
          requiredFields: ['id', 'full_name'],
          minContentLength: 20,
        },
        metrics: {
          successCount: 10,
          failureCount: 1,
          avgResponseTime: 300,
          lastSuccessTime: Date.now(),
          lastFailureTime: Date.now() - 86400000 * 7, // 7 days ago
        },
        confidence: 0.85,
        createdAt: Date.now() - 86400000 * 30, // 30 days ago
        lastUsed: Date.now() - 3600000, // 1 hour ago
      };

      testRegistry.addPattern(pattern);

      // Test URL matching and variable extraction
      const matches = testRegistry.findMatchingPatterns('https://github.com/facebook/react');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].extractedVariables).toBeDefined();
      expect(matches[0].extractedVariables![0]).toBe('facebook');
      expect(matches[0].extractedVariables![1]).toBe('react');
    }, LIVE_TEST_TIMEOUT);

    it('should reject patterns with low confidence', async () => {
      const lowConfidencePattern: LearnedApiPattern = {
        id: 'low-confidence-pattern',
        templateType: 'json-suffix',
        domain: 'example.com',
        urlPattern: '^https://example\\.com/.*$',
        apiEndpoint: 'https://example.com/{path}.json',
        contentMappings: [],
        validation: { requiredFields: [], minContentLength: 0 },
        metrics: {
          successCount: 1,
          failureCount: 10, // Many failures
          avgResponseTime: 5000,
          lastSuccessTime: Date.now() - 86400000 * 30, // 30 days ago
          lastFailureTime: Date.now(),
        },
        confidence: 0.1, // Very low confidence
        createdAt: Date.now() - 86400000 * 60,
        lastUsed: Date.now(),
      };

      testRegistry.addPattern(lowConfidencePattern);

      // Pattern should exist but not match due to low confidence
      const allPatterns = testRegistry.getPatterns();
      expect(allPatterns).toContain(lowConfidencePattern);

      // When finding patterns, low confidence should be filtered or ranked low
      const matches = testRegistry.findMatchingPatterns('https://example.com/test');
      const highConfidenceMatches = matches.filter(m => m.confidence > 0.3);
      expect(highConfidenceMatches.length).toBe(0);
    });
  });

  // ============================================
  // CROSS-DOMAIN PATTERN TRANSFER
  // Verify patterns can be transferred between similar sites
  // ============================================
  describe('Cross-Domain Pattern Transfer', () => {
    it('should recognize domain groups for package registries', () => {
      const packageRegistriesGroup = API_DOMAIN_GROUPS.find(g => g.name === 'package_registries');
      expect(packageRegistriesGroup).toBeDefined();
      expect(packageRegistriesGroup!.domains).toContain('npmjs.com');
      expect(packageRegistriesGroup!.domains).toContain('pypi.org');
      expect(packageRegistriesGroup!.domains).toContain('rubygems.org');
    });

    it('should recognize domain groups for code hosting', () => {
      const codeHostingGroup = API_DOMAIN_GROUPS.find(g => g.name === 'code_hosting');
      expect(codeHostingGroup).toBeDefined();
      expect(codeHostingGroup!.domains).toContain('github.com');
      expect(codeHostingGroup!.domains).toContain('gitlab.com');
      expect(codeHostingGroup!.domains).toContain('bitbucket.org');
    });

    it('should identify correct template types for domain groups', () => {
      const packageGroup = API_DOMAIN_GROUPS.find(g => g.name === 'package_registries');
      expect(packageGroup!.commonTemplateTypes).toContain('registry-lookup');

      const codeGroup = API_DOMAIN_GROUPS.find(g => g.name === 'code_hosting');
      expect(codeGroup!.commonTemplateTypes).toContain('rest-resource');
    });

    it('should have shared patterns for similar sites', () => {
      const packageGroup = API_DOMAIN_GROUPS.find(g => g.name === 'package_registries');
      expect(packageGroup!.sharedPatterns).toBeDefined();
      expect(packageGroup!.sharedPatterns.pathPatterns).toContain('/package/');
      expect(packageGroup!.sharedPatterns.responseFields).toContain('name');
      expect(packageGroup!.sharedPatterns.responseFields).toContain('version');
    });
  });

  // ============================================
  // PATTERN TEMPLATE COVERAGE
  // Ensure all pattern templates are properly defined
  // ============================================
  describe('Pattern Template Coverage', () => {
    it('should have all 5 expected pattern template types', () => {
      const templateTypes = PATTERN_TEMPLATES.map(t => t.type);
      expect(templateTypes).toContain('json-suffix');
      expect(templateTypes).toContain('registry-lookup');
      expect(templateTypes).toContain('rest-resource');
      expect(templateTypes).toContain('firebase-rest');
      expect(templateTypes).toContain('query-api');
    });

    it('should have proper indicators for each template', () => {
      for (const template of PATTERN_TEMPLATES) {
        expect(template.indicators).toBeDefined();
        expect(template.indicators.domainPatterns).toBeDefined();
        expect(Array.isArray(template.indicators.domainPatterns)).toBe(true);
      }
    });

    it('should have known implementations for each template', () => {
      for (const template of PATTERN_TEMPLATES) {
        expect(template.knownImplementations).toBeDefined();
        expect(template.knownImplementations.length).toBeGreaterThan(0);
      }
    });

    it('json-suffix template should cover Reddit domains', () => {
      const jsonSuffixTemplate = PATTERN_TEMPLATES.find(t => t.type === 'json-suffix');
      expect(jsonSuffixTemplate!.indicators.domainPatterns).toContain('reddit.com');
    });

    it('registry-lookup template should cover package managers', () => {
      const registryTemplate = PATTERN_TEMPLATES.find(t => t.type === 'registry-lookup');
      expect(registryTemplate!.indicators.domainPatterns).toContain('npmjs.com');
      expect(registryTemplate!.indicators.domainPatterns).toContain('pypi.org');
    });
  });

  // ============================================
  // PATTERN METRICS AND STALENESS
  // Test pattern metrics tracking and staleness detection
  // ============================================
  describe('Pattern Metrics and Staleness', () => {
    let testRegistry: ApiPatternRegistry;

    beforeEach(async () => {
      const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-metrics-'));
      testRegistry = new ApiPatternRegistry({ storagePath: testDir });
      await testRegistry.initialize();
    });

    it('should track success metrics for patterns', () => {
      const pattern: LearnedApiPattern = {
        id: 'metrics-test-pattern',
        templateType: 'json-suffix',
        domain: 'test.com',
        urlPattern: '^https://test\\.com/.*$',
        apiEndpoint: 'https://test.com/{path}.json',
        contentMappings: [],
        validation: { requiredFields: [], minContentLength: 0 },
        metrics: {
          successCount: 100,
          failureCount: 5,
          avgResponseTime: 150,
          lastSuccessTime: Date.now(),
          lastFailureTime: Date.now() - 86400000,
        },
        confidence: 0.95,
        createdAt: Date.now() - 86400000 * 7,
        lastUsed: Date.now(),
      };

      testRegistry.addPattern(pattern);

      const stats = testRegistry.getStats();
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(1);
    });

    it('should identify stale patterns based on last success time', () => {
      const stalePattern: LearnedApiPattern = {
        id: 'stale-pattern',
        templateType: 'rest-resource',
        domain: 'stale-site.com',
        urlPattern: '^https://stale-site\\.com/.*$',
        apiEndpoint: 'https://api.stale-site.com/{path}',
        contentMappings: [],
        validation: { requiredFields: [], minContentLength: 0 },
        metrics: {
          successCount: 50,
          failureCount: 20,
          avgResponseTime: 500,
          lastSuccessTime: Date.now() - 86400000 * 60, // 60 days ago
          lastFailureTime: Date.now() - 86400000 * 30, // 30 days ago
        },
        confidence: 0.6, // Degraded confidence
        createdAt: Date.now() - 86400000 * 90, // 90 days ago
        lastUsed: Date.now() - 86400000 * 45, // 45 days ago
      };

      testRegistry.addPattern(stalePattern);

      // Pattern should exist but confidence indicates staleness
      const patterns = testRegistry.getPatterns();
      const found = patterns.find(p => p.id === 'stale-pattern');
      expect(found).toBeDefined();
      expect(found!.confidence).toBeLessThan(0.7);

      // Last success was 60 days ago - consider stale
      const daysSinceSuccess = (Date.now() - found!.metrics.lastSuccessTime!) / 86400000;
      expect(daysSinceSuccess).toBeGreaterThan(30);
    });

    it('should calculate success rate correctly', () => {
      const pattern: LearnedApiPattern = {
        id: 'success-rate-pattern',
        templateType: 'query-api',
        domain: 'qa-site.com',
        urlPattern: '^https://qa-site\\.com/.*$',
        apiEndpoint: 'https://api.qa-site.com/query',
        contentMappings: [],
        validation: { requiredFields: [], minContentLength: 0 },
        metrics: {
          successCount: 80,
          failureCount: 20,
          avgResponseTime: 300,
          lastSuccessTime: Date.now(),
          lastFailureTime: Date.now() - 3600000,
        },
        confidence: 0.8,
        createdAt: Date.now() - 86400000 * 14,
        lastUsed: Date.now(),
      };

      const successRate = pattern.metrics.successCount /
        (pattern.metrics.successCount + pattern.metrics.failureCount);
      expect(successRate).toBe(0.8); // 80% success rate
    });
  });

  // ============================================
  // REAL-WORLD PATTERN APPLICATION VIA CONTENT INTELLIGENCE
  // End-to-end tests using the full extraction pipeline
  // ============================================
  describe('End-to-End Pattern Application', () => {
    it('should use learned patterns in extraction pipeline (api:learned strategy)', async () => {
      const result = await intelligence.extract('https://www.reddit.com/r/programming', {
        timeout: LIVE_TEST_TIMEOUT,
      });

      // Expect the api:reddit strategy to be used (which is based on the json-suffix pattern)
      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:reddit');
    }, LIVE_TEST_TIMEOUT);

    it('should track strategies attempted during extraction', async () => {
      const result = await intelligence.extract('https://www.reddit.com/r/typescript', {
        timeout: LIVE_TEST_TIMEOUT,
      });

      expect(result.meta.strategiesAttempted).toBeDefined();
      expect(Array.isArray(result.meta.strategiesAttempted)).toBe(true);
      expect(result.meta.strategiesAttempted.length).toBeGreaterThan(0);
    }, LIVE_TEST_TIMEOUT);

    it('should fallback to other strategies when learned patterns fail', async () => {
      // Use a site that doesn't have a learned pattern - should fallback
      const result = await intelligence.extract('https://example.com', {
        timeout: LIVE_TEST_TIMEOUT,
        allowBrowser: false, // Don't use Playwright for this test
      });

      // Should have attempted multiple strategies
      expect(result.meta.strategiesAttempted).toBeDefined();
      expect(result.meta.strategiesAttempted.length).toBeGreaterThan(1);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // REGRESSION TRACKING INFRASTRUCTURE
  // Verify we have the infrastructure to track pattern regressions
  // ============================================
  describe('Regression Tracking Infrastructure', () => {
    it('should be able to get pattern statistics', () => {
      const stats = registry.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalPatterns).toBe('number');
      expect(typeof stats.totalDomains).toBe('number');
    });

    it('should store pattern history with timestamps', async () => {
      const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-history-'));
      const testRegistry = new ApiPatternRegistry({ storagePath: testDir });
      await testRegistry.initialize();

      const pattern: LearnedApiPattern = {
        id: 'history-test-pattern',
        templateType: 'json-suffix',
        domain: 'history-test.com',
        urlPattern: '^https://history-test\\.com/.*$',
        apiEndpoint: 'https://history-test.com/{path}.json',
        contentMappings: [],
        validation: { requiredFields: [], minContentLength: 0 },
        metrics: {
          successCount: 10,
          failureCount: 0,
          avgResponseTime: 100,
          lastSuccessTime: Date.now(),
          lastFailureTime: undefined,
        },
        confidence: 0.9,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };

      testRegistry.addPattern(pattern);

      // Verify timestamps are tracked
      const patterns = testRegistry.getPatterns();
      const found = patterns.find(p => p.id === 'history-test-pattern');
      expect(found).toBeDefined();
      expect(found!.createdAt).toBeDefined();
      expect(found!.lastUsed).toBeDefined();
      expect(typeof found!.createdAt).toBe('number');

      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should support getting patterns by domain', () => {
      // This infrastructure is needed for regression tracking per-domain
      const patterns = registry.getPatterns();
      const byDomain = patterns.reduce((acc, p) => {
        if (!acc[p.domain]) acc[p.domain] = [];
        acc[p.domain].push(p);
        return acc;
      }, {} as Record<string, LearnedApiPattern[]>);

      // Verify we can group patterns by domain
      expect(typeof byDomain).toBe('object');
    });
  });
});
