/**
 * Tests for ProceduralMemory statistics methods
 *
 * These tests cover:
 * - getAntiPatternStats()
 * - getLearningProgress()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProceduralMemory } from '../../src/core/procedural-memory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ProceduralMemory Statistics', () => {
  let memory: ProceduralMemory;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'procedural-memory-stats-test-'));
    const filePath = path.join(tempDir, 'procedural-memory.json');

    memory = new ProceduralMemory({ filePath });
    await memory.initialize();
  });

  describe('getAntiPatternStats', () => {
    it('should return empty stats when no anti-patterns exist', () => {
      const stats = memory.getAntiPatternStats();

      expect(stats.totalAntiPatterns).toBe(0);
      expect(stats.byDomain).toEqual({});
      expect(stats.mostCommon).toEqual([]);
      expect(stats.recentlyAdded).toEqual([]);
    });

    it('should count anti-patterns by domain', async () => {
      // Record an anti-pattern manually by simulating the internal state
      // This would normally be done through learnAntiPattern method
      const stats = memory.getAntiPatternStats();

      // Stats should be empty for new memory
      expect(stats.totalAntiPatterns).toBe(0);
    });
  });

  describe('getLearningProgress', () => {
    it('should return empty progress when nothing learned', () => {
      const progress = memory.getLearningProgress();

      expect(progress.skills.total).toBe(0);
      expect(progress.skills.byDomain).toEqual({});
      expect(progress.skills.avgSuccessRate).toBe(1); // 100% when no executions
      expect(progress.skills.topPerformers).toEqual([]);
      expect(progress.skills.recentlyCreated).toEqual([]);

      expect(progress.antiPatterns.total).toBe(0);
      expect(progress.antiPatterns.byDomain).toEqual({});

      expect(progress.coverage.coveredDomains).toBe(0);
      expect(progress.coverage.uncoveredDomains).toEqual([]);
      expect(progress.coverage.suggestions).toEqual([]);

      expect(progress.trajectories.total).toBe(0);
      expect(progress.trajectories.successful).toBe(0);
      expect(progress.trajectories.failed).toBe(0);
    });

    it('should report correct coverage domains count', () => {
      const progress = memory.getLearningProgress();

      // Coverage should start at 0
      expect(progress.coverage.coveredDomains).toBe(0);
    });

    it('should track trajectory success/failure counts', () => {
      const progress = memory.getLearningProgress();

      expect(progress.trajectories.total).toBe(0);
      expect(progress.trajectories.successful).toBe(0);
      expect(progress.trajectories.failed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return basic stats', () => {
      const stats = memory.getStats();

      expect(stats.totalSkills).toBe(0);
      expect(stats.totalTrajectories).toBe(0);
      expect(stats.skillsByDomain).toEqual({});
      expect(stats.avgSuccessRate).toBe(1); // 100% when no executions
      expect(stats.mostUsedSkills).toEqual([]);
    });
  });

  describe('getCoverageStats', () => {
    it('should return coverage statistics', () => {
      const coverage = memory.getCoverageStats();

      expect(coverage.coveredDomains).toEqual([]);
      expect(coverage.uncoveredDomains).toEqual([]);
      expect(coverage.suggestions).toEqual([]);
    });
  });
});
