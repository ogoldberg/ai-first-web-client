/**
 * Tests for Decision Trace Types (CX-003)
 *
 * Validates the decision trace system that allows LLM clients to:
 * - Understand which rendering tiers were attempted and why
 * - See which selectors were tried for content extraction
 * - Know what fallbacks were used and why
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyTrace,
  createTierAttempt,
  createSelectorAttempt,
  createTitleAttempt,
  computeTraceSummary,
  buildDecisionTrace,
  type TierAttempt,
  type SelectorAttempt,
  type TitleAttempt,
} from '../../src/types/decision-trace.js';

describe('decision-trace', () => {
  describe('createEmptyTrace', () => {
    it('should create an empty trace with default summary', () => {
      const trace = createEmptyTrace();

      expect(trace.tiers).toEqual([]);
      expect(trace.selectors).toEqual([]);
      expect(trace.title).toEqual([]);
      expect(trace.summary.tiersAttempted).toBe(0);
      expect(trace.summary.tiersFailed).toBe(0);
      expect(trace.summary.selectorsAttempted).toBe(0);
      expect(trace.summary.fallbackUsed).toBe(false);
    });
  });

  describe('createTierAttempt', () => {
    it('should create a successful tier attempt', () => {
      const attempt = createTierAttempt('intelligence', true, 150);

      expect(attempt.tier).toBe('intelligence');
      expect(attempt.success).toBe(true);
      expect(attempt.durationMs).toBe(150);
      expect(attempt.failureReason).toBeUndefined();
    });

    it('should create a failed tier attempt with reason', () => {
      const attempt = createTierAttempt('intelligence', false, 200, {
        failureReason: 'Content too short: 50 < 500',
        validationDetails: {
          contentLength: 50,
          hasSemanticMarkers: false,
        },
      });

      expect(attempt.tier).toBe('intelligence');
      expect(attempt.success).toBe(false);
      expect(attempt.durationMs).toBe(200);
      expect(attempt.failureReason).toBe('Content too short: 50 < 500');
      expect(attempt.validationDetails?.contentLength).toBe(50);
    });

    it('should include extraction strategy', () => {
      const attempt = createTierAttempt('intelligence', true, 100, {
        extractionStrategy: 'framework:nextjs',
      });

      expect(attempt.extractionStrategy).toBe('framework:nextjs');
    });
  });

  describe('createSelectorAttempt', () => {
    it('should create a selected selector attempt', () => {
      const attempt = createSelectorAttempt(
        'main',
        'main',
        true,
        5000,
        0.85,
        true
      );

      expect(attempt.selector).toBe('main');
      expect(attempt.source).toBe('main');
      expect(attempt.matched).toBe(true);
      expect(attempt.contentLength).toBe(5000);
      expect(attempt.confidenceScore).toBe(0.85);
      expect(attempt.selected).toBe(true);
      expect(attempt.skipReason).toBeUndefined();
    });

    it('should create a skipped selector attempt with reason', () => {
      const attempt = createSelectorAttempt(
        'article',
        'article',
        false,
        0,
        0.85,
        false,
        'No elements found'
      );

      expect(attempt.matched).toBe(false);
      expect(attempt.selected).toBe(false);
      expect(attempt.skipReason).toBe('No elements found');
    });

    it('should handle insufficient content', () => {
      const attempt = createSelectorAttempt(
        '[role="main"]',
        'role_main',
        true,
        50,
        0.80,
        false,
        'Insufficient content (50 chars)'
      );

      expect(attempt.matched).toBe(true);
      expect(attempt.contentLength).toBe(50);
      expect(attempt.selected).toBe(false);
      expect(attempt.skipReason).toBe('Insufficient content (50 chars)');
    });
  });

  describe('createTitleAttempt', () => {
    it('should create a selected title attempt', () => {
      const attempt = createTitleAttempt(
        'og_title',
        'meta[property="og:title"]',
        true,
        0.95,
        true,
        'Page Title'
      );

      expect(attempt.source).toBe('og_title');
      expect(attempt.selector).toBe('meta[property="og:title"]');
      expect(attempt.found).toBe(true);
      expect(attempt.value).toBe('Page Title');
      expect(attempt.confidenceScore).toBe(0.95);
      expect(attempt.selected).toBe(true);
    });

    it('should create a not-found title attempt', () => {
      const attempt = createTitleAttempt(
        'og_title',
        'meta[property="og:title"]',
        false,
        0.95,
        false
      );

      expect(attempt.found).toBe(false);
      expect(attempt.value).toBeUndefined();
      expect(attempt.selected).toBe(false);
    });
  });

  describe('computeTraceSummary', () => {
    it('should compute summary from tier attempts', () => {
      const tiers: TierAttempt[] = [
        createTierAttempt('intelligence', false, 100, { failureReason: 'Too short' }),
        createTierAttempt('lightweight', true, 200),
      ];

      const selectors: SelectorAttempt[] = [
        createSelectorAttempt('main', 'main', true, 5000, 0.85, true),
      ];

      const titles: TitleAttempt[] = [
        createTitleAttempt('title_tag', 'title', true, 0.85, true, 'Test'),
      ];

      const summary = computeTraceSummary(tiers, selectors, titles);

      expect(summary.tiersAttempted).toBe(2);
      expect(summary.tiersFailed).toBe(1);
      expect(summary.selectorsAttempted).toBe(1);
      expect(summary.fallbackUsed).toBe(false);
      expect(summary.finalTier).toBe('lightweight');
      expect(summary.finalSelector).toBe('main');
      expect(summary.finalTitleSource).toBe('title_tag');
    });

    it('should detect fallback usage', () => {
      const tiers: TierAttempt[] = [
        createTierAttempt('playwright', true, 3000),
      ];

      const selectors: SelectorAttempt[] = [
        createSelectorAttempt('main', 'main', false, 0, 0.85, false, 'No match'),
        createSelectorAttempt('body', 'body_fallback', true, 1000, 0.30, true),
      ];

      const titles: TitleAttempt[] = [
        createTitleAttempt('unknown', 'none', false, 0, true),
      ];

      const summary = computeTraceSummary(tiers, selectors, titles);

      expect(summary.fallbackUsed).toBe(true);
      expect(summary.finalSelector).toBe('body');
    });

    it('should handle empty traces', () => {
      const summary = computeTraceSummary([], [], []);

      expect(summary.tiersAttempted).toBe(0);
      expect(summary.tiersFailed).toBe(0);
      expect(summary.finalTier).toBe('playwright');
      expect(summary.finalSelector).toBe('body');
      expect(summary.finalTitleSource).toBe('unknown');
    });
  });

  describe('buildDecisionTrace', () => {
    it('should build a complete decision trace', () => {
      const tiers: TierAttempt[] = [
        createTierAttempt('intelligence', true, 150, {
          extractionStrategy: 'structured_data',
          validationDetails: {
            contentLength: 2000,
            hasSemanticMarkers: true,
          },
        }),
      ];

      const selectors: SelectorAttempt[] = [
        createSelectorAttempt('main', 'main', true, 2000, 0.85, true),
        createSelectorAttempt('article', 'article', false, 0, 0.85, false, 'No match'),
      ];

      const titles: TitleAttempt[] = [
        createTitleAttempt('og_title', 'meta[property="og:title"]', true, 0.95, true, 'Test Page'),
        createTitleAttempt('title_tag', 'title', true, 0.85, false, 'Test'),
      ];

      const trace = buildDecisionTrace(tiers, selectors, titles);

      expect(trace.tiers).toHaveLength(1);
      expect(trace.selectors).toHaveLength(2);
      expect(trace.title).toHaveLength(2);
      expect(trace.summary.tiersAttempted).toBe(1);
      expect(trace.summary.tiersFailed).toBe(0);
      expect(trace.summary.selectorsAttempted).toBe(2);
      expect(trace.summary.fallbackUsed).toBe(false);
      expect(trace.summary.finalTier).toBe('intelligence');
      expect(trace.summary.finalSelector).toBe('main');
      expect(trace.summary.finalTitleSource).toBe('og_title');
    });

    it('should correctly summarize a fallback scenario', () => {
      const tiers: TierAttempt[] = [
        createTierAttempt('intelligence', false, 100, { failureReason: 'Network error' }),
        createTierAttempt('lightweight', false, 200, { failureReason: 'JS error' }),
        createTierAttempt('playwright', true, 3000),
      ];

      const selectors: SelectorAttempt[] = [
        createSelectorAttempt('main', 'main', false, 0, 0.85, false, 'No match'),
        createSelectorAttempt('article', 'article', false, 0, 0.85, false, 'No match'),
        createSelectorAttempt('[role="main"]', 'role_main', false, 0, 0.80, false, 'No match'),
        createSelectorAttempt('.content', 'content_class', false, 0, 0.70, false, 'No match'),
        createSelectorAttempt('body', 'body_fallback', true, 5000, 0.30, true),
      ];

      const titles: TitleAttempt[] = [
        createTitleAttempt('h1', 'h1:first', true, 0.70, true, 'Page Heading'),
      ];

      const trace = buildDecisionTrace(tiers, selectors, titles);

      expect(trace.summary.tiersAttempted).toBe(3);
      expect(trace.summary.tiersFailed).toBe(2);
      expect(trace.summary.selectorsAttempted).toBe(5);
      expect(trace.summary.fallbackUsed).toBe(true);
      expect(trace.summary.finalTier).toBe('playwright');
      expect(trace.summary.finalSelector).toBe('body');
      expect(trace.summary.finalTitleSource).toBe('h1');
    });
  });
});
