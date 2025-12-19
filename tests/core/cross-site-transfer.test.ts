/**
 * Tests for L-005: Cross-Site Pattern Transfer
 *
 * These tests verify that the ApiPatternRegistry can:
 * 1. Calculate site similarity scores
 * 2. Transfer patterns to similar sites with confidence decay
 * 3. Track success/failure of transferred patterns
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ApiPatternRegistry,
  API_DOMAIN_GROUPS,
} from '../../src/core/api-pattern-learner.js';

describe('Cross-Site Pattern Transfer (L-005)', () => {
  let registry: ApiPatternRegistry;

  beforeEach(async () => {
    vi.clearAllMocks();
    registry = new ApiPatternRegistry({
      filePath: '/tmp/test-patterns-transfer.json',
      autoPersist: false,
    });
    await registry.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Domain Groups', () => {
    it('should have pre-defined domain groups', () => {
      const groups = registry.getApiDomainGroups();
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.map(g => g.name)).toContain('package_registries');
      expect(groups.map(g => g.name)).toContain('code_hosting');
      expect(groups.map(g => g.name)).toContain('qa_forums');
    });

    it('should identify npm and pypi as package_registries', () => {
      const npmGroup = registry.getApiDomainGroup('npmjs.com');
      const pypiGroup = registry.getApiDomainGroup('pypi.org');

      expect(npmGroup).toBeDefined();
      expect(pypiGroup).toBeDefined();
      expect(npmGroup?.name).toBe('package_registries');
      expect(pypiGroup?.name).toBe('package_registries');
    });

    it('should identify github and gitlab as code_hosting', () => {
      const githubGroup = registry.getApiDomainGroup('github.com');
      const gitlabGroup = registry.getApiDomainGroup('gitlab.com');

      expect(githubGroup).toBeDefined();
      expect(gitlabGroup).toBeDefined();
      expect(githubGroup?.name).toBe('code_hosting');
      expect(gitlabGroup?.name).toBe('code_hosting');
    });

    it('should identify stackoverflow and stackexchange as qa_forums', () => {
      const soGroup = registry.getApiDomainGroup('stackoverflow.com');
      const seGroup = registry.getApiDomainGroup('stackexchange.com');

      expect(soGroup).toBeDefined();
      expect(seGroup).toBeDefined();
      expect(soGroup?.name).toBe('qa_forums');
      expect(seGroup?.name).toBe('qa_forums');
    });

    it('should return null for unknown domains', () => {
      const unknownGroup = registry.getApiDomainGroup('unknown-site.example.com');
      expect(unknownGroup).toBeNull();
    });

    it('should match subdomains to their parent domains', () => {
      const oldRedditGroup = registry.getApiDomainGroup('old.reddit.com');
      expect(oldRedditGroup).toBeDefined();
      expect(oldRedditGroup?.name).toBe('social_news');
    });
  });

  describe('Site Similarity Scoring', () => {
    it('should give high similarity to domains in the same group', async () => {
      // Get the NPM pattern
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/lodash');
      expect(npmPatterns.length).toBeGreaterThan(0);

      // Calculate similarity to rubygems (same group: package_registries)
      const similarity = registry.calculateSimilarity(npmPatterns[0].pattern, 'rubygems.org');

      expect(similarity.overall).toBeGreaterThanOrEqual(0.5);
      expect(similarity.domainGroup).toBe(1.0);
      expect(similarity.explanation).toContain('package_registries');
    });

    it('should give lower similarity to domains in different groups', async () => {
      // Get the GitHub pattern
      const githubPatterns = registry.findMatchingPatterns('https://github.com/user/repo');
      expect(githubPatterns.length).toBeGreaterThan(0);

      // Calculate similarity to dev.to (different group: developer_blogs)
      const similarity = registry.calculateSimilarity(githubPatterns[0].pattern, 'dev.to');

      // Should have some similarity (JSON format) but lower overall
      expect(similarity.domainGroup).toBeLessThan(1.0);
    });

    it('should consider template type compatibility', async () => {
      // Get the Reddit pattern (json-suffix template)
      const redditPatterns = registry.findMatchingPatterns('https://reddit.com/r/test');
      expect(redditPatterns.length).toBeGreaterThan(0);

      // Calculate similarity to lobste.rs (same group: social_news)
      const similarity = registry.calculateSimilarity(redditPatterns[0].pattern, 'lobste.rs');

      // lobste.rs is in social_news group which has json-suffix as a common type
      expect(similarity.templateType).toBeGreaterThan(0);
    });

    it('should have all component scores between 0 and 1', async () => {
      const patterns = registry.findMatchingPatterns('https://github.com/user/repo');
      if (patterns.length > 0) {
        const similarity = registry.calculateSimilarity(patterns[0].pattern, 'bitbucket.org');

        expect(similarity.overall).toBeGreaterThanOrEqual(0);
        expect(similarity.overall).toBeLessThanOrEqual(1);
        expect(similarity.urlStructure).toBeGreaterThanOrEqual(0);
        expect(similarity.urlStructure).toBeLessThanOrEqual(1);
        expect(similarity.responseFormat).toBeGreaterThanOrEqual(0);
        expect(similarity.responseFormat).toBeLessThanOrEqual(1);
        expect(similarity.templateType).toBeGreaterThanOrEqual(0);
        expect(similarity.templateType).toBeLessThanOrEqual(1);
        expect(similarity.domainGroup).toBeGreaterThanOrEqual(0);
        expect(similarity.domainGroup).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Finding Transferable Patterns', () => {
    it('should find transferable patterns for a new domain in the same group', async () => {
      // Look for patterns transferable to rubygems.org (package_registries group)
      const transferable = registry.findTransferablePatterns('rubygems.org');

      // Should find npm and/or pypi patterns
      expect(transferable.length).toBeGreaterThan(0);
      expect(transferable[0].similarity.overall).toBeGreaterThanOrEqual(0.3);
    });

    it('should not return patterns for a domain that already has patterns', async () => {
      // npmjs.com already has patterns
      const transferable = registry.findTransferablePatterns('npmjs.com');

      // Should be empty because npmjs.com has its own patterns
      expect(transferable.length).toBe(0);
    });

    it('should respect minimum similarity threshold', async () => {
      const transferable = registry.findTransferablePatterns('totally-new-site.example.com', {
        minSimilarity: 0.9, // Very high threshold
      });

      // Most patterns won't meet this threshold for an unknown domain
      expect(transferable.length).toBe(0);
    });

    it('should sort results by similarity (highest first)', async () => {
      const transferable = registry.findTransferablePatterns('crates.io', {
        minSimilarity: 0.1, // Low threshold to get multiple results
      });

      if (transferable.length > 1) {
        for (let i = 1; i < transferable.length; i++) {
          expect(transferable[i - 1].similarity.overall).toBeGreaterThanOrEqual(
            transferable[i].similarity.overall
          );
        }
      }
    });
  });

  describe('Pattern Transfer', () => {
    it('should transfer a pattern to a similar domain', async () => {
      // Get the npm pattern
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);
      const npmPatternId = npmPatterns[0].pattern.id;

      // Transfer to rubygems.org
      const result = await registry.transferPattern(
        npmPatternId,
        'rubygems.org',
        'rubygems\\.org.*/gems/[^/]+'
      );

      expect(result.success).toBe(true);
      expect(result.newPatternId).toBeDefined();
      expect(result.transferredPattern).toBeDefined();
      expect(result.transferredConfidence).toBeLessThan(npmPatterns[0].pattern.metrics.confidence);
    });

    it('should apply confidence decay to transferred patterns', async () => {
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);
      const originalConfidence = npmPatterns[0].pattern.metrics.confidence;

      const result = await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'packagist.org',
        'packagist\\.org.*/packages/[^/]+',
        { confidenceDecay: 0.5 }
      );

      expect(result.success).toBe(true);
      expect(result.transferredConfidence).toBeCloseTo(originalConfidence * 0.5, 2);
    });

    it('should fail to transfer if source pattern does not exist', async () => {
      const result = await registry.transferPattern(
        'nonexistent-pattern-id',
        'example.com',
        'example\\.com/.*'
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should fail to transfer if similarity is too low', async () => {
      const redditPatterns = registry.findMatchingPatterns('https://reddit.com/r/test');
      expect(redditPatterns.length).toBeGreaterThan(0);

      // Try to transfer Reddit pattern to a totally different type of site
      const result = await registry.transferPattern(
        redditPatterns[0].pattern.id,
        'unknown-enterprise-site.example.com',
        'unknown-enterprise-site\\.example\\.com/.*',
        { minSimilarity: 0.9 } // High threshold
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('below minimum');
    });

    it('should add transferred pattern to the registry', async () => {
      const initialStats = registry.getStats();

      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);

      await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'newpackagesite.example.com',
        'newpackagesite\\.example\\.com/package/[^/]+'
      );

      const finalStats = registry.getStats();
      expect(finalStats.totalPatterns).toBe(initialStats.totalPatterns + 1);
    });

    it('should emit pattern_learned event with transfer source', async () => {
      const events: Array<{ type: string; source?: string }> = [];
      registry.subscribe((event) => {
        events.push(event);
      });

      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);

      await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'transfertest.example.com',
        'transfertest\\.example\\.com/.*'
      );

      const learnedEvent = events.find(e => e.type === 'pattern_learned');
      expect(learnedEvent).toBeDefined();
      expect((learnedEvent as { source: string }).source).toBe('transfer');
    });
  });

  describe('Auto Transfer', () => {
    it('should automatically transfer patterns to a new similar domain', async () => {
      const results = await registry.autoTransferPatterns(
        'crates.io',
        'https://crates.io/crates/serde'
      );

      // Should find and transfer at least one pattern
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].success).toBe(true);
    });

    it('should generate appropriate URL patterns for the target domain', async () => {
      const results = await registry.autoTransferPatterns(
        'packagist.org',
        'https://packagist.org/packages/vendor/package-name'
      );

      if (results.length > 0 && results[0].success) {
        const pattern = results[0].transferredPattern;
        expect(pattern).toBeDefined();
        // Pattern should match packagist.org
        expect(pattern!.urlPatterns[0]).toContain('packagist');
      }
    });

    it('should stop after first successful transfer', async () => {
      const results = await registry.autoTransferPatterns(
        'rubygems.org',
        'https://rubygems.org/gems/rails'
      );

      // Even if multiple patterns could transfer, should stop after first success
      const successfulTransfers = results.filter(r => r.success);
      expect(successfulTransfers.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Transfer Outcome Tracking', () => {
    it('should boost confidence on successful transfer outcome', async () => {
      // First, transfer a pattern
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);

      const transferResult = await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'outcome-test.example.com',
        'outcome-test\\.example\\.com/.*'
      );

      expect(transferResult.success).toBe(true);
      const transferredPatternId = transferResult.newPatternId!;
      const initialConfidence = transferResult.transferredConfidence;

      // Record successful outcome
      await registry.recordTransferOutcome(
        transferredPatternId,
        true,
        'outcome-test.example.com',
        150
      );

      // Check that confidence increased
      const updatedPattern = registry.getPattern(transferredPatternId);
      expect(updatedPattern).toBeDefined();
      expect(updatedPattern!.metrics.confidence).toBeGreaterThan(initialConfidence);
    });

    it('should reduce confidence on failed transfer outcome', async () => {
      // First, transfer a pattern
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);

      const transferResult = await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'fail-test.example.com',
        'fail-test\\.example\\.com/.*'
      );

      expect(transferResult.success).toBe(true);
      const transferredPatternId = transferResult.newPatternId!;
      const initialConfidence = transferResult.transferredConfidence;

      // Record failed outcome
      await registry.recordTransferOutcome(
        transferredPatternId,
        false,
        'fail-test.example.com',
        100,
        'HTTP 404'
      );

      // Check that confidence decreased
      const updatedPattern = registry.getPattern(transferredPatternId);
      expect(updatedPattern).toBeDefined();
      expect(updatedPattern!.metrics.confidence).toBeLessThan(initialConfidence);
    });

    it('should track success/failure counts in metrics', async () => {
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);

      const transferResult = await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'metrics-test.example.com',
        'metrics-test\\.example\\.com/.*'
      );

      expect(transferResult.success).toBe(true);
      const patternId = transferResult.newPatternId!;

      // Initially should have 0 success/failure
      let pattern = registry.getPattern(patternId);
      expect(pattern!.metrics.successCount).toBe(0);
      expect(pattern!.metrics.failureCount).toBe(0);

      // Record success
      await registry.recordTransferOutcome(patternId, true, 'metrics-test.example.com', 100);
      pattern = registry.getPattern(patternId);
      expect(pattern!.metrics.successCount).toBe(1);

      // Record failure
      await registry.recordTransferOutcome(patternId, false, 'metrics-test.example.com', 100, 'test');
      pattern = registry.getPattern(patternId);
      expect(pattern!.metrics.failureCount).toBe(1);
    });
  });

  describe('URL Pattern Generation', () => {
    it('should generate patterns that match the target URL structure', async () => {
      const results = await registry.autoTransferPatterns(
        'crates.io',
        'https://crates.io/crates/tokio-runtime/1.2.3'
      );

      if (results.length > 0 && results[0].success) {
        const urlPattern = results[0].transferredPattern!.urlPatterns[0];
        // Should match crates.io domain and have some path structure
        expect(urlPattern).toContain('crates');
      }
    });

    it('should replace numeric IDs with wildcards', async () => {
      const results = await registry.autoTransferPatterns(
        'newsite.example.com',
        'https://newsite.example.com/items/12345/details'
      );

      if (results.length > 0 && results[0].success) {
        const urlPattern = results[0].transferredPattern!.urlPatterns[0];
        // Should have replaced 12345 with a wildcard
        expect(urlPattern).not.toContain('12345');
      }
    });
  });

  describe('Integration with Existing Patterns', () => {
    it('should not interfere with direct pattern matching', async () => {
      // Direct match should still work
      const npmMatches = registry.findMatchingPatterns('https://www.npmjs.com/package/lodash');
      expect(npmMatches.length).toBeGreaterThan(0);
      expect(npmMatches[0].pattern.id).toContain('npm');
    });

    it('should allow transferred patterns to be used for matching', async () => {
      // Transfer a pattern
      const npmPatterns = registry.findMatchingPatterns('https://www.npmjs.com/package/test');
      expect(npmPatterns.length).toBeGreaterThan(0);

      const transferResult = await registry.transferPattern(
        npmPatterns[0].pattern.id,
        'match-test.example.com',
        'match-test\\.example\\.com/package/[^/]+'
      );

      expect(transferResult.success).toBe(true);

      // Now the transferred pattern should match URLs on the new domain
      const matches = registry.findMatchingPatterns('https://match-test.example.com/package/test-pkg');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.id).toContain('transfer');
    });
  });
});
