/**
 * Tests for SmartBrowser.browse() onProgress callback (DX-009)
 *
 * Tests the progress event system including:
 * - Progress events emitted at each stage
 * - Correct event data (stage, message, url, elapsedMs, percent)
 * - Error handling in callback (doesn't break browse)
 * - Progress events for tiered fetching path
 * - Progress events for Playwright path
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartBrowser, SmartBrowseResult } from '../../src/core/smart-browser.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import { SessionManager } from '../../src/core/session-manager.js';
import {
  BrowseProgressEvent,
  BrowseProgressStage,
  createProgressEvent,
  estimateProgressPercent,
} from '../../src/types/progress.js';

// Mock modules
vi.mock('../../src/core/content-intelligence.js', () => ({
  ContentIntelligence: class MockContentIntelligence {
    extract = vi.fn().mockResolvedValue({
      content: { title: 'Test', text: 'Content', markdown: '# Test' },
      meta: { strategy: 'static:html', confidence: 'high', timing: 100 },
      warnings: [],
    });
  },
}));

vi.mock('../../src/core/lightweight-renderer.js', () => ({
  LightweightRenderer: class MockLightweightRenderer {
    render = vi.fn().mockResolvedValue({
      html: '<html></html>',
      finalUrl: 'https://example.com',
      jsExecuted: false,
    });
  },
}));

vi.mock('../../src/utils/rate-limiter.js', () => ({
  rateLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Progress Event Types', () => {
  describe('createProgressEvent()', () => {
    it('creates a valid progress event', () => {
      const startTime = Date.now() - 1000;
      const event = createProgressEvent(
        'initializing',
        'Starting browse',
        'https://example.com',
        startTime,
        undefined,
        5
      );

      expect(event.stage).toBe('initializing');
      expect(event.message).toBe('Starting browse');
      expect(event.url).toBe('https://example.com');
      expect(event.elapsedMs).toBeGreaterThanOrEqual(1000);
      expect(event.percent).toBe(5);
    });

    it('includes details when provided', () => {
      const event = createProgressEvent(
        'tiered_fetching',
        'Trying tier',
        'https://example.com',
        Date.now(),
        { tier: 'intelligence', tiersAttempted: 1 }
      );

      expect(event.details).toEqual({
        tier: 'intelligence',
        tiersAttempted: 1,
      });
    });

    it('omits percent when undefined', () => {
      const event = createProgressEvent(
        'page_loading',
        'Loading',
        'https://example.com',
        Date.now()
      );

      expect(event).not.toHaveProperty('percent');
    });
  });

  describe('estimateProgressPercent()', () => {
    it('returns correct percentages for each stage', () => {
      const stages: BrowseProgressStage[] = [
        'initializing',
        'skill_matching',
        'tiered_fetching',
        'page_loading',
        'waiting',
        'skill_executing',
        'content_extracting',
        'validating',
        'pagination',
        'complete',
      ];

      const percentages = stages.map(estimateProgressPercent);

      // Verify percentages are increasing (except for pagination which is special)
      expect(percentages[0]).toBe(5);    // initializing
      expect(percentages[1]).toBe(10);   // skill_matching
      expect(percentages[2]).toBe(20);   // tiered_fetching
      expect(percentages[3]).toBe(40);   // page_loading
      expect(percentages[4]).toBe(50);   // waiting
      expect(percentages[5]).toBe(60);   // skill_executing
      expect(percentages[6]).toBe(75);   // content_extracting
      expect(percentages[7]).toBe(90);   // validating
      expect(percentages[8]).toBe(95);   // pagination
      expect(percentages[9]).toBe(100);  // complete
    });
  });
});

describe('SmartBrowser.browse() onProgress callback', () => {
  let smartBrowser: SmartBrowser;
  let browserManager: BrowserManager;
  let contentExtractor: ContentExtractor;
  let apiAnalyzer: ApiAnalyzer;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    browserManager = new BrowserManager();
    contentExtractor = new ContentExtractor();
    apiAnalyzer = new ApiAnalyzer();
    sessionManager = new SessionManager('./test-sessions');

    smartBrowser = new SmartBrowser(
      browserManager,
      contentExtractor,
      apiAnalyzer,
      sessionManager
    );

    // Mock the initialize to avoid loading actual engines
    vi.spyOn(smartBrowser, 'initialize').mockResolvedValue(undefined);
    await smartBrowser.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits initializing event at start of browse', async () => {
    const progressEvents: BrowseProgressEvent[] = [];

    // Mock the tiered fetcher to return quickly
    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content</body></html>',
      content: {
        title: 'Test',
        text: 'Content',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    await smartBrowser.browse('https://example.com', {
      onProgress: (event) => progressEvents.push(event),
      useSkills: false,
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0].stage).toBe('initializing');
    expect(progressEvents[0].message).toContain('example.com');
    expect(progressEvents[0].url).toBe('https://example.com');
  });

  it('emits tiered_fetching event when using tiered rendering', async () => {
    const progressEvents: BrowseProgressEvent[] = [];

    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content</body></html>',
      content: {
        title: 'Test',
        text: 'Content',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    await smartBrowser.browse('https://example.com', {
      onProgress: (event) => progressEvents.push(event),
      useSkills: false,
    });

    const tieredEvent = progressEvents.find(e => e.stage === 'tiered_fetching');
    expect(tieredEvent).toBeDefined();
    expect(tieredEvent?.message).toContain('lightweight');
  });

  it('emits complete event with tier info', async () => {
    const progressEvents: BrowseProgressEvent[] = [];

    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content here</body></html>',
      content: {
        title: 'Test',
        text: 'Content here',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    await smartBrowser.browse('https://example.com', {
      onProgress: (event) => progressEvents.push(event),
      useSkills: false,
    });

    const completeEvent = progressEvents.find(e => e.stage === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.percent).toBe(100);
    expect(completeEvent?.details?.tier).toBe('intelligence');
  });

  it('includes elapsed time in all events', async () => {
    const progressEvents: BrowseProgressEvent[] = [];

    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content</body></html>',
      content: {
        title: 'Test',
        text: 'Content',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    await smartBrowser.browse('https://example.com', {
      onProgress: (event) => progressEvents.push(event),
      useSkills: false,
    });

    for (const event of progressEvents) {
      expect(typeof event.elapsedMs).toBe('number');
      expect(event.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles callback errors gracefully', async () => {
    const errorCallback = vi.fn().mockImplementation(() => {
      throw new Error('Callback error');
    });

    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content</body></html>',
      content: {
        title: 'Test',
        text: 'Content',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    // Should not throw, even though callback throws
    const result = await smartBrowser.browse('https://example.com', {
      onProgress: errorCallback,
      useSkills: false,
    });

    expect(result).toBeDefined();
    expect(errorCallback).toHaveBeenCalled();
  });

  it('does not call callback when onProgress is undefined', async () => {
    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content</body></html>',
      content: {
        title: 'Test',
        text: 'Content',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    // Should work without error even without callback
    const result = await smartBrowser.browse('https://example.com', {
      useSkills: false,
    });

    expect(result).toBeDefined();
  });

  it('emits content_extracting and validating events', async () => {
    const progressEvents: BrowseProgressEvent[] = [];

    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Some content here for validation</body></html>',
      content: {
        title: 'Test',
        text: 'Some content here for validation',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    await smartBrowser.browse('https://example.com', {
      onProgress: (event) => progressEvents.push(event),
      useSkills: false,
      enableLearning: true,
      validateContent: true,
    });

    const stages = progressEvents.map(e => e.stage);
    expect(stages).toContain('content_extracting');
    // Validating should be emitted if enableLearning and validateContent are true
    expect(stages).toContain('validating');
  });

  it('emits events in logical order', async () => {
    const progressEvents: BrowseProgressEvent[] = [];

    vi.spyOn(smartBrowser.getTieredFetcher(), 'fetch').mockResolvedValue({
      success: true,
      html: '<html><head><title>Test</title></head><body>Content</body></html>',
      content: {
        title: 'Test',
        text: 'Content',
        markdown: '# Test',
      },
      finalUrl: 'https://example.com',
      tier: 'intelligence',
      fellBack: false,
      tiersAttempted: ['intelligence'],
      timing: { total: 100, perTier: { intelligence: 100 } },
      discoveredApis: [],
      networkRequests: [],
    } as any);

    await smartBrowser.browse('https://example.com', {
      onProgress: (event) => progressEvents.push(event),
      useSkills: false,
    });

    const stages = progressEvents.map(e => e.stage);

    // initializing should be first
    expect(stages[0]).toBe('initializing');

    // complete should be last
    expect(stages[stages.length - 1]).toBe('complete');

    // Percentages should be non-decreasing
    const percentages = progressEvents.map(e => e.percent ?? 0);
    for (let i = 1; i < percentages.length; i++) {
      expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
    }
  });
});
