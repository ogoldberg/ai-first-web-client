/**
 * Tests for Skill Prompt Analytics (SK-011)
 *
 * Tests the tracking and analytics for Claude skill prompts
 * (research_product, monitor_changes, etc.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSkillPromptExecution,
  startSkillPromptExecution,
  completeSkillPromptExecution,
  getSkillPromptAnalytics,
  getSkillPromptStats,
  getRecentExecutions,
  clearSkillPromptAnalytics,
  getSkillPromptExecutionCount,
} from '../../src/utils/skill-prompt-analytics.js';

describe('Skill Prompt Analytics (SK-011)', () => {
  beforeEach(() => {
    // Clear analytics before each test
    clearSkillPromptAnalytics();
  });

  describe('recordSkillPromptExecution', () => {
    it('should record a successful execution', () => {
      recordSkillPromptExecution('research_product', true, {
        domain: 'amazon.com',
        durationMs: 1500,
      });

      expect(getSkillPromptExecutionCount()).toBe(1);

      const stats = getSkillPromptStats('research_product');
      expect(stats).toBeDefined();
      expect(stats?.totalExecutions).toBe(1);
      expect(stats?.successCount).toBe(1);
      expect(stats?.failureCount).toBe(0);
      expect(stats?.successRate).toBe(1);
    });

    it('should record a failed execution with error message', () => {
      recordSkillPromptExecution('monitor_changes', false, {
        domain: 'example.com',
        durationMs: 500,
        errorMessage: 'Timeout exceeded',
      });

      const stats = getSkillPromptStats('monitor_changes');
      expect(stats).toBeDefined();
      expect(stats?.totalExecutions).toBe(1);
      expect(stats?.successCount).toBe(0);
      expect(stats?.failureCount).toBe(1);
      expect(stats?.successRate).toBe(0);
    });

    it('should track workflow steps', () => {
      recordSkillPromptExecution('scrape_catalog', true, {
        workflowStep: 1,
        domain: 'shop.example.com',
        durationMs: 1000,
      });
      recordSkillPromptExecution('scrape_catalog', true, {
        workflowStep: 2,
        domain: 'shop.example.com',
        durationMs: 800,
      });

      const executions = getRecentExecutions(10);
      expect(executions.length).toBe(2);
      expect(executions[0].workflowStep).toBe(2); // Most recent first
      expect(executions[1].workflowStep).toBe(1);
    });

    it('should track parameter overrides', () => {
      recordSkillPromptExecution('research_product', true, {
        domain: 'example.com',
        durationMs: 1000,
        parameterOverrides: {
          sources: ['amazon.com', 'walmart.com'],
          fields: ['price', 'availability'],
        },
      });

      const stats = getSkillPromptStats('research_product');
      expect(stats?.commonOverrides).toBeDefined();
      expect(stats?.commonOverrides.length).toBeGreaterThan(0);
      expect(stats?.commonOverrides.some(o => o.parameter === 'sources')).toBe(true);
      expect(stats?.commonOverrides.some(o => o.parameter === 'fields')).toBe(true);
    });
  });

  describe('startSkillPromptExecution / completeSkillPromptExecution', () => {
    it('should track execution duration correctly', async () => {
      const execution = startSkillPromptExecution('discover_apis', {
        domain: 'api.example.com',
      });

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));

      completeSkillPromptExecution(execution, true);

      expect(execution.success).toBe(true);
      expect(execution.durationMs).toBeGreaterThanOrEqual(50);
      expect(execution.completedAt).toBeDefined();
    });

    it('should track failed executions with error message', () => {
      const execution = startSkillPromptExecution('compare_sources', {
        domain: 'news.example.com',
      });

      completeSkillPromptExecution(execution, false, 'Rate limited');

      expect(execution.success).toBe(false);
      expect(execution.errorMessage).toBe('Rate limited');
    });
  });

  describe('getSkillPromptAnalytics', () => {
    it('should return summary with most used skills', () => {
      // Record executions for multiple skills
      recordSkillPromptExecution('research_product', true, { durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { durationMs: 100 });
      recordSkillPromptExecution('monitor_changes', true, { durationMs: 100 });

      const analytics = getSkillPromptAnalytics();

      expect(analytics.totalExecutions).toBe(4);
      expect(analytics.overallSuccessRate).toBe(1);
      expect(analytics.mostUsed.length).toBeGreaterThan(0);
      expect(analytics.mostUsed[0].skillPromptId).toBe('research_product');
      expect(analytics.mostUsed[0].totalExecutions).toBe(3);
    });

    it('should identify skills needing attention', () => {
      // Record many failures for a skill
      for (let i = 0; i < 8; i++) {
        recordSkillPromptExecution('failing_skill', false, {
          durationMs: 100,
          errorMessage: 'Failure',
        });
      }
      for (let i = 0; i < 2; i++) {
        recordSkillPromptExecution('failing_skill', true, { durationMs: 100 });
      }

      const analytics = getSkillPromptAnalytics();

      expect(analytics.needsAttention.length).toBeGreaterThan(0);
      expect(analytics.needsAttention[0].skillPromptId).toBe('failing_skill');
      expect(analytics.needsAttention[0].successRate).toBeLessThan(0.7);
    });

    it('should filter by domain', () => {
      recordSkillPromptExecution('research_product', true, { domain: 'amazon.com', durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { domain: 'walmart.com', durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { domain: 'amazon.com', durationMs: 100 });

      const analytics = getSkillPromptAnalytics({ domain: 'amazon.com' });

      expect(analytics.totalExecutions).toBe(2);
    });

    it('should filter by skill prompt ID', () => {
      recordSkillPromptExecution('research_product', true, { durationMs: 100 });
      recordSkillPromptExecution('monitor_changes', true, { durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { durationMs: 100 });

      const analytics = getSkillPromptAnalytics({ skillPromptId: 'research_product' });

      expect(analytics.totalExecutions).toBe(2);
    });

    it('should filter by time range', async () => {
      // Record an execution first (will have startedAt = now - 100ms)
      recordSkillPromptExecution('old_skill', true, { durationMs: 100 });

      // Wait to ensure clear time separation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Capture the boundary time
      const now = Date.now();

      // Wait and record new execution after 'now'
      // Note: startedAt = Date.now() - durationMs, so we pass 0 to make startedAt = Date.now()
      await new Promise(resolve => setTimeout(resolve, 10));
      recordSkillPromptExecution('new_skill', true, { durationMs: 0 });

      const analyticsAll = getSkillPromptAnalytics();
      expect(analyticsAll.totalExecutions).toBe(2);

      const analyticsSinceNow = getSkillPromptAnalytics({ since: now });

      // Should include only executions from 'now' onwards (the new_skill one)
      expect(analyticsSinceNow.totalExecutions).toBe(1);
      expect(analyticsSinceNow.bySkillPrompt['new_skill']).toBeDefined();
      expect(analyticsSinceNow.bySkillPrompt['old_skill']).toBeUndefined();
    });
  });

  describe('getSkillPromptStats', () => {
    it('should return null for unknown skill prompt', () => {
      const stats = getSkillPromptStats('nonexistent_skill');
      expect(stats).toBeNull();
    });

    it('should calculate success rate correctly', () => {
      recordSkillPromptExecution('mixed_skill', true, { durationMs: 100 });
      recordSkillPromptExecution('mixed_skill', true, { durationMs: 100 });
      recordSkillPromptExecution('mixed_skill', false, { durationMs: 100 });
      recordSkillPromptExecution('mixed_skill', true, { durationMs: 100 });

      const stats = getSkillPromptStats('mixed_skill');

      expect(stats?.totalExecutions).toBe(4);
      expect(stats?.successCount).toBe(3);
      expect(stats?.failureCount).toBe(1);
      expect(stats?.successRate).toBe(0.75);
    });

    it('should track top domains', () => {
      recordSkillPromptExecution('research_product', true, { domain: 'amazon.com', durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { domain: 'amazon.com', durationMs: 100 });
      recordSkillPromptExecution('research_product', true, { domain: 'walmart.com', durationMs: 100 });

      const stats = getSkillPromptStats('research_product');

      expect(stats?.topDomains.length).toBeGreaterThan(0);
      expect(stats?.topDomains[0].domain).toBe('amazon.com');
      expect(stats?.topDomains[0].count).toBe(2);
    });

    it('should calculate duration percentiles', () => {
      // Record executions with varying durations
      for (let i = 0; i < 10; i++) {
        recordSkillPromptExecution('timed_skill', true, { durationMs: (i + 1) * 100 });
      }

      const stats = getSkillPromptStats('timed_skill');

      expect(stats?.avgDurationMs).toBeCloseTo(550, -2); // Average of 100-1000
      expect(stats?.p95DurationMs).toBeGreaterThanOrEqual(900);
    });
  });

  describe('getRecentExecutions', () => {
    it('should return executions in reverse chronological order', () => {
      recordSkillPromptExecution('skill_a', true, { durationMs: 100 });
      recordSkillPromptExecution('skill_b', true, { durationMs: 100 });
      recordSkillPromptExecution('skill_c', true, { durationMs: 100 });

      const executions = getRecentExecutions(10);

      expect(executions[0].skillPromptId).toBe('skill_c');
      expect(executions[1].skillPromptId).toBe('skill_b');
      expect(executions[2].skillPromptId).toBe('skill_a');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        recordSkillPromptExecution(`skill_${i}`, true, { durationMs: 100 });
      }

      const executions = getRecentExecutions(5);
      expect(executions.length).toBe(5);
    });
  });

  describe('clearSkillPromptAnalytics', () => {
    it('should clear all stored executions', () => {
      recordSkillPromptExecution('skill_a', true, { durationMs: 100 });
      recordSkillPromptExecution('skill_b', true, { durationMs: 100 });

      expect(getSkillPromptExecutionCount()).toBe(2);

      clearSkillPromptAnalytics();

      expect(getSkillPromptExecutionCount()).toBe(0);
      expect(getRecentExecutions(10).length).toBe(0);
    });
  });

  describe('Storage limits', () => {
    it('should trim old executions when limit exceeded', () => {
      // Record more than the storage limit
      for (let i = 0; i < 12000; i++) {
        recordSkillPromptExecution('bulk_skill', true, { durationMs: 10 });
      }

      // Should be trimmed to 10000
      expect(getSkillPromptExecutionCount()).toBe(10000);
    });
  });

  describe('Schema version', () => {
    it('should include schema version in analytics summary', () => {
      recordSkillPromptExecution('skill_a', true, { durationMs: 100 });

      const analytics = getSkillPromptAnalytics();

      expect(analytics.schemaVersion).toBeDefined();
      expect(typeof analytics.schemaVersion).toBe('string');
    });
  });
});
