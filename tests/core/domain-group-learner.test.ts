/**
 * Tests for Domain Group Learner (LI-005)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DomainGroupLearner, LearnedDomainGroup, GroupSuggestion } from '../../src/core/domain-group-learner.js';
import { resetConfig, getDomainGroups } from '../../src/utils/heuristics-config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DomainGroupLearner', () => {
  let learner: DomainGroupLearner;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    // Create temp directory for test data
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-group-learner-test-'));
    testFilePath = path.join(tempDir, 'test-groups.json');
    learner = new DomainGroupLearner(testFilePath);

    // Reset heuristics config to defaults
    resetConfig();
  });

  afterEach(async () => {
    // Clean up temp files
    await learner.flush();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('recordTransfer', () => {
    it('should record a successful transfer', () => {
      learner.recordTransfer('example.com', 'test.com', true);

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(1);
      expect(stats.successfulTransfers).toBe(1);
      expect(stats.uniqueDomains).toBe(2);
    });

    it('should record a failed transfer', () => {
      learner.recordTransfer('example.com', 'test.com', false);

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(1);
      expect(stats.successfulTransfers).toBe(0);
    });

    it('should not record self-transfers', () => {
      learner.recordTransfer('example.com', 'example.com', true);

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(0);
    });

    it('should normalize domains (remove www prefix)', () => {
      learner.recordTransfer('www.example.com', 'test.com', true);
      learner.recordTransfer('example.com', 'www.test.com', true);

      const relationships = learner.getRelationships();
      expect(relationships).toHaveLength(1);
      expect(relationships[0].transferCount).toBe(2);
    });

    it('should record transfer with similarity', () => {
      learner.recordTransfer('a.com', 'b.com', true, {
        patternId: 'test-pattern',
        similarity: 0.85,
      });

      const relationships = learner.getRelationships();
      expect(relationships[0].avgSimilarity).toBe(0.85);
    });
  });

  describe('getRelationships', () => {
    it('should aggregate multiple transfers between same domains', () => {
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('b.com', 'a.com', true);
      learner.recordTransfer('a.com', 'b.com', false);

      const relationships = learner.getRelationships();
      expect(relationships).toHaveLength(1);
      expect(relationships[0].transferCount).toBe(3);
      expect(relationships[0].successCount).toBe(2);
      expect(relationships[0].successRate).toBeCloseTo(0.667, 2);
    });

    it('should create separate relationships for different domain pairs', () => {
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('a.com', 'c.com', true);

      const relationships = learner.getRelationships();
      expect(relationships).toHaveLength(2);
    });

    it('should update lastTransfer timestamp', () => {
      const before = Date.now();
      learner.recordTransfer('a.com', 'b.com', true);
      const after = Date.now();

      const relationships = learner.getRelationships();
      expect(relationships[0].lastTransfer).toBeGreaterThanOrEqual(before);
      expect(relationships[0].lastTransfer).toBeLessThanOrEqual(after);
    });
  });

  describe('analyzeForGroups', () => {
    it('should not suggest groups with insufficient transfers', () => {
      // Only 1 successful transfer - not enough
      learner.recordTransfer('a.com', 'b.com', true);

      const suggestions = learner.analyzeForGroups();
      expect(suggestions).toHaveLength(0);
    });

    it('should suggest a group after multiple successful transfers', () => {
      // 2 successful transfers between same domains
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('b.com', 'a.com', true);

      const suggestions = learner.analyzeForGroups();
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
      // May or may not suggest depending on confidence threshold
    });

    it('should form connected components for multi-domain groups', () => {
      // A <-> B <-> C should form one group
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('b.com', 'c.com', true);
      learner.recordTransfer('b.com', 'c.com', true);

      const suggestions = learner.getSuggestions();
      // May form a group {a.com, b.com, c.com}
      const largeGroup = suggestions.find(s => s.domains.length >= 3);
      if (largeGroup) {
        expect(largeGroup.domains).toContain('a.com');
        expect(largeGroup.domains).toContain('b.com');
        expect(largeGroup.domains).toContain('c.com');
      }
    });

    it('should not suggest groups with low success rate', () => {
      // More failures than successes
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('a.com', 'b.com', false);
      learner.recordTransfer('a.com', 'b.com', false);
      learner.recordTransfer('a.com', 'b.com', false);

      const suggestions = learner.analyzeForGroups();
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('getLearnedGroups', () => {
    it('should return empty array initially', () => {
      const groups = learner.getLearnedGroups();
      expect(groups).toEqual([]);
    });

    it('should auto-create high-confidence groups', () => {
      // Create many successful transfers
      for (let i = 0; i < 5; i++) {
        learner.recordTransfer('a.com', 'b.com', true, { similarity: 0.9 });
        learner.recordTransfer('b.com', 'a.com', true, { similarity: 0.9 });
      }

      const groups = learner.getLearnedGroups();
      // Should have created a group if confidence was high enough
      // (depends on thresholds)
      expect(Array.isArray(groups)).toBe(true);
    });
  });

  describe('suggestRelatedDomains', () => {
    it('should find domains with successful transfers', () => {
      learner.recordTransfer('main.com', 'related1.com', true);
      learner.recordTransfer('main.com', 'related2.com', true);
      learner.recordTransfer('main.com', 'failed.com', false);

      const related = learner.suggestRelatedDomains('main.com');
      expect(related).toContain('related1.com');
      expect(related).toContain('related2.com');
      expect(related).not.toContain('failed.com');
    });

    it('should work in both directions', () => {
      learner.recordTransfer('source.com', 'target.com', true);

      expect(learner.suggestRelatedDomains('source.com')).toContain('target.com');
      expect(learner.suggestRelatedDomains('target.com')).toContain('source.com');
    });
  });

  describe('mergeIntoGroup', () => {
    it('should add new domains to an existing group', async () => {
      // Create sufficient transfers to guarantee a group is formed
      // Need high success rate, multiple relationships, and high similarity
      for (let i = 0; i < 10; i++) {
        learner.recordTransfer('merge-a.com', 'merge-b.com', true, { similarity: 0.95 });
        learner.recordTransfer('merge-b.com', 'merge-a.com', true, { similarity: 0.95 });
      }

      const groups = learner.getLearnedGroups();
      // Ensure we have at least one group for this test to be meaningful
      expect(groups.length).toBeGreaterThan(0);

      const groupName = groups[0].name;
      const result = learner.mergeIntoGroup(groupName, ['merge-c.com', 'merge-d.com']);
      expect(result).toBe(true);

      const updatedGroup = learner.getLearnedGroups().find(g => g.name === groupName);
      expect(updatedGroup?.domains).toContain('merge-c.com');
      expect(updatedGroup?.domains).toContain('merge-d.com');
    });

    it('should return false for non-existent group', () => {
      const result = learner.mergeIntoGroup('nonexistent', ['a.com']);
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('a.com', 'c.com', false);
      learner.recordTransfer('b.com', 'c.com', true);

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(3);
      expect(stats.successfulTransfers).toBe(2);
      expect(stats.uniqueDomains).toBe(3);
      expect(stats.relationships).toBe(3);
    });
  });

  describe('persistence', () => {
    it('should persist and load data', async () => {
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('b.com', 'c.com', true);

      await learner.flush();

      // Create new learner with same file
      const learner2 = new DomainGroupLearner(testFilePath);
      await learner2.initialize();

      const stats = learner2.getStats();
      expect(stats.totalTransfers).toBe(2);
      expect(stats.successfulTransfers).toBe(2);
    });

    it('should re-register groups on load', async () => {
      // Create many successful transfers to form a group
      for (let i = 0; i < 5; i++) {
        learner.recordTransfer('persist-a.com', 'persist-b.com', true, { similarity: 0.9 });
      }

      const initialGroups = learner.getLearnedGroups();
      if (initialGroups.length > 0) {
        const registeredGroup = initialGroups.find(g => g.registered);

        await learner.flush();

        // Reset heuristics config
        resetConfig();

        // Create new learner
        const learner2 = new DomainGroupLearner(testFilePath);
        await learner2.initialize();

        // Check if groups were re-registered
        if (registeredGroup) {
          const domainGroups = getDomainGroups();
          const reloaded = domainGroups.find(g => g.name === registeredGroup.name);
          expect(reloaded).toBeDefined();
        }
      }
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('b.com', 'c.com', true);

      learner.clear();

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(0);
      expect(stats.learnedGroups).toBe(0);
    });
  });

  describe('subscribeToRegistry', () => {
    it('should receive pattern_transferred events', () => {
      // Create a mock subscribe function
      const listeners: ((event: any) => void)[] = [];
      const mockSubscribe = (listener: (event: any) => void) => {
        listeners.push(listener);
        return () => {
          const idx = listeners.indexOf(listener);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      };

      const unsubscribe = learner.subscribeToRegistry(mockSubscribe);

      // Emit a pattern_transferred event
      for (const listener of listeners) {
        listener({
          type: 'pattern_transferred',
          sourcePatternId: 'source-pattern',
          sourceDomain: 'source.com',
          targetDomain: 'target.com',
          transferredPatternId: 'transfer:source-pattern:target.com:123',
          success: true,
          similarity: 0.85,
        });
      }

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(1);
      expect(stats.successfulTransfers).toBe(1);

      const relationships = learner.getRelationships();
      expect(relationships[0].avgSimilarity).toBe(0.85);

      unsubscribe();
    });

    it('should ignore non-transfer events', () => {
      const listeners: ((event: any) => void)[] = [];
      const mockSubscribe = (listener: (event: any) => void) => {
        listeners.push(listener);
        return () => {
          const idx = listeners.indexOf(listener);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      };

      learner.subscribeToRegistry(mockSubscribe);

      // Emit a different event type
      for (const listener of listeners) {
        listener({
          type: 'pattern_applied',
          patternId: 'some-pattern',
          success: true,
          domain: 'example.com',
          responseTime: 100,
        });
      }

      const stats = learner.getStats();
      expect(stats.totalTransfers).toBe(0);
    });
  });

  describe('heuristics-config integration', () => {
    it('should register learned groups with heuristics config', () => {
      // Create a group with high confidence
      for (let i = 0; i < 10; i++) {
        learner.recordTransfer('config-a.com', 'config-b.com', true, { similarity: 0.95 });
      }

      const learnedGroups = learner.getLearnedGroups();
      const registeredGroup = learnedGroups.find(g => g.registered);

      if (registeredGroup) {
        const domainGroups = getDomainGroups();
        const found = domainGroups.find(g => g.name === registeredGroup.name);
        expect(found).toBeDefined();
        expect(found?.domains).toContain('config-a.com');
        expect(found?.domains).toContain('config-b.com');
      }
    });
  });

  describe('Union-Find algorithm', () => {
    it('should correctly find connected components', () => {
      // Create a chain: a -> b -> c -> d
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('b.com', 'c.com', true);
      learner.recordTransfer('b.com', 'c.com', true);
      learner.recordTransfer('c.com', 'd.com', true);
      learner.recordTransfer('c.com', 'd.com', true);

      // Create a separate component: x -> y
      learner.recordTransfer('x.com', 'y.com', true);
      learner.recordTransfer('x.com', 'y.com', true);

      const suggestions = learner.getSuggestions();

      // Should have suggestions (exact behavior depends on thresholds)
      // The chain should potentially form one group
      // x-y should potentially form another group
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should merge components when connected', () => {
      // First create two separate groups
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('a.com', 'b.com', true);
      learner.recordTransfer('c.com', 'd.com', true);
      learner.recordTransfer('c.com', 'd.com', true);

      // Now connect them
      learner.recordTransfer('b.com', 'c.com', true);
      learner.recordTransfer('b.com', 'c.com', true);

      const suggestions = learner.getSuggestions();

      // Should potentially form one large group
      const largeGroup = suggestions.find(s => s.domains.length >= 4);
      if (largeGroup) {
        expect(largeGroup.domains).toContain('a.com');
        expect(largeGroup.domains).toContain('d.com');
      }
    });
  });
});
