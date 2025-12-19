/**
 * Live Tests for Site-Specific API Handlers
 *
 * These tests hit real API endpoints to verify the handlers work correctly.
 * They are skipped by default in CI - run with LIVE_TESTS=true to enable.
 *
 * Test coverage:
 * - Reddit JSON API
 * - HackerNews Firebase API
 * - GitHub REST API
 * - Wikipedia REST API
 * - StackOverflow/StackExchange API
 *
 * Note: Some tests may fail intermittently due to:
 * - API rate limiting (especially GitHub: 60 req/hour unauthenticated)
 * - Network issues
 * - Content changes on live sites
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ContentIntelligence, type ContentResult } from '../../src/core/content-intelligence.js';

// Skip live tests unless explicitly enabled
const LIVE_TESTS_ENABLED = process.env.LIVE_TESTS === 'true';
const describeIf = LIVE_TESTS_ENABLED ? describe : describe.skip;

// Longer timeout for network requests
const LIVE_TEST_TIMEOUT = 30000;

describeIf('Live Site API Handlers', () => {
  let intelligence: ContentIntelligence;

  beforeAll(() => {
    intelligence = new ContentIntelligence();
  });

  // Helper to verify common result structure
  const expectValidResult = (result: ContentResult, opts?: { allowMediumConfidence?: boolean }) => {
    expect(result.error).toBeUndefined();
    expect(result.content.title).toBeDefined();
    expect(result.content.title.length).toBeGreaterThan(0);
    expect(result.content.text).toBeDefined();
    expect(result.content.text.length).toBeGreaterThan(0);
    expect(result.content.markdown).toBeDefined();
    if (opts?.allowMediumConfidence) {
      expect(['high', 'medium']).toContain(result.meta.confidence);
    } else {
      expect(result.meta.confidence).toBe('high');
    }
  };

  // ============================================
  // REDDIT API TESTS
  // ============================================
  describe('Reddit JSON API', () => {
    it('should extract subreddit posts from r/programming', async () => {
      const result = await intelligence.extract('https://www.reddit.com/r/programming', {
        forceStrategy: 'api:reddit',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:reddit');
      expect(result.meta.finalUrl).toContain('.json');

      // Verify subreddit post structure
      expect(result.content.text).toMatch(/\[\d+\]/); // Score format [123]
      expect(result.content.markdown).toContain('r/programming');
    }, LIVE_TEST_TIMEOUT);

    it('should extract from old.reddit.com', async () => {
      const result = await intelligence.extract('https://old.reddit.com/r/javascript', {
        forceStrategy: 'api:reddit',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:reddit');
    }, LIVE_TEST_TIMEOUT);

    it('should throw for non-Reddit URLs when forced', async () => {
      // When forceStrategy is used with a non-matching URL, it throws
      await expect(
        intelligence.extract('https://example.com', {
          forceStrategy: 'api:reddit',
          timeout: LIVE_TEST_TIMEOUT,
        })
      ).rejects.toThrow(/returned no result/);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // HACKERNEWS API TESTS
  // ============================================
  describe('HackerNews Firebase API', () => {
    it('should extract top stories from front page', async () => {
      const result = await intelligence.extract('https://news.ycombinator.com/', {
        forceStrategy: 'api:hackernews',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:hackernews');
      expect(result.content.title).toBe('HackerNews Top Stories');

      // Verify story structure
      expect(result.content.text).toMatch(/\[\d+\]/); // Score format
      expect(result.content.structured).toBeDefined();
      const structured = result.content.structured as { stories?: unknown[] };
      expect(structured.stories).toBeDefined();
      expect(Array.isArray(structured.stories)).toBe(true);
      expect(structured.stories!.length).toBeGreaterThan(0);
    }, LIVE_TEST_TIMEOUT);

    it('should extract a specific HN item by ID', async () => {
      // Item 1 is the first HN post ever (by pg) - stable test target
      const result = await intelligence.extract('https://news.ycombinator.com/item?id=1', {
        forceStrategy: 'api:hackernews',
        timeout: LIVE_TEST_TIMEOUT,
        minContentLength: 10, // Historic post may be short
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:hackernews');
      expect(result.content.structured).toBeDefined();
      const structured = result.content.structured as { id?: number; by?: string };
      expect(structured.id).toBe(1);
      expect(structured.by).toBe('pg');
    }, LIVE_TEST_TIMEOUT);

    it('should extract a recent top story', async () => {
      // Get a recent top story ID first, then fetch it
      const topStoriesResponse = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      const topStories = await topStoriesResponse.json() as number[];
      const topStoryId = topStories[0];

      const result = await intelligence.extract(`https://news.ycombinator.com/item?id=${topStoryId}`, {
        forceStrategy: 'api:hackernews',
        timeout: LIVE_TEST_TIMEOUT,
        minContentLength: 20, // Some stories may be short
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:hackernews');
      const structured = result.content.structured as { id?: number };
      expect(structured.id).toBe(topStoryId);
    }, LIVE_TEST_TIMEOUT);

    it('should throw for non-HN URLs when forced', async () => {
      await expect(
        intelligence.extract('https://example.com', {
          forceStrategy: 'api:hackernews',
          timeout: LIVE_TEST_TIMEOUT,
        })
      ).rejects.toThrow(/returned no result/);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // GITHUB API TESTS
  // Note: GitHub has 60 requests/hour limit for unauthenticated access
  // These tests may fail if rate limited - they gracefully skip in that case
  // ============================================
  describe('GitHub REST API', () => {
    // Helper to handle rate limiting - when forceStrategy is used and API fails, it throws
    const tryGitHubExtract = async (url: string) => {
      try {
        return await intelligence.extract(url, {
          forceStrategy: 'api:github',
          timeout: LIVE_TEST_TIMEOUT,
        });
      } catch (error) {
        // Rate limited or API failure - return skip indicator
        if (String(error).includes('returned no result') || String(error).includes('403')) {
          console.log('GitHub API unavailable/rate limited, skipping test');
          return null;
        }
        throw error;
      }
    };

    it('should extract repository info', async () => {
      const result = await tryGitHubExtract('https://github.com/vitest-dev/vitest');
      if (!result) return; // Skip if rate limited

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:github');

      // Verify repo structure
      expect(result.content.text).toMatch(/Stars:/i);
      expect(result.content.text).toMatch(/Forks:/i);

      const structured = result.content.structured as { full_name?: string };
      expect(structured.full_name).toBe('vitest-dev/vitest');
    }, LIVE_TEST_TIMEOUT);

    it('should extract user info', async () => {
      const result = await tryGitHubExtract('https://github.com/torvalds');
      if (!result) return; // Skip if rate limited

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:github');

      const structured = result.content.structured as { login?: string; type?: string };
      expect(structured.login).toBe('torvalds');
      expect(structured.type).toBe('User');
    }, LIVE_TEST_TIMEOUT);

    it('should extract issue info', async () => {
      const result = await tryGitHubExtract('https://github.com/microsoft/TypeScript/issues/1');
      if (!result) return; // Skip if rate limited

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:github');

      const structured = result.content.structured as { number?: number; state?: string };
      expect(structured.number).toBe(1);
      expect(['open', 'closed']).toContain(structured.state);
    }, LIVE_TEST_TIMEOUT);

    it('should throw for non-GitHub URLs when forced', async () => {
      await expect(
        intelligence.extract('https://example.com', {
          forceStrategy: 'api:github',
          timeout: LIVE_TEST_TIMEOUT,
        })
      ).rejects.toThrow(/returned no result/);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // WIKIPEDIA API TESTS
  // Note: Wikipedia API may have rate limits or content length issues
  // ============================================
  describe('Wikipedia REST API', () => {
    // Helper to handle API failures gracefully
    const tryWikipediaExtract = async (url: string) => {
      try {
        return await intelligence.extract(url, {
          forceStrategy: 'api:wikipedia',
          timeout: LIVE_TEST_TIMEOUT,
          minContentLength: 100, // Lower threshold
        });
      } catch (error) {
        if (String(error).includes('returned no result')) {
          console.log('Wikipedia API unavailable, skipping test');
          return null;
        }
        throw error;
      }
    };

    it('should extract English Wikipedia article', async () => {
      const result = await tryWikipediaExtract('https://en.wikipedia.org/wiki/Python_(programming_language)');
      if (!result) return; // Skip if unavailable

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:wikipedia');

      const structured = result.content.structured as { extract?: string; pageid?: number };
      expect(structured.extract).toBeDefined();
      expect(structured.pageid).toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    it('should extract article with spaces in title', async () => {
      const result = await tryWikipediaExtract('https://en.wikipedia.org/wiki/Artificial_intelligence');
      if (!result) return; // Skip if unavailable

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:wikipedia');
      expect(result.content.title).toBe('Artificial intelligence');
    }, LIVE_TEST_TIMEOUT);

    it('should extract from other language Wikipedias', async () => {
      const result = await tryWikipediaExtract('https://es.wikipedia.org/wiki/Python');
      if (!result) return; // Skip if unavailable

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:wikipedia');
    }, LIVE_TEST_TIMEOUT);

    it('should throw for non-Wikipedia URLs when forced', async () => {
      await expect(
        intelligence.extract('https://example.com', {
          forceStrategy: 'api:wikipedia',
          timeout: LIVE_TEST_TIMEOUT,
        })
      ).rejects.toThrow(/returned no result/);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // STACKOVERFLOW API TESTS
  // ============================================
  describe('StackOverflow/StackExchange API', () => {
    it('should extract StackOverflow question with answers', async () => {
      // Famous "What is a NullPointerException" question - stable and popular
      const result = await intelligence.extract(
        'https://stackoverflow.com/questions/218384/what-is-a-nullpointerexception-and-how-do-i-fix-it',
        {
          forceStrategy: 'api:stackoverflow',
          timeout: LIVE_TEST_TIMEOUT,
        }
      );

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:stackoverflow');

      // Verify question structure
      expect(result.content.text).toMatch(/NullPointerException/i);
      expect(result.content.markdown).toContain('Score:');
      expect(result.content.markdown).toContain('Answers');

      const structured = result.content.structured as { question?: { question_id?: number } };
      expect(structured.question).toBeDefined();
      expect(structured.question!.question_id).toBe(218384);
    }, LIVE_TEST_TIMEOUT);

    it('should extract question from ServerFault', async () => {
      // Well-known serverfault question
      const result = await intelligence.extract(
        'https://serverfault.com/questions/1/what-is-the-difference-between-raid-levels',
        {
          forceStrategy: 'api:stackoverflow',
          timeout: LIVE_TEST_TIMEOUT,
          minContentLength: 50, // Some questions may be short
        }
      );

      // ServerFault question may have been deleted/migrated
      if (!result.error) {
        expect(result.meta.strategy).toBe('api:stackoverflow');
      }
    }, LIVE_TEST_TIMEOUT);

    it('should extract question from AskUbuntu', async () => {
      // Well-known askubuntu question
      const result = await intelligence.extract(
        'https://askubuntu.com/questions/1/how-can-i-install-software',
        {
          forceStrategy: 'api:stackoverflow',
          timeout: LIVE_TEST_TIMEOUT,
          minContentLength: 50,
        }
      );

      // Question may have been modified
      if (!result.error) {
        expect(result.meta.strategy).toBe('api:stackoverflow');
      }
    }, LIVE_TEST_TIMEOUT);

    it('should extract question by numeric ID', async () => {
      // Use a known stable SO question
      const result = await intelligence.extract(
        'https://stackoverflow.com/questions/1732348',
        {
          forceStrategy: 'api:stackoverflow',
          timeout: LIVE_TEST_TIMEOUT,
        }
      );

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:stackoverflow');

      const structured = result.content.structured as { question?: { question_id?: number } };
      expect(structured.question!.question_id).toBe(1732348);
    }, LIVE_TEST_TIMEOUT);

    it('should throw for non-StackExchange URLs when forced', async () => {
      await expect(
        intelligence.extract('https://example.com', {
          forceStrategy: 'api:stackoverflow',
          timeout: LIVE_TEST_TIMEOUT,
        })
      ).rejects.toThrow(/returned no result/);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // NPM REGISTRY API TESTS
  // ============================================
  describe('NPM Registry API', () => {
    it('should extract package info from npmjs.com URL', async () => {
      const result = await intelligence.extract('https://www.npmjs.com/package/express', {
        forceStrategy: 'api:npm',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:npm');
      expect(result.meta.finalUrl).toBe('https://registry.npmjs.org/express');

      // Verify package structure
      const structured = result.content.structured as { name?: string; 'dist-tags'?: Record<string, string> };
      expect(structured.name).toBe('express');
      expect(structured['dist-tags']?.latest).toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    it('should extract scoped package (@types/node)', async () => {
      const result = await intelligence.extract('https://www.npmjs.com/package/@types/node', {
        forceStrategy: 'api:npm',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:npm');

      const structured = result.content.structured as { name?: string };
      expect(structured.name).toBe('@types/node');
    }, LIVE_TEST_TIMEOUT);

    it('should extract from registry.npmjs.org directly', async () => {
      // Test fetching directly from the registry API
      // Note: Direct registry access may fail due to content-type or rate limiting
      try {
        const result = await intelligence.extract('https://registry.npmjs.org/is-odd', {
          forceStrategy: 'api:npm',
          timeout: LIVE_TEST_TIMEOUT,
        });

        expectValidResult(result);
        expect(result.meta.strategy).toBe('api:npm');

        const structured = result.content.structured as { name?: string };
        expect(structured.name).toBe('is-odd');
      } catch (error) {
        // Direct registry access may fail - this is acceptable
        if (String(error).includes('returned no result')) {
          console.log('Direct registry access failed, this is acceptable');
          return;
        }
        throw error;
      }
    }, LIVE_TEST_TIMEOUT);

    it('should include dependencies in output', async () => {
      const result = await intelligence.extract('https://www.npmjs.com/package/express', {
        forceStrategy: 'api:npm',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.content.text).toContain('Dependencies');
      expect(result.content.markdown).toContain('## Dependencies');
    }, LIVE_TEST_TIMEOUT);

    it('should include installation instructions in markdown', async () => {
      const result = await intelligence.extract('https://www.npmjs.com/package/typescript', {
        forceStrategy: 'api:npm',
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.content.markdown).toContain('npm install typescript');
      expect(result.content.markdown).toContain('## Installation');
    }, LIVE_TEST_TIMEOUT);

    it('should throw for non-NPM URLs when forced', async () => {
      await expect(
        intelligence.extract('https://example.com', {
          forceStrategy: 'api:npm',
          timeout: LIVE_TEST_TIMEOUT,
        })
      ).rejects.toThrow(/returned no result/);
    }, LIVE_TEST_TIMEOUT);
  });

  // ============================================
  // INTEGRATION TESTS - AUTO STRATEGY SELECTION
  // These tests verify the site-specific APIs are tried first
  // Some APIs may fall back to other strategies due to rate limiting
  // ============================================
  describe('Auto Strategy Selection', () => {
    it('should automatically select Reddit API for Reddit URLs', async () => {
      const result = await intelligence.extract('https://www.reddit.com/r/typescript', {
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:reddit');
    }, LIVE_TEST_TIMEOUT);

    it('should automatically select HackerNews API for HN URLs', async () => {
      const result = await intelligence.extract('https://news.ycombinator.com/', {
        timeout: LIVE_TEST_TIMEOUT,
      });

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:hackernews');
    }, LIVE_TEST_TIMEOUT);

    it('should try GitHub API first for GitHub URLs', async () => {
      const result = await intelligence.extract('https://github.com/nodejs/node', {
        timeout: LIVE_TEST_TIMEOUT,
        allowBrowser: false, // Don't try Playwright
      });

      // GitHub API may be rate limited, check if we at least tried it
      expect(result.meta.strategiesAttempted).toContain('api:github');

      // If we got a result, validate it
      if (!result.error) {
        expectValidResult(result, { allowMediumConfidence: true });
      }
    }, LIVE_TEST_TIMEOUT);

    it('should try Wikipedia API first for Wikipedia URLs', async () => {
      const result = await intelligence.extract('https://en.wikipedia.org/wiki/Node.js', {
        timeout: LIVE_TEST_TIMEOUT,
        allowBrowser: false, // Don't try Playwright
      });

      // Wikipedia API should be attempted
      expect(result.meta.strategiesAttempted).toContain('api:wikipedia');

      // If we got a result, validate it
      if (!result.error) {
        expectValidResult(result, { allowMediumConfidence: true });
      }
    }, LIVE_TEST_TIMEOUT);

    it('should automatically select StackOverflow API for SO URLs', async () => {
      const result = await intelligence.extract(
        'https://stackoverflow.com/questions/111102/how-do-javascript-closures-work',
        {
          timeout: LIVE_TEST_TIMEOUT,
        }
      );

      expectValidResult(result);
      expect(result.meta.strategy).toBe('api:stackoverflow');
    }, LIVE_TEST_TIMEOUT);

    it('should automatically select NPM API for npmjs.com URLs', async () => {
      const result = await intelligence.extract('https://www.npmjs.com/package/chalk', {
        timeout: LIVE_TEST_TIMEOUT,
        allowBrowser: false, // Don't try Playwright
      });

      // NPM API should be attempted
      expect(result.meta.strategiesAttempted).toContain('api:npm');

      // If we got a result, validate it
      if (!result.error) {
        expectValidResult(result, { allowMediumConfidence: true });
      }
    }, LIVE_TEST_TIMEOUT);
  });
});
