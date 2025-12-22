/**
 * Tests for Tool Selection Metrics (TC-010)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ToolSelectionMetrics,
  categorize,
  isDeprecated,
  CORE_TOOLS,
  DEBUG_TOOLS,
  ADMIN_TOOLS,
  DEPRECATED_TOOLS,
  getToolSelectionMetrics,
  resetToolSelectionMetricsInstance,
} from '../../src/utils/tool-selection-metrics.js';

describe('Tool Selection Metrics', () => {
  let tempDir: string;
  let metrics: ToolSelectionMetrics;

  beforeEach(async () => {
    // Reset singleton first to avoid state leakage
    resetToolSelectionMetricsInstance();
    // Create temp directory for test data
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-metrics-test-'));
    metrics = new ToolSelectionMetrics({
      persistPath: path.join(tempDir, 'test-metrics.json'),
      maxEvents: 1000,
      debounceMs: 10, // Fast debounce for tests
    });
    await metrics.initialize();
  });

  afterEach(async () => {
    await metrics.flush();
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    // Reset singleton
    resetToolSelectionMetricsInstance();
  });

  describe('categorize()', () => {
    it('should categorize core tools correctly', () => {
      for (const tool of CORE_TOOLS) {
        expect(categorize(tool)).toBe('core');
      }
    });

    it('should categorize debug tools correctly', () => {
      for (const tool of DEBUG_TOOLS) {
        expect(categorize(tool)).toBe('debug');
      }
    });

    it('should categorize admin tools correctly', () => {
      for (const tool of ADMIN_TOOLS) {
        expect(categorize(tool)).toBe('admin');
      }
    });

    it('should categorize deprecated tools correctly', () => {
      for (const tool of DEPRECATED_TOOLS) {
        expect(categorize(tool)).toBe('deprecated');
      }
    });

    it('should return unknown for unrecognized tools', () => {
      expect(categorize('some_unknown_tool')).toBe('unknown');
      expect(categorize('random_tool')).toBe('unknown');
    });
  });

  describe('isDeprecated()', () => {
    it('should return true for deprecated tools', () => {
      expect(isDeprecated('get_domain_intelligence')).toBe(true);
      expect(isDeprecated('configure_api_auth')).toBe(true);
      expect(isDeprecated('skill_management')).toBe(true);
    });

    it('should return false for non-deprecated tools', () => {
      expect(isDeprecated('smart_browse')).toBe(false);
      expect(isDeprecated('api_auth')).toBe(false);
      expect(isDeprecated('capture_screenshot')).toBe(false);
    });
  });

  describe('record()', () => {
    it('should record a tool invocation', async () => {
      const event = await metrics.record({
        timestamp: Date.now(),
        tool: 'smart_browse',
        success: true,
        durationMs: 500,
      });

      expect(event.id).toBeDefined();
      expect(event.tool).toBe('smart_browse');
      expect(event.success).toBe(true);
      expect(event.isDeprecated).toBe(false);
      expect(event.category).toBe('core');
    });

    it('should mark deprecated tools correctly', async () => {
      const event = await metrics.record({
        timestamp: Date.now(),
        tool: 'get_domain_intelligence',
        success: true,
        durationMs: 200,
      });

      expect(event.isDeprecated).toBe(true);
      expect(event.category).toBe('deprecated');
    });

    it('should record failed invocations with error message', async () => {
      const event = await metrics.record({
        timestamp: Date.now(),
        tool: 'smart_browse',
        success: false,
        error: 'Network timeout',
        durationMs: 30000,
      });

      expect(event.success).toBe(false);
      expect(event.error).toBe('Network timeout');
    });

    it('should include session and tenant IDs when provided', async () => {
      const event = await metrics.record({
        timestamp: Date.now(),
        tool: 'smart_browse',
        success: true,
        durationMs: 500,
        sessionId: 'session-123',
        tenantId: 'tenant-abc',
      });

      expect(event.sessionId).toBe('session-123');
      expect(event.tenantId).toBe('tenant-abc');
    });
  });

  describe('getStats()', () => {
    it('should return empty stats when no events', async () => {
      const stats = await metrics.getStats();

      expect(stats.totalInvocations).toBe(0);
      expect(stats.byCategory.core.invocations).toBe(0);
      expect(stats.deprecatedUsageRate).toBe(0);
    });

    it('should aggregate tool invocations correctly', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 200 });
      await metrics.record({ timestamp: Date.now(), tool: 'api_auth', success: true, durationMs: 50 });

      const stats = await metrics.getStats();

      expect(stats.totalInvocations).toBe(3);
      expect(stats.byTool['smart_browse'].invocations).toBe(2);
      expect(stats.byTool['api_auth'].invocations).toBe(1);
    });

    it('should calculate success rate correctly', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: false, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: false, durationMs: 100 });

      const stats = await metrics.getStats();

      expect(stats.byTool['smart_browse'].successRate).toBe(0.5);
    });

    it('should calculate deprecated usage rate', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });

      const stats = await metrics.getStats();

      expect(stats.deprecatedUsageRate).toBe(0.5);
    });

    it('should calculate category breakdown', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'capture_screenshot', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'get_performance_metrics', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });

      const stats = await metrics.getStats();

      expect(stats.byCategory.core.invocations).toBe(1);
      expect(stats.byCategory.debug.invocations).toBe(1);
      expect(stats.byCategory.admin.invocations).toBe(1);
      expect(stats.byCategory.deprecated.invocations).toBe(1);
    });

    it('should filter by tool', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'api_auth', success: true, durationMs: 100 });

      const stats = await metrics.getStats({ tool: 'smart_browse' });

      expect(stats.totalInvocations).toBe(1);
      expect(stats.byTool['smart_browse']).toBeDefined();
      expect(stats.byTool['api_auth']).toBeUndefined();
    });

    it('should filter by category', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });

      const stats = await metrics.getStats({ category: 'deprecated' });

      expect(stats.totalInvocations).toBe(1);
      expect(stats.byTool['get_domain_intelligence']).toBeDefined();
    });

    it('should calculate first-browse success rate per session', async () => {
      // Create a fresh instance to avoid any cross-test contamination
      const freshMetrics = new ToolSelectionMetrics({
        persistPath: path.join(tempDir, 'first-browse-test.json'),
        maxEvents: 1000,
        debounceMs: 10, // Fast debounce for tests
      });
      await freshMetrics.initialize();

      // Use fixed timestamps far in the past to avoid any time-based filtering issues
      const baseTime = 1000000000000; // Fixed timestamp: Sept 9, 2001

      // Session 1: first smart_browse succeeds (at t=0), second fails (at t=100)
      await freshMetrics.record({ timestamp: baseTime, tool: 'smart_browse', success: true, durationMs: 100, sessionId: 'session-1' });
      await freshMetrics.record({ timestamp: baseTime + 100, tool: 'smart_browse', success: false, durationMs: 100, sessionId: 'session-1' });

      // Session 2: first smart_browse fails (at t=200), second succeeds (at t=300)
      await freshMetrics.record({ timestamp: baseTime + 200, tool: 'smart_browse', success: false, durationMs: 100, sessionId: 'session-2' });
      await freshMetrics.record({ timestamp: baseTime + 300, tool: 'smart_browse', success: true, durationMs: 100, sessionId: 'session-2' });

      // Check internal event count directly
      expect(freshMetrics.getEventCount()).toBe(4);

      // Use explicit start/end times to ensure all events are included
      const stats = await freshMetrics.getStats({ startTime: baseTime - 1000, endTime: baseTime + 1000 });

      // Verify all 4 events were recorded
      expect(stats.totalInvocations).toBe(4);
      // Verify we have 2 sessions
      expect(stats.sessionStats.totalSessions).toBe(2);
      // 1 out of 2 sessions had first smart_browse succeed
      expect(stats.firstBrowseSuccessRate).toBe(0.5);

      await freshMetrics.flush();
    });

    it('should track session statistics', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100, sessionId: 'session-1' });
      await metrics.record({ timestamp: Date.now(), tool: 'api_auth', success: true, durationMs: 100, sessionId: 'session-1' });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100, sessionId: 'session-2' });
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100, sessionId: 'session-2' });

      const stats = await metrics.getStats();

      expect(stats.sessionStats.totalSessions).toBe(2);
      expect(stats.sessionStats.avgToolsPerSession).toBe(2);
      expect(stats.sessionStats.sessionsWithDeprecatedUsage).toBe(1);
    });
  });

  describe('getConfusionIndicators()', () => {
    it('should return empty indicators when no events', async () => {
      const indicators = await metrics.getConfusionIndicators();

      expect(indicators.deprecatedToolCalls).toHaveLength(0);
      expect(indicators.repeatedFailures).toHaveLength(0);
      expect(indicators.overallConfusionScore).toBe(0);
    });

    it('should track deprecated tool calls with suggestions', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'configure_api_auth', success: true, durationMs: 100 });

      const indicators = await metrics.getConfusionIndicators();

      expect(indicators.deprecatedToolCalls).toHaveLength(2);
      const domainIntCall = indicators.deprecatedToolCalls.find(c => c.tool === 'get_domain_intelligence');
      expect(domainIntCall?.count).toBe(2);
      expect(domainIntCall?.suggestion).toContain('smart_browse');
    });

    it('should track repeated failures', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: false, error: 'Timeout', durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: false, error: 'Network error', durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'api_auth', success: false, error: 'Invalid', durationMs: 100 });

      const indicators = await metrics.getConfusionIndicators();

      // Only smart_browse has >= 2 failures
      expect(indicators.repeatedFailures).toHaveLength(1);
      expect(indicators.repeatedFailures[0].tool).toBe('smart_browse');
      expect(indicators.repeatedFailures[0].failureCount).toBe(2);
    });

    it('should track tool hopping across sessions', async () => {
      // Session 1: uses multiple tools
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100, sessionId: 'session-1' });
      await metrics.record({ timestamp: Date.now(), tool: 'api_auth', success: true, durationMs: 100, sessionId: 'session-1' });
      await metrics.record({ timestamp: Date.now(), tool: 'execute_api_call', success: true, durationMs: 100, sessionId: 'session-1' });

      // Session 2: uses only one tool
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100, sessionId: 'session-2' });

      const indicators = await metrics.getConfusionIndicators();

      expect(indicators.toolHopping.sessionsWithMultipleTools).toBe(1);
      expect(indicators.toolHopping.avgToolSwitches).toBe(2); // (3 + 1) / 2 = 2
    });

    it('should calculate overall confusion score', async () => {
      // Add some deprecated usage
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });
      // Add some failures
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: false, durationMs: 100 });
      // Add successful core tool usage
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });

      const indicators = await metrics.getConfusionIndicators();

      // Score should be > 0 due to deprecated usage and failure
      expect(indicators.overallConfusionScore).toBeGreaterThan(0);
      expect(indicators.overallConfusionScore).toBeLessThanOrEqual(100);
    });

    it('should provide recommendations based on issues', async () => {
      // High deprecated usage (> 10%)
      await metrics.record({ timestamp: Date.now(), tool: 'get_domain_intelligence', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });

      const indicators = await metrics.getConfusionIndicators();

      expect(indicators.recommendations.length).toBeGreaterThan(0);
      expect(indicators.recommendations.some(r => r.includes('deprecated'))).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should persist and reload events', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: Date.now(), tool: 'api_auth', success: true, durationMs: 100 });
      await metrics.flush();

      // Create new instance with same path
      const metrics2 = new ToolSelectionMetrics({
        persistPath: path.join(tempDir, 'test-metrics.json'),
        debounceMs: 10, // Fast debounce for tests
      });
      await metrics2.initialize();

      const stats = await metrics2.getStats({ period: 'all' });
      expect(stats.totalInvocations).toBe(2);
    });

    it('should handle reset', async () => {
      await metrics.record({ timestamp: Date.now(), tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.reset();

      const stats = await metrics.getStats();
      expect(stats.totalInvocations).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      resetToolSelectionMetricsInstance();
      const instance1 = getToolSelectionMetrics();
      const instance2 = getToolSelectionMetrics();
      expect(instance1).toBe(instance2);
    });
  });

  describe('time period filtering', () => {
    it('should filter by period', async () => {
      const now = Date.now();
      const hourAgo = now - 2 * 60 * 60 * 1000; // 2 hours ago

      await metrics.record({ timestamp: now, tool: 'smart_browse', success: true, durationMs: 100 });
      await metrics.record({ timestamp: hourAgo, tool: 'api_auth', success: true, durationMs: 100 });

      const hourStats = await metrics.getStats({ period: 'hour' });
      const allStats = await metrics.getStats({ period: 'all' });

      expect(hourStats.totalInvocations).toBe(1);
      expect(allStats.totalInvocations).toBe(2);
    });
  });
});
