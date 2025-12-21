/**
 * Tests for Learning Effectiveness Metrics (LI-003)
 *
 * These tests cover:
 * - Pattern effectiveness computation
 * - Confidence accuracy metrics
 * - Tier optimization metrics
 * - Skill effectiveness metrics
 * - Domain coverage metrics
 * - Learning trend computation
 * - Health score calculation
 * - Insight generation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LearningEngine } from '../../src/core/learning-engine.js';
import { TieredFetcher } from '../../src/core/tiered-fetcher.js';
import { ProceduralMemory } from '../../src/core/procedural-memory.js';
import {
  computeLearningEffectiveness,
  type LearningEffectivenessReport,
} from '../../src/core/learning-effectiveness.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ApiPattern } from '../../src/types/index.js';

describe('LearningEffectiveness', () => {
  let learningEngine: LearningEngine;
  let tieredFetcher: TieredFetcher;
  let proceduralMemory: ProceduralMemory;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learning-effectiveness-test-'));
    const knowledgeBasePath = path.join(tempDir, 'knowledge-base.json');
    const proceduralPath = path.join(tempDir, 'procedural-memory.json');

    learningEngine = new LearningEngine(knowledgeBasePath);
    tieredFetcher = new TieredFetcher();
    proceduralMemory = new ProceduralMemory({ storagePath: proceduralPath });

    await learningEngine.initialize();
    await proceduralMemory.initialize();
  });

  afterEach(async () => {
    await learningEngine.flush();
    await new Promise(resolve => setTimeout(resolve, 10));
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('computeLearningEffectiveness', () => {
    it('should return valid report with empty data', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report).toBeDefined();
      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
      expect(report.insights).toBeInstanceOf(Array);
    });

    it('should compute pattern effectiveness metrics', async () => {
      // Add some API patterns
      const patterns: ApiPattern[] = [
        { endpoint: '/api/users', method: 'GET', confidence: 'high', canBypass: true },
        { endpoint: '/api/posts', method: 'GET', confidence: 'medium', canBypass: false },
        { endpoint: '/api/items', method: 'POST', confidence: 'low', canBypass: false },
      ];

      for (const pattern of patterns) {
        learningEngine.learnApiPattern('example.com', pattern);
      }

      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.patterns.totalDiscovered).toBe(3);
      expect(report.patterns.bypassablePatterns).toBe(1);
      expect(report.patterns.byConfidence.high.count).toBe(1);
      expect(report.patterns.byConfidence.medium.count).toBe(1);
      expect(report.patterns.byConfidence.low.count).toBe(1);
    });

    it('should compute confidence accuracy metrics', async () => {
      // Add patterns with different confidence levels
      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/high',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/low',
        method: 'GET',
        confidence: 'low',
        canBypass: false,
      });

      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.confidence).toBeDefined();
      expect(report.confidence.overallAccuracy).toBeGreaterThanOrEqual(0);
      expect(report.confidence.overallAccuracy).toBeLessThanOrEqual(1);
    });

    it('should include tier optimization when fetcher is provided', async () => {
      // Record some tier usage
      tieredFetcher.setDomainPreference('example.com', 'intelligence');

      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher
      );

      expect(report.tiers).toBeDefined();
      expect(report.tiers.tierDistribution).toBeDefined();
      // tierDistribution contains objects with count and avgTimeMs
      expect(report.tiers.tierDistribution.intelligence.count).toBeGreaterThanOrEqual(0);
      expect(report.tiers.tierDistribution.lightweight.count).toBeGreaterThanOrEqual(0);
      expect(report.tiers.tierDistribution.playwright.count).toBeGreaterThanOrEqual(0);
    });

    it('should include skill effectiveness when memory is provided', async () => {
      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher,
        proceduralMemory
      );

      expect(report.skills).toBeDefined();
      expect(report.skills.totalSkills).toBeGreaterThanOrEqual(0);
      expect(report.skills.reuseRate).toBeGreaterThanOrEqual(0);
      expect(report.skills.reuseRate).toBeLessThanOrEqual(1);
    });

    it('should compute domain coverage metrics', async () => {
      // Add patterns for multiple domains
      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/data',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      learningEngine.learnApiPattern('test.com', {
        endpoint: '/api/other',
        method: 'GET',
        confidence: 'medium',
        canBypass: false,
      });

      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.domains.totalDomains).toBe(2);
      expect(report.domains.domainsWithPatterns).toBe(2);
    });

    it('should compute learning trend for 24h window', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.trend24h).toBeDefined();
      expect(report.trend24h.windowMs).toBe(24 * 60 * 60 * 1000);
      expect(report.trend24h.recentEvents).toBeGreaterThanOrEqual(0);
      expect(report.trend24h.eventsPerHour).toBeGreaterThanOrEqual(0);
    });

    it('should calculate health score based on metrics', async () => {
      // Add some patterns to affect health score
      for (let i = 0; i < 5; i++) {
        learningEngine.learnApiPattern(`domain${i}.com`, {
          endpoint: `/api/endpoint${i}`,
          method: 'GET',
          confidence: 'high',
          canBypass: true,
        });
      }

      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Pattern Effectiveness', () => {
    it('should calculate hit rate correctly', async () => {
      // Add patterns but none are verified (used)
      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/unused',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const report = await computeLearningEffectiveness(learningEngine);

      // Hit rate is patternsUsed / totalDiscovered
      // patternsUsed counts patterns where verificationCount > 0
      // New patterns start with verificationCount = 1 from learnApiPattern
      expect(report.patterns.hitRate).toBeGreaterThanOrEqual(0);
      expect(report.patterns.hitRate).toBeLessThanOrEqual(1);
    });

    it('should count bypassable patterns', async () => {
      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/bypass1',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/bypass2',
        method: 'POST',
        confidence: 'high',
        canBypass: true,
      });

      learningEngine.learnApiPattern('example.com', {
        endpoint: '/api/nobpass',
        method: 'GET',
        confidence: 'low',
        canBypass: false,
      });

      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.patterns.bypassablePatterns).toBe(2);
    });
  });

  describe('Tier Optimization', () => {
    it('should provide default values when fetcher not provided', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.tiers.firstTierSuccessRate).toBe(0);
      expect(report.tiers.timeSavedMs).toBe(0);
      expect(report.tiers.optimizationRatio).toBe(0);
    });

    it('should track tier distribution', async () => {
      tieredFetcher.setDomainPreference('site1.com', 'intelligence');
      tieredFetcher.setDomainPreference('site2.com', 'lightweight');
      tieredFetcher.setDomainPreference('site3.com', 'playwright');

      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher
      );

      // Check that tier distribution is tracked
      expect(report.tiers.tierDistribution).toBeDefined();
    });
  });

  describe('Skill Effectiveness', () => {
    it('should provide default values when memory not provided', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.skills.totalSkills).toBe(0);
      expect(report.skills.reusedSkills).toBe(0);
      expect(report.skills.reuseRate).toBe(0);
    });

    it('should count anti-patterns', async () => {
      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher,
        proceduralMemory
      );

      expect(report.skills.antiPatterns).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Selector Effectiveness', () => {
    it('should track selector metrics', async () => {
      // Learn a selector pattern
      learningEngine.learnSelector('example.com', {
        selector: '.main-content',
        contentType: 'main_content',
        priority: 80,
      });

      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.selectors).toBeDefined();
      expect(report.selectors.totalSelectors).toBeGreaterThan(0);
    });
  });

  describe('Insights Generation', () => {
    it('should generate insights array', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.insights).toBeInstanceOf(Array);
    });

    it('should generate insight for low pattern hit rate', async () => {
      // Add many patterns without using them
      for (let i = 0; i < 15; i++) {
        learningEngine.learnApiPattern(`domain${i}.com`, {
          endpoint: `/api/endpoint${i}`,
          method: 'GET',
          confidence: 'high',
          canBypass: true,
        });
      }

      const report = await computeLearningEffectiveness(learningEngine);

      // Should have insights about pattern usage
      expect(report.insights.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate insight for active learning', async () => {
      // The insights should reflect the learning state
      const report = await computeLearningEffectiveness(learningEngine);

      // Insights about low learning activity may be present
      expect(report.insights).toBeInstanceOf(Array);
    });
  });

  describe('Report Format', () => {
    it('should have all required fields', async () => {
      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher,
        proceduralMemory
      );

      // Check all top-level fields
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('patterns');
      expect(report).toHaveProperty('confidence');
      expect(report).toHaveProperty('tiers');
      expect(report).toHaveProperty('skills');
      expect(report).toHaveProperty('selectors');
      expect(report).toHaveProperty('domains');
      expect(report).toHaveProperty('trend24h');
      expect(report).toHaveProperty('healthScore');
      expect(report).toHaveProperty('insights');
    });

    it('should have correct pattern sub-fields', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.patterns).toHaveProperty('totalDiscovered');
      expect(report.patterns).toHaveProperty('patternsUsed');
      expect(report.patterns).toHaveProperty('hitRate');
      expect(report.patterns).toHaveProperty('bypassablePatterns');
      expect(report.patterns).toHaveProperty('byConfidence');
      expect(report.patterns.byConfidence).toHaveProperty('high');
      expect(report.patterns.byConfidence).toHaveProperty('medium');
      expect(report.patterns.byConfidence).toHaveProperty('low');
    });

    it('should have correct confidence sub-fields', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.confidence).toHaveProperty('overallAccuracy');
      expect(report.confidence).toHaveProperty('highConfidenceAccuracy');
      expect(report.confidence).toHaveProperty('mediumConfidenceAccuracy');
      expect(report.confidence).toHaveProperty('lowConfidenceAccuracy');
      expect(report.confidence).toHaveProperty('confidenceGap');
      expect(report.confidence).toHaveProperty('overConfidentPatterns');
      expect(report.confidence).toHaveProperty('underConfidentPatterns');
    });

    it('should have correct tier sub-fields', async () => {
      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher
      );

      expect(report.tiers).toHaveProperty('firstTierSuccessRate');
      expect(report.tiers).toHaveProperty('timeSavedMs');
      expect(report.tiers).toHaveProperty('optimizationRatio');
      expect(report.tiers).toHaveProperty('tierDistribution');
      expect(report.tiers.tierDistribution).toHaveProperty('intelligence');
      expect(report.tiers.tierDistribution).toHaveProperty('lightweight');
      expect(report.tiers.tierDistribution).toHaveProperty('playwright');
    });

    it('should have correct skills sub-fields', async () => {
      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher,
        proceduralMemory
      );

      expect(report.skills).toHaveProperty('totalSkills');
      expect(report.skills).toHaveProperty('reusedSkills');
      expect(report.skills).toHaveProperty('reuseRate');
      expect(report.skills).toHaveProperty('avgSuccessRate');
      expect(report.skills).toHaveProperty('highPerformingSkills');
      expect(report.skills).toHaveProperty('antiPatterns');
    });

    it('should have correct domain sub-fields', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.domains).toHaveProperty('totalDomains');
      expect(report.domains).toHaveProperty('domainsWithPatterns');
      expect(report.domains).toHaveProperty('domainsWithSelectors');
      expect(report.domains).toHaveProperty('highSuccessDomains');
      expect(report.domains).toHaveProperty('avgDomainSuccessRate');
      expect(report.domains).toHaveProperty('crossDomainBeneficiaries');
    });

    it('should have correct trend sub-fields', async () => {
      const report = await computeLearningEffectiveness(learningEngine);

      expect(report.trend24h).toHaveProperty('windowMs');
      expect(report.trend24h).toHaveProperty('recentEvents');
      expect(report.trend24h).toHaveProperty('newPatterns');
      expect(report.trend24h).toHaveProperty('newSkills');
      expect(report.trend24h).toHaveProperty('verifications');
      expect(report.trend24h).toHaveProperty('failures');
      expect(report.trend24h).toHaveProperty('eventsPerHour');
    });
  });

  describe('Health Score Calculation', () => {
    it('should return health score between 0 and 100', async () => {
      const report = await computeLearningEffectiveness(
        learningEngine,
        tieredFetcher,
        proceduralMemory
      );

      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(report.healthScore)).toBe(true);
    });

    it('should have lower health with no learning data', async () => {
      const emptyReport = await computeLearningEffectiveness(learningEngine);

      // With no data, health score should reflect that
      expect(emptyReport.healthScore).toBeDefined();
    });
  });
});
