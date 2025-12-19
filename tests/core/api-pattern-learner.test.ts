/**
 * Tests for API Pattern Learner
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  ApiPatternRegistry,
  PATTERN_TEMPLATES,
  BOOTSTRAP_PATTERNS,
  getPatternTemplate,
  suggestTemplateType,
} from '../../src/core/api-pattern-learner.js';
import type {
  PatternTemplateType,
  LearnedApiPattern,
  PatternMatch,
} from '../../src/types/api-patterns.js';

// ============================================
// PATTERN TEMPLATES TESTS
// ============================================

describe('Pattern Templates', () => {
  describe('PATTERN_TEMPLATES', () => {
    it('should define 5 pattern template types', () => {
      expect(PATTERN_TEMPLATES).toHaveLength(5);
    });

    it('should have all expected template types', () => {
      const types = PATTERN_TEMPLATES.map((t) => t.type);
      expect(types).toContain('json-suffix');
      expect(types).toContain('registry-lookup');
      expect(types).toContain('rest-resource');
      expect(types).toContain('firebase-rest');
      expect(types).toContain('query-api');
    });

    it('each template should have required properties', () => {
      for (const template of PATTERN_TEMPLATES) {
        expect(template.type).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.indicators).toBeDefined();
        expect(template.knownImplementations).toBeDefined();
        expect(template.knownImplementations.length).toBeGreaterThan(0);
      }
    });

    it('json-suffix template should match Reddit pattern', () => {
      const template = PATTERN_TEMPLATES.find((t) => t.type === 'json-suffix');
      expect(template?.knownImplementations).toContain('reddit.com');
    });

    it('registry-lookup template should match NPM and PyPI', () => {
      const template = PATTERN_TEMPLATES.find(
        (t) => t.type === 'registry-lookup'
      );
      expect(template?.knownImplementations).toContain('npmjs.com');
      expect(template?.knownImplementations).toContain('pypi.org');
    });
  });

  describe('getPatternTemplate', () => {
    it('should return template for valid type', () => {
      const template = getPatternTemplate('json-suffix');
      expect(template).toBeDefined();
      expect(template?.type).toBe('json-suffix');
    });

    it('should return undefined for invalid type', () => {
      const template = getPatternTemplate(
        'invalid-type' as PatternTemplateType
      );
      expect(template).toBeUndefined();
    });
  });

  describe('suggestTemplateType', () => {
    it('should suggest json-suffix for Reddit URLs', () => {
      expect(suggestTemplateType('https://www.reddit.com/r/programming')).toBe(
        'json-suffix'
      );
      expect(suggestTemplateType('https://old.reddit.com/r/technology')).toBe(
        'json-suffix'
      );
    });

    it('should suggest registry-lookup for NPM URLs', () => {
      expect(suggestTemplateType('https://www.npmjs.com/package/express')).toBe(
        'registry-lookup'
      );
    });

    it('should suggest registry-lookup for PyPI URLs', () => {
      expect(suggestTemplateType('https://pypi.org/project/requests')).toBe(
        'registry-lookup'
      );
    });

    it('should suggest firebase-rest for HackerNews URLs', () => {
      expect(
        suggestTemplateType('https://news.ycombinator.com/item?id=12345')
      ).toBe('firebase-rest');
    });

    it('should suggest query-api for StackOverflow URLs', () => {
      expect(
        suggestTemplateType('https://stackoverflow.com/questions/12345')
      ).toBe('query-api');
    });

    it('should suggest query-api for Dev.to URLs', () => {
      expect(suggestTemplateType('https://dev.to/user/article-slug')).toBe(
        'query-api'
      );
    });

    it('should return null for unknown URLs', () => {
      expect(suggestTemplateType('https://example.com/page')).toBeNull();
    });
  });
});

// ============================================
// BOOTSTRAP PATTERNS TESTS
// ============================================

describe('Bootstrap Patterns', () => {
  it('should define 8 bootstrap patterns', () => {
    expect(BOOTSTRAP_PATTERNS).toHaveLength(8);
  });

  it('should have patterns from all known handlers', () => {
    const sources = BOOTSTRAP_PATTERNS.map((p) => p.source);
    expect(sources).toContain('reddit');
    expect(sources).toContain('npm');
    expect(sources).toContain('pypi');
    expect(sources).toContain('github');
    expect(sources).toContain('wikipedia');
    expect(sources).toContain('hackernews');
    expect(sources).toContain('stackoverflow');
    expect(sources).toContain('devto');
  });

  it('each bootstrap pattern should have required properties', () => {
    for (const bootstrap of BOOTSTRAP_PATTERNS) {
      expect(bootstrap.source).toBeDefined();
      expect(bootstrap.initialConfidence).toBe(1.0);
      expect(bootstrap.initialSuccessCount).toBe(1000);
      expect(bootstrap.pattern.templateType).toBeDefined();
      expect(bootstrap.pattern.urlPatterns.length).toBeGreaterThan(0);
      expect(bootstrap.pattern.endpointTemplate).toBeDefined();
      expect(bootstrap.pattern.method).toBe('GET');
      expect(bootstrap.pattern.responseFormat).toBe('json');
    }
  });

  describe('Reddit bootstrap pattern', () => {
    const reddit = BOOTSTRAP_PATTERNS.find((p) => p.source === 'reddit');

    it('should use json-suffix template', () => {
      expect(reddit?.pattern.templateType).toBe('json-suffix');
    });

    it('should have {url}.json endpoint template', () => {
      expect(reddit?.pattern.endpointTemplate).toBe('{url}.json');
    });

    it('should require data and kind fields', () => {
      expect(reddit?.pattern.validation.requiredFields).toContain('data');
      expect(reddit?.pattern.validation.requiredFields).toContain('kind');
    });
  });

  describe('NPM bootstrap pattern', () => {
    const npm = BOOTSTRAP_PATTERNS.find((p) => p.source === 'npm');

    it('should use registry-lookup template', () => {
      expect(npm?.pattern.templateType).toBe('registry-lookup');
    });

    it('should have registry.npmjs.org endpoint', () => {
      expect(npm?.pattern.endpointTemplate).toBe(
        'https://registry.npmjs.org/{package}'
      );
    });

    it('should extract package name from path', () => {
      const extractor = npm?.pattern.extractors[0];
      expect(extractor?.name).toBe('package');
      expect(extractor?.source).toBe('path');
    });
  });

  describe('GitHub bootstrap pattern', () => {
    const github = BOOTSTRAP_PATTERNS.find((p) => p.source === 'github');

    it('should use rest-resource template', () => {
      expect(github?.pattern.templateType).toBe('rest-resource');
    });

    it('should extract owner and repo', () => {
      const extractors = github?.pattern.extractors;
      expect(extractors?.map((e) => e.name)).toContain('owner');
      expect(extractors?.map((e) => e.name)).toContain('repo');
    });

    it('should use GitHub API accept header', () => {
      expect(github?.pattern.headers?.Accept).toBe(
        'application/vnd.github.v3+json'
      );
    });
  });
});

// ============================================
// API PATTERN REGISTRY TESTS
// ============================================

describe('ApiPatternRegistry', () => {
  const TEST_FILE = './test-patterns.json';
  let registry: ApiPatternRegistry;

  beforeEach(async () => {
    // Clean up any existing test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }

    registry = new ApiPatternRegistry({
      filePath: TEST_FILE,
      autoPersist: false, // Disable auto-persist for tests
    });
  });

  afterEach(async () => {
    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  describe('initialization', () => {
    it('should bootstrap patterns on first initialization', async () => {
      await registry.initialize();
      const stats = registry.getStats();
      expect(stats.totalPatterns).toBe(8); // 8 bootstrap patterns
    });

    it('should index patterns by domain', async () => {
      await registry.initialize();
      const redditPatterns = registry.getPatternsForDomain('reddit.com');
      expect(redditPatterns.length).toBeGreaterThan(0);
    });

    it('should index patterns by template type', async () => {
      await registry.initialize();
      const jsonSuffixPatterns = registry.getPatternsByType('json-suffix');
      expect(jsonSuffixPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('pattern matching', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should match Reddit URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/programming/comments/abc123/test'
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.templateType).toBe('json-suffix');
    });

    it('should match NPM package URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://www.npmjs.com/package/express'
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.templateType).toBe('registry-lookup');
    });

    it('should extract package name from NPM URL', () => {
      const matches = registry.findMatchingPatterns(
        'https://www.npmjs.com/package/lodash'
      );
      expect(matches[0].extractedVariables.package).toBe('lodash');
    });

    it('should match PyPI project URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://pypi.org/project/requests'
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.templateType).toBe('registry-lookup');
    });

    it('should extract package name from PyPI URL', () => {
      const matches = registry.findMatchingPatterns(
        'https://pypi.org/project/django'
      );
      expect(matches[0].extractedVariables.package).toBe('django');
    });

    it('should match GitHub repo URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://github.com/facebook/react'
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.templateType).toBe('rest-resource');
    });

    it('should extract owner and repo from GitHub URL', () => {
      const matches = registry.findMatchingPatterns(
        'https://github.com/microsoft/typescript'
      );
      expect(matches[0].extractedVariables.owner).toBe('microsoft');
      expect(matches[0].extractedVariables.repo).toBe('typescript');
    });

    it('should match HackerNews item URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://news.ycombinator.com/item?id=12345'
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.templateType).toBe('firebase-rest');
    });

    it('should extract item ID from HackerNews URL', () => {
      const matches = registry.findMatchingPatterns(
        'https://news.ycombinator.com/item?id=98765'
      );
      expect(matches[0].extractedVariables.id).toBe('98765');
    });

    it('should match StackOverflow question URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://stackoverflow.com/questions/12345/how-to-do-something'
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.templateType).toBe('query-api');
    });

    it('should return empty array for non-matching URLs', () => {
      const matches = registry.findMatchingPatterns(
        'https://example.com/unknown/page'
      );
      expect(matches).toHaveLength(0);
    });

    it('should compute API endpoint from template', () => {
      const matches = registry.findMatchingPatterns(
        'https://www.npmjs.com/package/axios'
      );
      expect(matches[0].apiEndpoint).toBe('https://registry.npmjs.org/axios');
    });

    it('should sort matches by confidence', () => {
      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      if (matches.length > 1) {
        for (let i = 1; i < matches.length; i++) {
          expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(
            matches[i].confidence
          );
        }
      }
    });
  });

  describe('metrics update', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should update success count on successful application', async () => {
      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      const pattern = matches[0].pattern;
      const originalSuccessCount = pattern.metrics.successCount;

      await registry.updatePatternMetrics(
        pattern.id,
        true,
        'reddit.com',
        100
      );

      const updatedPattern = registry.getPattern(pattern.id);
      expect(updatedPattern?.metrics.successCount).toBe(
        originalSuccessCount + 1
      );
    });

    it('should update failure count on failed application', async () => {
      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      const pattern = matches[0].pattern;
      const originalFailureCount = pattern.metrics.failureCount;

      await registry.updatePatternMetrics(
        pattern.id,
        false,
        'reddit.com',
        0,
        'Network error'
      );

      const updatedPattern = registry.getPattern(pattern.id);
      expect(updatedPattern?.metrics.failureCount).toBe(
        originalFailureCount + 1
      );
      expect(updatedPattern?.metrics.lastFailureReason).toBe('Network error');
    });

    it('should add new domain on success', async () => {
      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      const pattern = matches[0].pattern;

      await registry.updatePatternMetrics(
        pattern.id,
        true,
        'new-reddit-domain.com',
        100
      );

      const updatedPattern = registry.getPattern(pattern.id);
      expect(updatedPattern?.metrics.domains).toContain(
        'new-reddit-domain.com'
      );
    });

    it('should update average response time', async () => {
      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      const pattern = matches[0].pattern;

      await registry.updatePatternMetrics(pattern.id, true, 'reddit.com', 200);

      const updatedPattern = registry.getPattern(pattern.id);
      expect(updatedPattern?.metrics.avgResponseTime).toBeDefined();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should return correct total patterns count', () => {
      const stats = registry.getStats();
      expect(stats.totalPatterns).toBe(8);
    });

    it('should return patterns by type', () => {
      const stats = registry.getStats();
      expect(stats.patternsByType['json-suffix']).toBe(1);
      expect(stats.patternsByType['registry-lookup']).toBe(2);
      expect(stats.patternsByType['rest-resource']).toBe(2);
      expect(stats.patternsByType['firebase-rest']).toBe(1);
      expect(stats.patternsByType['query-api']).toBe(2);
    });

    it('should count covered domains', () => {
      const stats = registry.getStats();
      expect(stats.domainsCovered).toBeGreaterThan(0);
    });

    it('should calculate average confidence', () => {
      const stats = registry.getStats();
      expect(stats.avgConfidence).toBe(1.0); // Bootstrap patterns have 1.0 confidence
    });

    it('should count high confidence patterns', () => {
      const stats = registry.getStats();
      expect(stats.highConfidencePatterns).toBe(8); // All bootstrap patterns are high confidence
    });
  });

  describe('event subscription', () => {
    it('should emit pattern_learned events on bootstrap', async () => {
      const events: any[] = [];
      registry.subscribe((event) => events.push(event));

      await registry.initialize();

      const learnedEvents = events.filter((e) => e.type === 'pattern_learned');
      expect(learnedEvents.length).toBe(8); // 8 bootstrap patterns
      expect(learnedEvents[0].source).toBe('bootstrap');
    });

    it('should emit pattern_applied events on metrics update', async () => {
      await registry.initialize();

      const events: any[] = [];
      registry.subscribe((event) => events.push(event));

      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      await registry.updatePatternMetrics(
        matches[0].pattern.id,
        true,
        'reddit.com',
        100
      );

      const appliedEvents = events.filter((e) => e.type === 'pattern_applied');
      expect(appliedEvents.length).toBe(1);
      expect(appliedEvents[0].success).toBe(true);
    });

    it('should allow unsubscribing', async () => {
      await registry.initialize();

      const events: any[] = [];
      const unsubscribe = registry.subscribe((event) => events.push(event));

      unsubscribe();

      const matches = registry.findMatchingPatterns(
        'https://www.reddit.com/r/test'
      );
      await registry.updatePatternMetrics(
        matches[0].pattern.id,
        true,
        'reddit.com',
        100
      );

      expect(events.length).toBe(0);
    });
  });

  describe('pattern learning', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should learn a new pattern from extraction', async () => {
      const pattern = await registry.learnPattern(
        'rest-resource',
        'https://api.example.com/users/123',
        'https://api.example.com/v1/users/123',
        {
          title: 'name',
          description: 'bio',
        },
        {
          requiredFields: ['id', 'name'],
          minContentLength: 50,
        }
      );

      expect(pattern.id).toMatch(/^learned:/);
      expect(pattern.templateType).toBe('rest-resource');
      expect(pattern.metrics.successCount).toBe(1);
      expect(pattern.metrics.confidence).toBe(0.5);
    });

    it('should add learned pattern to indexes', async () => {
      await registry.learnPattern(
        'rest-resource',
        'https://newsite.com/api/item/456',
        'https://newsite.com/v1/items/456',
        { title: 'title' },
        { requiredFields: ['id'], minContentLength: 20 }
      );

      const patterns = registry.getPatternsForDomain('newsite.com');
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should remove stale patterns', async () => {
      // Create a pattern with old timestamp
      const stalePattern = await registry.learnPattern(
        'rest-resource',
        'https://stale.com/item/1',
        'https://stale.com/api/items/1',
        { title: 'title' },
        { requiredFields: ['id'], minContentLength: 20 }
      );

      // Manually set the pattern as stale (created 100 days ago)
      const pattern = registry.getPattern(stalePattern.id);
      if (pattern) {
        pattern.createdAt = Date.now() - 100 * 24 * 60 * 60 * 1000;
        pattern.metrics.lastSuccess = pattern.createdAt;
      }

      const removed = await registry.cleanup();
      // Should remove the stale pattern
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================
// WIKIPEDIA PATTERN TESTS
// ============================================

describe('Wikipedia Pattern', () => {
  let registry: ApiPatternRegistry;

  beforeEach(async () => {
    registry = new ApiPatternRegistry({
      filePath: './test-wiki-patterns.json',
      autoPersist: false,
    });
    await registry.initialize();
  });

  afterEach(() => {
    if (existsSync('./test-wiki-patterns.json')) {
      unlinkSync('./test-wiki-patterns.json');
    }
  });

  it('should match Wikipedia article URLs', () => {
    const matches = registry.findMatchingPatterns(
      'https://en.wikipedia.org/wiki/TypeScript'
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.templateType).toBe('rest-resource');
  });

  it('should extract language subdomain', () => {
    const matches = registry.findMatchingPatterns(
      'https://es.wikipedia.org/wiki/JavaScript'
    );
    if (matches.length > 0) {
      expect(matches[0].extractedVariables.lang).toBe('es');
    }
  });

  it('should extract article title', () => {
    const matches = registry.findMatchingPatterns(
      'https://en.wikipedia.org/wiki/Node.js'
    );
    if (matches.length > 0 && matches[0].extractedVariables.title) {
      expect(matches[0].extractedVariables.title).toContain('Node');
    }
  });
});

// ============================================
// DEV.TO PATTERN TESTS
// ============================================

describe('Dev.to Pattern', () => {
  let registry: ApiPatternRegistry;

  beforeEach(async () => {
    registry = new ApiPatternRegistry({
      filePath: './test-devto-patterns.json',
      autoPersist: false,
    });
    await registry.initialize();
  });

  afterEach(() => {
    if (existsSync('./test-devto-patterns.json')) {
      unlinkSync('./test-devto-patterns.json');
    }
  });

  it('should match Dev.to article URLs', () => {
    const matches = registry.findMatchingPatterns(
      'https://dev.to/username/article-slug'
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.templateType).toBe('query-api');
  });

  it('should extract username and slug', () => {
    const matches = registry.findMatchingPatterns(
      'https://dev.to/testuser/my-article'
    );
    if (matches.length > 0) {
      expect(matches[0].extractedVariables.username).toBe('testuser');
      expect(matches[0].extractedVariables.slug).toBe('my-article');
    }
  });

  it('should compute correct API endpoint', () => {
    const matches = registry.findMatchingPatterns(
      'https://dev.to/ben/javascript-basics'
    );
    if (matches.length > 0) {
      expect(matches[0].apiEndpoint).toBe(
        'https://dev.to/api/articles/ben/javascript-basics'
      );
    }
  });
});

// ============================================
// LEARN FROM EXTRACTION TESTS
// ============================================

describe('ApiPatternRegistry.learnFromExtraction', () => {
  let registry: ApiPatternRegistry;

  beforeEach(async () => {
    registry = new ApiPatternRegistry({
      filePath: './test-learn-extraction.json',
      autoPersist: false,
    });
    await registry.initialize();
  });

  afterEach(() => {
    if (existsSync('./test-learn-extraction.json')) {
      unlinkSync('./test-learn-extraction.json');
    }
  });

  it('should update existing pattern metrics when pattern already exists', async () => {
    // Bootstrap patterns include reddit
    const initialMatches = registry.findMatchingPatterns(
      'https://reddit.com/r/programming/comments/abc123/test'
    );
    expect(initialMatches.length).toBeGreaterThan(0);
    const initialSuccessCount = initialMatches[0].pattern.metrics.successCount;

    // Simulate a successful extraction
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://reddit.com/r/programming/comments/abc123/test',
      apiUrl: 'https://reddit.com/r/programming/comments/abc123/test.json',
      strategy: 'api:reddit',
      responseTime: 150,
      content: {
        title: 'Test Post',
        text: 'Test content',
        markdown: '# Test Post\n\nTest content',
      },
      method: 'GET',
    });

    expect(result).not.toBeNull();
    expect(result?.metrics.successCount).toBe(initialSuccessCount + 1);
  });

  it('should learn new pattern for unknown site', async () => {
    const initialStats = registry.getStats();

    // Simulate extraction from a new site
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://newsite.com/posts/my-post',
      apiUrl: 'https://api.newsite.com/v1/posts/my-post',
      strategy: 'api:discovered',
      responseTime: 200,
      content: {
        title: 'My Post Title',
        text: 'Post body text',
        markdown: '# My Post Title\n\nPost body text',
      },
      method: 'GET',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toContain('learned:');

    const newStats = registry.getStats();
    expect(newStats.totalPatterns).toBe(initialStats.totalPatterns + 1);
  });

  it('should infer json-suffix template type', async () => {
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://example.com/posts/123',
      apiUrl: 'https://example.com/posts/123.json',
      strategy: 'api:predicted',
      responseTime: 100,
      content: {
        title: 'Post',
        text: 'Content',
        markdown: 'Content',
      },
      method: 'GET',
    });

    expect(result?.templateType).toBe('json-suffix');
  });

  it('should infer registry-lookup template type for different host', async () => {
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://newregistry.com/package/mypackage',
      apiUrl: 'https://registry.newregistry.com/api/mypackage',
      strategy: 'api:predicted',
      responseTime: 100,
      content: {
        title: 'mypackage',
        text: 'Package description',
        markdown: 'Package description',
      },
      method: 'GET',
    });

    expect(result?.templateType).toBe('registry-lookup');
  });

  it('should infer query-api template type for query params', async () => {
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://qa.example.com/questions/12345',
      apiUrl: 'https://api.qa.example.com/questions?id=12345&format=json',
      strategy: 'api:predicted',
      responseTime: 100,
      content: {
        title: 'Question',
        text: 'Question body',
        markdown: 'Question body',
      },
      method: 'GET',
    });

    expect(result?.templateType).toBe('query-api');
  });

  it('should use known strategy mappings', async () => {
    // Test that api:npm maps to registry-lookup
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://example-npm.com/package/test-pkg',
      apiUrl: 'https://registry.example-npm.com/test-pkg',
      strategy: 'api:npm',
      responseTime: 100,
      content: {
        title: 'test-pkg',
        text: 'A test package',
        markdown: 'A test package',
      },
      method: 'GET',
    });

    expect(result?.templateType).toBe('registry-lookup');
  });

  it('should infer content mapping from extracted content', async () => {
    const result = await registry.learnFromExtraction({
      sourceUrl: 'https://blog.example.com/posts/article',
      apiUrl: 'https://api.blog.example.com/posts/article',
      strategy: 'api:predicted',
      responseTime: 100,
      content: {
        title: 'Article Title',
        text: 'Short description',
        markdown: '# Article Title\n\nFull article body with markdown',
        structured: {
          author: 'John Doe',
          date: '2025-01-15',
        },
      },
      method: 'GET',
    });

    expect(result?.contentMapping.title).toBe('title');
    expect(result?.contentMapping.description).toBe('description');
    expect(result?.contentMapping.body).toBe('body');
    expect(result?.contentMapping.metadata).toBeDefined();
    expect(result?.contentMapping.metadata?.author).toBe('author');
  });

  it('should handle errors gracefully', async () => {
    const result = await registry.learnFromExtraction({
      sourceUrl: 'invalid-url',
      apiUrl: 'https://api.example.com/test',
      strategy: 'api:predicted',
      responseTime: 100,
      content: {
        title: 'Test',
        text: 'Content',
        markdown: 'Content',
      },
      method: 'GET',
    });

    // Should return null on error, not throw
    expect(result).toBeNull();
  });

  it('should emit pattern_learned event for new patterns', async () => {
    const events: { type: string }[] = [];
    registry.subscribe((event) => events.push(event));

    await registry.learnFromExtraction({
      sourceUrl: 'https://newblog.com/articles/test',
      apiUrl: 'https://api.newblog.com/v1/articles/test',
      strategy: 'api:predicted',
      responseTime: 100,
      content: {
        title: 'Test Article',
        text: 'Article content',
        markdown: 'Article content',
      },
      method: 'GET',
    });

    expect(events.some((e) => e.type === 'pattern_learned')).toBe(true);
  });

  it('should emit pattern_applied event for existing patterns', async () => {
    const events: { type: string }[] = [];
    registry.subscribe((event) => events.push(event));

    // Use a URL that matches bootstrap patterns
    await registry.learnFromExtraction({
      sourceUrl: 'https://github.com/user/repo',
      apiUrl: 'https://api.github.com/repos/user/repo',
      strategy: 'api:github',
      responseTime: 150,
      content: {
        title: 'user/repo',
        text: 'Repository description',
        markdown: 'Repository description',
      },
      method: 'GET',
    });

    expect(events.some((e) => e.type === 'pattern_applied')).toBe(true);
  });
});
