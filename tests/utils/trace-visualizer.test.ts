/**
 * Tests for Trace Visualizer (F-009)
 */

import { describe, it, expect } from 'vitest';
import {
  visualizeTrace,
  createTraceSummaryCard,
  compareTraces,
  type VisualizationOptions,
} from '../../src/utils/trace-visualizer.js';
import type { DebugTrace } from '../../src/utils/debug-trace-recorder.js';

/**
 * Create a mock debug trace for testing
 */
function createMockTrace(overrides: Partial<DebugTrace> = {}): DebugTrace {
  return {
    id: 'test_trace_123',
    timestamp: Date.now(),
    url: 'https://example.com/test',
    domain: 'example.com',
    finalUrl: 'https://example.com/test',
    durationMs: 1500,
    success: true,
    tiers: {
      attempts: [
        {
          tier: 'intelligence',
          success: false,
          durationMs: 200,
          failureReason: 'Content too short',
          validationDetails: {
            contentLength: 50,
            hasSemanticMarkers: false,
          },
        },
        {
          tier: 'lightweight',
          success: true,
          durationMs: 800,
          validationDetails: {
            contentLength: 5000,
            hasSemanticMarkers: true,
          },
        },
      ],
      finalTier: 'lightweight',
      fellBack: true,
    },
    selectors: {
      attempts: [
        {
          selector: 'main',
          source: 'main',
          matched: true,
          contentLength: 5000,
          confidenceScore: 0.9,
          selected: true,
        },
        {
          selector: 'article',
          source: 'article',
          matched: false,
          contentLength: 0,
          confidenceScore: 0.8,
          selected: false,
          skipReason: 'No match',
        },
      ],
      finalSelector: 'main',
      fallbackUsed: false,
    },
    title: {
      attempts: [
        {
          source: 'og_title',
          selector: 'meta[property="og:title"]',
          found: true,
          value: 'Test Page Title',
          confidenceScore: 0.95,
          selected: true,
        },
      ],
      value: 'Test Page Title',
      source: 'og_title',
    },
    validation: {
      valid: true,
      reasons: ['Content length sufficient', 'Semantic markers present'],
      validatorsApplied: ['length', 'semantic'],
      contentLength: 5000,
    },
    network: {
      requestCount: 15,
      apiRequests: [
        { url: 'https://api.example.com/data', method: 'GET', status: 200 },
        { url: 'https://api.example.com/user', method: 'GET', status: 200 },
      ],
      failedRequests: [],
      bytesTransferred: 150000,
    },
    errors: [],
    content: {
      textLength: 5000,
      markdownLength: 6000,
      tableCount: 2,
      apiCount: 2,
    },
    skills: {
      matched: ['extract-article', 'pagination'],
      applied: 'extract-article',
      trajectoryRecorded: true,
    },
    metadata: {
      sessionProfile: 'default',
      sessionLoaded: true,
      options: { maxChars: 10000 },
    },
    ...overrides,
  };
}

/**
 * Create a failed trace for testing
 */
function createFailedTrace(): DebugTrace {
  return createMockTrace({
    id: 'failed_trace_456',
    success: false,
    tiers: {
      attempts: [
        {
          tier: 'intelligence',
          success: false,
          durationMs: 100,
          failureReason: 'Network error',
        },
        {
          tier: 'lightweight',
          success: false,
          durationMs: 500,
          failureReason: 'Bot challenge detected',
        },
        {
          tier: 'playwright',
          success: false,
          durationMs: 5000,
          failureReason: 'Timeout',
        },
      ],
      finalTier: 'playwright',
      fellBack: true,
    },
    errors: [
      {
        type: 'timeout',
        message: 'Page load timeout after 30s',
        recoveryAttempted: true,
        recoverySucceeded: false,
        timestamp: Date.now(),
      },
      {
        type: 'bot_challenge',
        message: 'Cloudflare challenge detected',
        recoveryAttempted: false,
        timestamp: Date.now(),
      },
    ],
    content: {
      textLength: 0,
      markdownLength: 0,
      tableCount: 0,
      apiCount: 0,
    },
    anomaly: {
      type: 'bot_detection',
      action: 'retry_with_stealth',
      confidence: 0.85,
    },
  });
}

describe('Trace Visualizer', () => {
  describe('visualizeTrace', () => {
    describe('ASCII format', () => {
      it('should render successful trace with timeline and cascade', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

        expect(result).toContain('Browse Trace');
        expect(result).toContain('SUCCESS');
        expect(result).toContain('Lightweight');
        expect(result).toContain('1500ms');
        expect(result).toContain('example.com');
        expect(result).toContain('Tier Cascade');
        expect(result).toContain('Timeline');
      });

      it('should render failed trace with errors', () => {
        const trace = createFailedTrace();
        const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

        expect(result).toContain('FAILURE');
        expect(result).toContain('Errors');
        expect(result).toContain('timeout');
        expect(result).toContain('Page load timeout');
      });

      it('should include tier attempts with durations', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

        expect(result).toContain('Intelligence');
        expect(result).toContain('200ms');
        expect(result).toContain('Lightweight');
        expect(result).toContain('800ms');
      });

      it('should show selectors when enabled', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, {
          format: 'ascii',
          useColor: false,
          includeSelectors: true,
        });

        expect(result).toContain('Selector Attempts');
        expect(result).toContain('main');
        expect(result).toContain('SELECTED');
      });

      it('should hide selectors when disabled', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, {
          format: 'ascii',
          useColor: false,
          includeSelectors: false,
        });

        expect(result).not.toContain('Selector Attempts');
      });

      it('should show network activity when enabled', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, {
          format: 'ascii',
          useColor: false,
          includeNetwork: true,
        });

        expect(result).toContain('Network Activity');
        expect(result).toContain('Requests: 15');
        expect(result).toContain('APIs discovered: 2');
      });

      it('should show skills when enabled', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, {
          format: 'ascii',
          useColor: false,
          includeSkills: true,
        });

        expect(result).toContain('Skills');
        expect(result).toContain('extract-article');
        expect(result).toContain('Trajectory recorded');
      });

      it('should include summary section', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

        expect(result).toContain('Summary');
        expect(result).toContain('Tiers: 2 attempted');
        expect(result).toContain('Final tier: Lightweight');
      });
    });

    describe('Compact format', () => {
      it('should render one-line summary for success', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'compact', useColor: false });

        expect(result).toContain('OK');
        expect(result).toContain('[L]');
        expect(result).toContain('example.com');
        expect(result).toMatch(/\d+(\.\d+)?[ms]/);
      });

      it('should render one-line summary for failure with error count', () => {
        const trace = createFailedTrace();
        const result = visualizeTrace(trace, { format: 'compact', useColor: false });

        expect(result).toContain('FAIL');
        expect(result).toContain('(2 errors)');
      });
    });

    describe('Detailed format', () => {
      it('should include all sections', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'detailed', useColor: false });

        expect(result).toContain('Browse Trace');
        expect(result).toContain('Trace ID:');
        expect(result).toContain('Session:');
        expect(result).toContain('Tier Cascade');
        expect(result).toContain('Selector Attempts');
        expect(result).toContain('Validation');
        expect(result).toContain('Content Statistics');
      });

      it('should show validation details', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'detailed', useColor: false });

        expect(result).toContain('VALID');
        expect(result).toContain('Content length sufficient');
      });

      it('should show anomaly when present', () => {
        const trace = createFailedTrace();
        const result = visualizeTrace(trace, { format: 'detailed', useColor: false });

        expect(result).toContain('Anomaly Detected');
        expect(result).toContain('bot_detection');
        expect(result).toContain('retry_with_stealth');
      });
    });

    describe('HTML format', () => {
      it('should generate valid HTML document', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'html' });

        expect(result).toContain('<!DOCTYPE html>');
        expect(result).toContain('<html>');
        expect(result).toContain('</html>');
        expect(result).toContain('<head>');
        expect(result).toContain('<body>');
      });

      it('should include styled elements', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'html' });

        expect(result).toContain('<style>');
        expect(result).toContain('class="status');
        expect(result).toContain('class="tier-icon');
      });

      it('should escape HTML in content', () => {
        const trace = createMockTrace({
          url: 'https://example.com/test?foo=<script>alert(1)</script>',
        });
        const result = visualizeTrace(trace, { format: 'html' });

        expect(result).not.toContain('<script>alert(1)</script>');
        expect(result).toContain('&lt;script&gt;');
      });

      it('should include tier cascade table', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'html' });

        expect(result).toContain('<h2>Tier Cascade</h2>');
        expect(result).toContain('<table>');
        expect(result).toContain('Intelligence');
        expect(result).toContain('Lightweight');
      });

      it('should include selector attempts table', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'html' });

        expect(result).toContain('<h2>Selector Attempts</h2>');
        expect(result).toContain('<code>main</code>');
      });

      it('should include content statistics', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'html' });

        expect(result).toContain('<h2>Content Statistics</h2>');
        expect(result).toContain('5,000');
        expect(result).toContain('Text Characters');
      });
    });

    describe('JSON format', () => {
      it('should return valid JSON', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'json' });

        expect(() => JSON.parse(result)).not.toThrow();
      });

      it('should contain all trace properties', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'json' });
        const parsed = JSON.parse(result);

        expect(parsed.id).toBe(trace.id);
        expect(parsed.url).toBe(trace.url);
        expect(parsed.success).toBe(trace.success);
        expect(parsed.tiers).toBeDefined();
        expect(parsed.selectors).toBeDefined();
      });
    });

    describe('Color output', () => {
      it('should include ANSI codes when useColor is true', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'ascii', useColor: true });

        expect(result).toContain('\x1b[');
      });

      it('should not include ANSI codes when useColor is false', () => {
        const trace = createMockTrace();
        const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

        expect(result).not.toContain('\x1b[');
      });
    });
  });

  describe('createTraceSummaryCard', () => {
    it('should create bordered summary card', () => {
      const trace = createMockTrace();
      const result = createTraceSummaryCard(trace);

      expect(result).toContain('+');
      expect(result).toContain('=');
      expect(result).toContain('|');
    });

    it('should include status, tier, and duration', () => {
      const trace = createMockTrace();
      const result = createTraceSummaryCard(trace);

      expect(result).toContain('OK');
      expect(result).toContain('Lightweight');
      expect(result).toMatch(/\d+/);
    });

    it('should include domain', () => {
      const trace = createMockTrace();
      const result = createTraceSummaryCard(trace);

      expect(result).toContain('example.com');
    });

    it('should show error count for failed traces', () => {
      const trace = createFailedTrace();
      const result = createTraceSummaryCard(trace);

      expect(result).toContain('FAIL');
      expect(result).toContain('Errors: 2');
    });
  });

  describe('compareTraces', () => {
    it('should compare two traces side by side', () => {
      const trace1 = createMockTrace({ id: 'trace_1' });
      const trace2 = createMockTrace({ id: 'trace_2', durationMs: 2500 });
      const result = compareTraces(trace1, trace2, false);

      expect(result).toContain('Trace Comparison');
      expect(result).toContain('Trace 1');
      expect(result).toContain('Trace 2');
    });

    it('should show duration difference', () => {
      const trace1 = createMockTrace({ durationMs: 1000 });
      const trace2 = createMockTrace({ durationMs: 2000 });
      const result = compareTraces(trace1, trace2, false);

      expect(result).toContain('1000ms');
      expect(result).toContain('2000ms');
    });

    it('should highlight differences with marker', () => {
      const trace1 = createMockTrace({ success: true });
      const trace2 = createFailedTrace();
      const result = compareTraces(trace1, trace2, false);

      // Different values should have marker
      expect(result).toContain('Success');
      expect(result).toContain('Failure');
    });

    it('should compare tier information', () => {
      const trace1 = createMockTrace();
      const trace2 = createMockTrace({
        tiers: {
          attempts: [{ tier: 'playwright', success: true, durationMs: 5000 }],
          finalTier: 'playwright',
          fellBack: false,
        },
      });
      const result = compareTraces(trace1, trace2, false);

      expect(result).toContain('lightweight');
      expect(result).toContain('playwright');
    });

    it('should compare error counts', () => {
      const trace1 = createMockTrace();
      const trace2 = createFailedTrace();
      const result = compareTraces(trace1, trace2, false);

      expect(result).toContain('Errors');
      expect(result).toContain('0');
      expect(result).toContain('2');
    });
  });

  describe('Edge cases', () => {
    it('should handle trace with no selectors', () => {
      const trace = createMockTrace({
        selectors: {
          attempts: [],
          finalSelector: 'body',
          fallbackUsed: true,
        },
      });
      const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

      expect(result).toContain('Browse Trace');
      expect(result).not.toContain('Selector Attempts');
    });

    it('should handle trace with no network data', () => {
      const trace = createMockTrace();
      delete (trace as Record<string, unknown>).network;
      const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

      expect(result).toContain('Browse Trace');
      expect(result).not.toContain('Network Activity');
    });

    it('should handle trace with no skills', () => {
      const trace = createMockTrace();
      delete (trace as Record<string, unknown>).skills;
      const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

      expect(result).toContain('Browse Trace');
      expect(result).not.toContain('Skills');
    });

    it('should handle very long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(200);
      const trace = createMockTrace({ url: longUrl });
      const result = visualizeTrace(trace, { format: 'ascii', useColor: false, maxWidth: 80 });

      expect(result).toContain('example.com');
    });

    it('should handle trace with many tier attempts', () => {
      const trace = createMockTrace({
        tiers: {
          attempts: [
            { tier: 'intelligence', success: false, durationMs: 100, failureReason: 'Failed 1' },
            { tier: 'intelligence', success: false, durationMs: 150, failureReason: 'Failed 2' },
            { tier: 'lightweight', success: false, durationMs: 300, failureReason: 'Failed 3' },
            { tier: 'playwright', success: true, durationMs: 3000 },
          ],
          finalTier: 'playwright',
          fellBack: true,
        },
      });
      const result = visualizeTrace(trace, { format: 'ascii', useColor: false });

      expect(result).toContain('Tier Cascade');
      expect(result).toContain('4 attempted');
    });
  });

  describe('Format defaults', () => {
    it('should default to ascii format', () => {
      const trace = createMockTrace();
      const result = visualizeTrace(trace, { useColor: false });

      expect(result).toContain('Browse Trace');
      expect(result).toContain('Timeline');
    });

    it('should enable color by default for non-html', () => {
      const trace = createMockTrace();
      const result = visualizeTrace(trace, { format: 'ascii' });

      // Color codes should be present
      expect(result).toContain('\x1b[');
    });

    it('should disable color by default for html', () => {
      const trace = createMockTrace();
      const result = visualizeTrace(trace, { format: 'html' });

      // Should use CSS classes instead of ANSI
      expect(result).not.toContain('\x1b[');
      expect(result).toContain('class=');
    });
  });
});
