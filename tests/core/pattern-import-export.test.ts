/**
 * Tests for pattern import/export functionality (F-007)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LearningEngine } from '../../src/core/learning-engine.js';
import type {
  EnhancedKnowledgeBaseEntry,
  KnowledgePack,
  KnowledgeExportOptions,
  KnowledgeImportOptions,
} from '../../src/types/index.js';

describe('Pattern Import/Export (F-007)', () => {
  let engine: LearningEngine;
  let tempDir: string;

  // Helper to create a test entry
  function createTestEntry(
    domain: string,
    options: Partial<EnhancedKnowledgeBaseEntry> = {}
  ): EnhancedKnowledgeBaseEntry {
    return {
      domain,
      apiPatterns: options.apiPatterns || [
        {
          endpoint: `https://${domain}/api/data`,
          method: 'GET',
          confidence: 'high',
          canBypass: true,
          createdAt: Date.now(),
          lastVerified: Date.now(),
          verificationCount: 1,
          failureCount: 0,
        },
      ],
      selectorChains: options.selectorChains || [
        {
          contentType: 'main_content',
          selectors: [
            {
              selector: 'main',
              contentType: 'main_content',
              priority: 1,
              successCount: 5,
              failureCount: 0,
            },
          ],
          domain,
        },
      ],
      refreshPatterns: options.refreshPatterns || [],
      validators: options.validators || [],
      paginationPatterns: options.paginationPatterns || {},
      recentFailures: [],
      lastUsed: Date.now(),
      usageCount: options.usageCount ?? 10,
      overallSuccessRate: options.overallSuccessRate ?? 0.9,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
  }

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pattern-import-export-test-')
    );
    engine = new LearningEngine(path.join(tempDir, 'knowledge-base.json'));
    await engine.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('exportKnowledgePack', () => {
    it('should export all entries when no filters specified', async () => {
      // Add test entries
      engine.learnApiPattern('example.com', {
        endpoint: 'https://example.com/api/users',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });
      engine.learnApiPattern('test.org', {
        endpoint: 'https://test.org/api/items',
        method: 'GET',
        confidence: 'medium',
        canBypass: true,
      });

      const pack = engine.exportKnowledgePack();

      expect(pack.metadata).toBeDefined();
      expect(pack.metadata.id).toMatch(/^kp_/);
      expect(pack.metadata.version).toBe('1.0.0');
      expect(pack.metadata.compatibility.schemaVersion).toBe('1.0');
      expect(pack.entries).toBeDefined();
      expect(Object.keys(pack.entries).length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by domain patterns', async () => {
      engine.learnApiPattern('example.com', {
        endpoint: 'https://example.com/api/users',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });
      engine.learnApiPattern('test.org', {
        endpoint: 'https://test.org/api/items',
        method: 'GET',
        confidence: 'medium',
        canBypass: true,
      });
      engine.learnApiPattern('api.example.com', {
        endpoint: 'https://api.example.com/v1/data',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const pack = engine.exportKnowledgePack({
        domainPatterns: ['*.example.com', 'example.com'],
      });

      expect(pack.metadata.domains).toContain('example.com');
      // api.example.com should match *.example.com
      const domains = Object.keys(pack.entries);
      expect(domains.some(d => d.includes('example.com'))).toBe(true);
      expect(domains).not.toContain('test.org');
    });

    it('should filter by minimum usage count', async () => {
      engine.learnApiPattern('highuse.com', {
        endpoint: 'https://highuse.com/api',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      // Simulate usage
      const entry = engine.getEntry('highuse.com');
      if (entry) {
        entry.usageCount = 100;
      }

      engine.learnApiPattern('lowuse.com', {
        endpoint: 'https://lowuse.com/api',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const pack = engine.exportKnowledgePack({
        minUsageCount: 50,
      });

      expect(Object.keys(pack.entries)).toContain('highuse.com');
      expect(Object.keys(pack.entries)).not.toContain('lowuse.com');
    });

    it('should include anti-patterns when requested', async () => {
      const pack = engine.exportKnowledgePack({
        includeAntiPatterns: true,
      });

      expect(pack.antiPatterns).toBeDefined();
      expect(Array.isArray(pack.antiPatterns)).toBe(true);
    });

    it('should exclude anti-patterns when not requested', async () => {
      const pack = engine.exportKnowledgePack({
        includeAntiPatterns: false,
      });

      expect(pack.antiPatterns).toBeUndefined();
    });

    it('should include learning events when requested', async () => {
      engine.learnApiPattern('events.com', {
        endpoint: 'https://events.com/api',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const pack = engine.exportKnowledgePack({
        includeLearningEvents: true,
      });

      expect(pack.learningEvents).toBeDefined();
      expect(Array.isArray(pack.learningEvents)).toBe(true);
    });

    it('should use custom pack name and description', () => {
      const pack = engine.exportKnowledgePack({
        packName: 'My Custom Pack',
        packDescription: 'Test pack for unit tests',
      });

      expect(pack.metadata.name).toBe('My Custom Pack');
      expect(pack.metadata.description).toBe('Test pack for unit tests');
    });
  });

  describe('serializeKnowledgePack', () => {
    it('should serialize to valid JSON', () => {
      const pack = engine.exportKnowledgePack();
      const json = engine.serializeKnowledgePack(pack);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.entries).toBeDefined();
    });

    it('should serialize with pretty printing by default', () => {
      const pack = engine.exportKnowledgePack();
      const json = engine.serializeKnowledgePack(pack);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should serialize without pretty printing when specified', () => {
      const pack = engine.exportKnowledgePack();
      const json = engine.serializeKnowledgePack(pack, false);

      expect(json).not.toContain('\n  ');
    });
  });

  describe('importKnowledgePack', () => {
    it('should import entries into empty knowledge base', async () => {
      // Create a pack with test data
      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_1',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['imported.com'],
          stats: {
            domainCount: 1,
            apiPatternCount: 1,
            selectorCount: 1,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'imported.com': createTestEntry('imported.com'),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack));

      expect(result.success).toBe(true);
      expect(result.domainsImported).toBe(1);
      expect(result.errors).toHaveLength(0);

      const entry = engine.getEntry('imported.com');
      expect(entry).toBeDefined();
      expect(entry?.apiPatterns.length).toBeGreaterThan(0);
    });

    it('should handle invalid JSON', async () => {
      const result = await engine.importKnowledgePack('not valid json');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should handle missing metadata', async () => {
      const result = await engine.importKnowledgePack(
        JSON.stringify({ entries: {} })
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('missing metadata');
    });

    it('should skip existing domains with skip resolution', async () => {
      // Add an existing entry
      engine.learnApiPattern('existing.com', {
        endpoint: 'https://existing.com/api/original',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_2',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['existing.com'],
          stats: {
            domainCount: 1,
            apiPatternCount: 1,
            selectorCount: 0,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'existing.com': createTestEntry('existing.com', {
            apiPatterns: [
              {
                endpoint: 'https://existing.com/api/new',
                method: 'GET',
                confidence: 'medium',
                canBypass: true,
                createdAt: Date.now(),
                lastVerified: Date.now(),
                verificationCount: 1,
                failureCount: 0,
              },
            ],
          }),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack), {
        conflictResolution: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.domainsSkipped).toBe(1);
      expect(result.domainsImported).toBe(0);

      // Original entry should be unchanged
      const entry = engine.getEntry('existing.com');
      expect(entry?.apiPatterns[0].endpoint).toBe(
        'https://existing.com/api/original'
      );
    });

    it('should overwrite existing domains with overwrite resolution', async () => {
      engine.learnApiPattern('existing.com', {
        endpoint: 'https://existing.com/api/original',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_3',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['existing.com'],
          stats: {
            domainCount: 1,
            apiPatternCount: 1,
            selectorCount: 0,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'existing.com': createTestEntry('existing.com', {
            apiPatterns: [
              {
                endpoint: 'https://existing.com/api/new',
                method: 'POST',
                confidence: 'medium',
                canBypass: false,
                createdAt: Date.now(),
                lastVerified: Date.now(),
                verificationCount: 1,
                failureCount: 0,
              },
            ],
          }),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack), {
        conflictResolution: 'overwrite',
      });

      expect(result.success).toBe(true);
      expect(result.domainsImported).toBe(1);

      const entry = engine.getEntry('existing.com');
      expect(entry?.apiPatterns[0].endpoint).toBe(
        'https://existing.com/api/new'
      );
      expect(entry?.apiPatterns[0].method).toBe('POST');
    });

    it('should merge patterns with merge resolution', async () => {
      engine.learnApiPattern('merge.com', {
        endpoint: 'https://merge.com/api/original',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_4',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['merge.com'],
          stats: {
            domainCount: 1,
            apiPatternCount: 1,
            selectorCount: 0,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'merge.com': createTestEntry('merge.com', {
            apiPatterns: [
              {
                endpoint: 'https://merge.com/api/new',
                method: 'POST',
                confidence: 'medium',
                canBypass: false,
                createdAt: Date.now(),
                lastVerified: Date.now(),
                verificationCount: 1,
                failureCount: 0,
              },
            ],
          }),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack), {
        conflictResolution: 'merge',
      });

      expect(result.success).toBe(true);
      expect(result.domainsMerged).toBe(1);

      const entry = engine.getEntry('merge.com');
      // Should have both patterns
      expect(entry?.apiPatterns.length).toBe(2);
      const endpoints = entry?.apiPatterns.map(p => p.endpoint);
      expect(endpoints).toContain('https://merge.com/api/original');
      expect(endpoints).toContain('https://merge.com/api/new');
    });

    it('should filter by domain', async () => {
      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_5',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['wanted.com', 'unwanted.com'],
          stats: {
            domainCount: 2,
            apiPatternCount: 2,
            selectorCount: 0,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'wanted.com': createTestEntry('wanted.com'),
          'unwanted.com': createTestEntry('unwanted.com'),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack), {
        domainFilter: ['wanted.com'],
      });

      expect(result.success).toBe(true);
      expect(result.domainsImported).toBe(1);
      expect(result.domainsSkipped).toBe(1);

      expect(engine.getEntry('wanted.com')).toBeDefined();
      expect(engine.getEntry('unwanted.com')).toBeFalsy();
    });

    it('should reset metrics when requested', async () => {
      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_6',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['metrics.com'],
          stats: {
            domainCount: 1,
            apiPatternCount: 1,
            selectorCount: 0,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'metrics.com': createTestEntry('metrics.com', {
            usageCount: 100,
            overallSuccessRate: 0.95,
          }),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack), {
        resetMetrics: true,
      });

      expect(result.success).toBe(true);

      const entry = engine.getEntry('metrics.com');
      expect(entry?.usageCount).toBe(0);
      expect(entry?.overallSuccessRate).toBe(0);
    });

    it('should downgrade confidence when adjustment < 1', async () => {
      const pack: KnowledgePack = {
        metadata: {
          id: 'test_pack_7',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          domains: ['confidence.com'],
          stats: {
            domainCount: 1,
            apiPatternCount: 1,
            selectorCount: 0,
            validatorCount: 0,
            paginationPatternCount: 0,
            antiPatternCount: 0,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        entries: {
          'confidence.com': createTestEntry('confidence.com', {
            apiPatterns: [
              {
                endpoint: 'https://confidence.com/api',
                method: 'GET',
                confidence: 'high',
                canBypass: true,
                createdAt: Date.now(),
                lastVerified: Date.now(),
                verificationCount: 1,
                failureCount: 0,
              },
            ],
          }),
        },
      };

      const result = await engine.importKnowledgePack(JSON.stringify(pack), {
        confidenceAdjustment: 0.5, // Should downgrade by 1 step
      });

      expect(result.success).toBe(true);

      const entry = engine.getEntry('confidence.com');
      expect(entry?.apiPatterns[0].confidence).toBe('medium');
    });
  });

  describe('round-trip export/import', () => {
    it('should preserve data through export and import', async () => {
      // Create test data
      engine.learnApiPattern('roundtrip.com', {
        endpoint: 'https://roundtrip.com/api/users',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });
      engine.learnApiPattern('roundtrip.com', {
        endpoint: 'https://roundtrip.com/api/items',
        method: 'POST',
        confidence: 'medium',
        canBypass: false,
      });

      // Export
      const pack = engine.exportKnowledgePack();
      const json = engine.serializeKnowledgePack(pack);

      // Create new engine and import
      const newEngine = new LearningEngine(
        path.join(tempDir, 'new-knowledge-base.json')
      );
      await newEngine.initialize();

      const result = await newEngine.importKnowledgePack(json);

      expect(result.success).toBe(true);

      // Verify data
      const entry = newEngine.getEntry('roundtrip.com');
      expect(entry).toBeDefined();
      expect(entry?.apiPatterns.length).toBe(2);

      const endpoints = entry?.apiPatterns.map(p => p.endpoint).sort();
      expect(endpoints).toEqual([
        'https://roundtrip.com/api/items',
        'https://roundtrip.com/api/users',
      ]);
    });
  });

  describe('getAntiPatterns', () => {
    it('should return empty array when no anti-patterns', () => {
      const antiPatterns = engine.getAntiPatterns();
      expect(antiPatterns).toEqual([]);
    });
  });
});
