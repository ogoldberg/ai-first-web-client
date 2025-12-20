/**
 * Tests for Learning Provenance Metadata (CX-006)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createProvenance,
  recordVerification,
  recordUsage,
  recordDecay,
  isStale,
  getDaysSinceVerification,
  getProvenanceSummary,
  type ProvenanceMetadata,
  type PatternSource,
  type ConfidenceDecayReason,
} from '../../src/types/provenance.js';

describe('Provenance Metadata (CX-006)', () => {
  // Mock Date.now for consistent testing
  const NOW = 1734652800000; // 2024-12-19T00:00:00.000Z
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  describe('createProvenance', () => {
    it('should create provenance with required fields', () => {
      const provenance = createProvenance('bootstrap');

      expect(provenance.source).toBe('bootstrap');
      expect(provenance.learnedAt).toBe(NOW);
      expect(provenance.lastVerifiedAt).toBe(NOW);
      expect(provenance.lastUsedAt).toBe(NOW);
      expect(provenance.verificationCount).toBe(1);
      expect(provenance.decayHistory).toEqual([]);
    });

    it('should create provenance with optional fields', () => {
      const provenance = createProvenance('openapi_discovery', {
        sourceUrl: 'https://api.example.com/openapi.json',
        sourceDomain: 'example.com',
        createdBy: 'system',
        tags: ['openapi', 'auto-discovered'],
        sourceMetadata: { version: '3.0.0' },
      });

      expect(provenance.source).toBe('openapi_discovery');
      expect(provenance.sourceUrl).toBe('https://api.example.com/openapi.json');
      expect(provenance.sourceDomain).toBe('example.com');
      expect(provenance.createdBy).toBe('system');
      expect(provenance.tags).toEqual(['openapi', 'auto-discovered']);
      expect(provenance.sourceMetadata).toEqual({ version: '3.0.0' });
    });

    it('should support all pattern source types', () => {
      const sources: PatternSource[] = [
        'bootstrap',
        'api_extraction',
        'openapi_discovery',
        'graphql_introspection',
        'asyncapi_discovery',
        'alt_spec_discovery',
        'docs_page_detection',
        'link_discovery',
        'robots_sitemap',
        'backend_fingerprinting',
        'cross_site_transfer',
        'user_feedback',
        'manual',
        'unknown',
      ];

      for (const source of sources) {
        const provenance = createProvenance(source);
        expect(provenance.source).toBe(source);
      }
    });

    it('should create provenance with sourcePatternId for transfers', () => {
      const provenance = createProvenance('cross_site_transfer', {
        sourcePatternId: 'bootstrap:npm',
        sourceDomain: 'npmjs.com',
      });

      expect(provenance.sourcePatternId).toBe('bootstrap:npm');
      expect(provenance.sourceDomain).toBe('npmjs.com');
    });
  });

  describe('recordVerification', () => {
    it('should update verification timestamp and count', () => {
      const initialProvenance = createProvenance('api_extraction');

      // Advance time by 1 day
      vi.setSystemTime(NOW + ONE_DAY_MS);

      const updated = recordVerification(initialProvenance);

      expect(updated.lastVerifiedAt).toBe(NOW + ONE_DAY_MS);
      expect(updated.lastUsedAt).toBe(NOW + ONE_DAY_MS);
      expect(updated.verificationCount).toBe(2);
      // Original provenance should not be mutated
      expect(initialProvenance.verificationCount).toBe(1);
    });

    it('should preserve other fields', () => {
      const initial = createProvenance('bootstrap', {
        sourceUrl: 'test-url',
        tags: ['test'],
      });

      const updated = recordVerification(initial);

      expect(updated.source).toBe('bootstrap');
      expect(updated.sourceUrl).toBe('test-url');
      expect(updated.tags).toEqual(['test']);
      expect(updated.learnedAt).toBe(NOW);
    });
  });

  describe('recordUsage', () => {
    it('should update lastUsedAt without changing verification', () => {
      const initial = createProvenance('api_extraction');

      // Advance time
      vi.setSystemTime(NOW + ONE_DAY_MS);

      const updated = recordUsage(initial);

      expect(updated.lastUsedAt).toBe(NOW + ONE_DAY_MS);
      expect(updated.lastVerifiedAt).toBe(NOW); // Unchanged
      expect(updated.verificationCount).toBe(1); // Unchanged
    });
  });

  describe('recordDecay', () => {
    it('should add decay event to history', () => {
      const initial = createProvenance('api_extraction');

      const decayed = recordDecay(
        initial,
        'time_decay',
        'high',
        'medium',
        'Not verified for 21 days'
      );

      expect(decayed.decayHistory).toHaveLength(1);
      expect(decayed.decayHistory![0]).toMatchObject({
        reason: 'time_decay',
        previousConfidence: 'high',
        newConfidence: 'medium',
        details: 'Not verified for 21 days',
      });
    });

    it('should support numeric confidence values', () => {
      const initial = createProvenance('api_extraction');

      const decayed = recordDecay(initial, 'repeated_failures', 0.8, 0.5, 'Failed 3 times');

      expect(decayed.decayHistory![0].previousConfidence).toBe(0.8);
      expect(decayed.decayHistory![0].newConfidence).toBe(0.5);
    });

    it('should support all decay reasons', () => {
      const reasons: ConfidenceDecayReason[] = [
        'time_decay',
        'repeated_failures',
        'validation_failures',
        'site_structure_changed',
        'rate_limited',
        'auth_expired',
        'pattern_archived',
        'manual_downgrade',
      ];

      for (const reason of reasons) {
        const initial = createProvenance('api_extraction');
        const decayed = recordDecay(initial, reason, 'high', 'low');
        expect(decayed.decayHistory![0].reason).toBe(reason);
      }
    });

    it('should keep only the most recent 10 decay events', () => {
      let provenance = createProvenance('api_extraction');

      // Add 15 decay events
      for (let i = 0; i < 15; i++) {
        provenance = recordDecay(
          provenance,
          'time_decay',
          'high',
          'medium',
          `Event ${i}`
        );
      }

      expect(provenance.decayHistory).toHaveLength(10);
      // Most recent should be first
      expect(provenance.decayHistory![0].details).toBe('Event 14');
      expect(provenance.decayHistory![9].details).toBe('Event 5');
    });

    it('should not mutate original provenance', () => {
      const initial = createProvenance('api_extraction');

      recordDecay(initial, 'time_decay', 'high', 'medium');

      expect(initial.decayHistory).toEqual([]);
    });
  });

  describe('isStale', () => {
    it('should return true if never verified', () => {
      const provenance: ProvenanceMetadata = {
        source: 'api_extraction',
        learnedAt: NOW,
        verificationCount: 0,
      };

      expect(isStale(provenance)).toBe(true);
    });

    it('should return false if verified recently', () => {
      const provenance = createProvenance('api_extraction');

      expect(isStale(provenance)).toBe(false);
      expect(isStale(provenance, 14)).toBe(false);
    });

    it('should return true if verified too long ago', () => {
      const provenance = createProvenance('api_extraction');

      // Advance time by 15 days
      vi.setSystemTime(NOW + 15 * ONE_DAY_MS);

      expect(isStale(provenance, 14)).toBe(true);
      expect(isStale(provenance, 30)).toBe(false);
    });

    it('should use default 14 day threshold', () => {
      const provenance = createProvenance('api_extraction');

      // Advance time by 13 days - not stale
      vi.setSystemTime(NOW + 13 * ONE_DAY_MS);
      expect(isStale(provenance)).toBe(false);

      // Advance time by 15 days - stale
      vi.setSystemTime(NOW + 15 * ONE_DAY_MS);
      expect(isStale(provenance)).toBe(true);
    });
  });

  describe('getDaysSinceVerification', () => {
    it('should return Infinity if never verified', () => {
      const provenance: ProvenanceMetadata = {
        source: 'unknown',
        learnedAt: NOW,
        verificationCount: 0,
      };

      expect(getDaysSinceVerification(provenance)).toBe(Infinity);
    });

    it('should return 0 if verified today', () => {
      const provenance = createProvenance('api_extraction');

      expect(getDaysSinceVerification(provenance)).toBe(0);
    });

    it('should return correct number of days', () => {
      const provenance = createProvenance('api_extraction');

      // Advance time by 5 days
      vi.setSystemTime(NOW + 5 * ONE_DAY_MS);
      expect(getDaysSinceVerification(provenance)).toBe(5);

      // Advance time by 10 days total
      vi.setSystemTime(NOW + 10 * ONE_DAY_MS);
      expect(getDaysSinceVerification(provenance)).toBe(10);
    });
  });

  describe('getProvenanceSummary', () => {
    it('should describe source type', () => {
      const bootstrapProv = createProvenance('bootstrap');
      expect(getProvenanceSummary(bootstrapProv)).toContain('pre-seeded pattern');

      const apiProv = createProvenance('api_extraction');
      expect(getProvenanceSummary(apiProv)).toContain('learned from successful extraction');

      const openApiProv = createProvenance('openapi_discovery');
      expect(getProvenanceSummary(openApiProv)).toContain('discovered from OpenAPI spec');
    });

    it('should include source URL if present', () => {
      const provenance = createProvenance('openapi_discovery', {
        sourceUrl: 'https://api.example.com/openapi.json',
      });

      expect(getProvenanceSummary(provenance)).toContain('from https://api.example.com/openapi.json');
    });

    it('should describe age', () => {
      const provenance = createProvenance('api_extraction');

      expect(getProvenanceSummary(provenance)).toContain('learned today');

      // Advance by 1 day
      vi.setSystemTime(NOW + ONE_DAY_MS);
      expect(getProvenanceSummary(provenance)).toContain('learned yesterday');

      // Advance by 5 days
      vi.setSystemTime(NOW + 5 * ONE_DAY_MS);
      expect(getProvenanceSummary(provenance)).toContain('learned 5 days ago');
    });

    it('should describe verification status', () => {
      const provenance = createProvenance('api_extraction');

      expect(getProvenanceSummary(provenance)).toContain('verified today');

      // Advance time
      vi.setSystemTime(NOW + 3 * ONE_DAY_MS);
      expect(getProvenanceSummary(provenance)).toContain('last verified 3 days ago');
    });

    it('should mention recent decays', () => {
      let provenance = createProvenance('api_extraction');
      provenance = recordDecay(provenance, 'repeated_failures', 'high', 'medium');

      expect(getProvenanceSummary(provenance)).toContain('confidence reduced due to repeated failures');
    });

    it('should not mention old decays', () => {
      let provenance = createProvenance('api_extraction');
      provenance = recordDecay(provenance, 'time_decay', 'high', 'medium');

      // Advance by 10 days
      vi.setSystemTime(NOW + 10 * ONE_DAY_MS);

      expect(getProvenanceSummary(provenance)).not.toContain('confidence reduced');
    });
  });
});
