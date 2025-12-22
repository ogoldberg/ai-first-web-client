/**
 * Tests for ContentChangeTracker - Persistent tracking of website content changes
 *
 * Tests cover:
 * - URL tracking and fingerprinting
 * - Change detection
 * - History tracking
 * - Persistence
 * - Statistics
 * - Filtering and listing
 *
 * Part of F-003: Content Change Detection Alerts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ContentChangeTracker,
  createContentChangeTracker,
  type TrackedUrl,
  type ChangeRecord,
  type CheckResult,
  type TrackerStats,
} from '../../src/utils/content-change-tracker.js';

describe('ContentChangeTracker', () => {
  let testDir: string;
  let storagePath: string;

  // Sample content for testing
  const sampleContent1 = `
# Welcome to Example Site

This is the main content of the page.
It contains multiple paragraphs.

## Section 1

Some content in section 1.
- List item 1
- List item 2
- List item 3

## Section 2

More content in section 2.

| Header 1 | Header 2 |
|----------|----------|
| Value 1  | Value 2  |
`;

  const sampleContent2 = `
# Welcome to Example Site

This is the updated main content of the page.
It contains multiple paragraphs with some changes.

## Section 1

Updated content in section 1.
- List item 1
- List item 2
- List item 3
- List item 4

## Section 2

More content in section 2.

## Section 3 (New)

This is a new section that was added.

| Header 1 | Header 2 |
|----------|----------|
| Value 1  | Value 2  |
`;

  const sampleContent3 = `
# Completely Different Page

This is totally different content.
`;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `content-change-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    storagePath = path.join(testDir, 'content-changes.json');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================
  // BASIC OPERATIONS
  // ============================================
  describe('Basic Operations', () => {
    it('should create tracker with default config', () => {
      const tracker = createContentChangeTracker({ storagePath });
      expect(tracker).toBeInstanceOf(ContentChangeTracker);
    });

    it('should initialize with empty state', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const stats = await tracker.getStats();
      expect(stats.totalTracked).toBe(0);
      expect(stats.totalChanges).toBe(0);
    });
  });

  // ============================================
  // URL TRACKING
  // ============================================
  describe('URL Tracking', () => {
    it('should track a URL with fingerprint', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      const tracked = await tracker.trackUrl(url, sampleContent1);

      expect(tracked.url).toBe(url);
      expect(tracked.domain).toBe('example.com');
      expect(tracked.fingerprint.hash).toBeDefined();
      expect(tracked.fingerprint.textLength).toBeGreaterThan(0);
      expect(tracked.fingerprint.wordCount).toBeGreaterThan(0);
      expect(tracked.checkCount).toBe(1);
      expect(tracked.changeCount).toBe(0);
    });

    it('should track URL with label and tags', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://gov.example.com/visa';

      const tracked = await tracker.trackUrl(url, sampleContent1, {
        label: 'Visa Requirements',
        tags: ['government', 'visa', 'immigration'],
      });

      expect(tracked.label).toBe('Visa Requirements');
      expect(tracked.tags).toEqual(['government', 'visa', 'immigration']);
    });

    it('should update existing tracking', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      const tracked = await tracker.trackUrl(url, sampleContent1, {
        label: 'Updated Label',
      });

      expect(tracked.checkCount).toBe(2);
      expect(tracked.label).toBe('Updated Label');
    });

    it('should report if URL is tracked', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      expect(await tracker.isTracking(url)).toBe(false);
      await tracker.trackUrl(url, sampleContent1);
      expect(await tracker.isTracking(url)).toBe(true);
    });

    it('should untrack a URL', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      expect(await tracker.isTracking(url)).toBe(true);

      const result = await tracker.untrackUrl(url);
      expect(result).toBe(true);
      expect(await tracker.isTracking(url)).toBe(false);
    });

    it('should return false when untracking non-tracked URL', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const result = await tracker.untrackUrl('https://example.com/not-tracked');
      expect(result).toBe(false);
    });
  });

  // ============================================
  // CHANGE DETECTION
  // ============================================
  describe('Change Detection', () => {
    it('should detect no change when content is same', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      const result = await tracker.checkForChanges(url, sampleContent1);

      expect(result.isTracked).toBe(true);
      expect(result.hasChanged).toBe(false);
      expect(result.isFirstCheck).toBe(false);
    });

    it('should detect change when content differs', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      const result = await tracker.checkForChanges(url, sampleContent2);

      expect(result.isTracked).toBe(true);
      expect(result.hasChanged).toBe(true);
      expect(result.changeReport).toBeDefined();
      expect(result.changeReport?.hasChanges).toBe(true);
      expect(result.changeReport?.summary).toBeDefined();
    });

    it('should return isFirstCheck for untracked URL', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/new-page';

      const result = await tracker.checkForChanges(url, sampleContent1);

      expect(result.isTracked).toBe(false);
      expect(result.isFirstCheck).toBe(true);
    });

    it('should increment checkCount on each check', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      await tracker.checkForChanges(url, sampleContent1);
      await tracker.checkForChanges(url, sampleContent1);

      const tracked = await tracker.getTrackedUrl(url);
      expect(tracked?.checkCount).toBe(3); // 1 from track + 2 from checks
    });

    it('should increment changeCount when change detected', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      await tracker.checkForChanges(url, sampleContent2);
      await tracker.checkForChanges(url, sampleContent3);

      const tracked = await tracker.getTrackedUrl(url);
      expect(tracked?.changeCount).toBe(2);
    });

    it('should classify change significance', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      const result = await tracker.checkForChanges(url, sampleContent3); // Major change

      expect(result.changeReport?.overallSignificance).toBe('high');
    });
  });

  // ============================================
  // CHANGE HISTORY
  // ============================================
  describe('Change History', () => {
    it('should record changes in history', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      await tracker.checkForChanges(url, sampleContent2);

      const history = await tracker.getChangeHistory();
      expect(history.length).toBe(1);
      expect(history[0].url).toBe(url);
      expect(history[0].significance).toBeDefined();
    });

    it('should filter history by URL', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url1 = 'https://example.com/page1';
      const url2 = 'https://example.com/page2';

      await tracker.trackUrl(url1, sampleContent1);
      await tracker.trackUrl(url2, sampleContent1);
      await tracker.checkForChanges(url1, sampleContent2);
      await tracker.checkForChanges(url2, sampleContent2);

      const history = await tracker.getChangeHistory(url1);
      expect(history.length).toBe(1);
      expect(history[0].url).toBe(url1);
    });

    it('should limit history entries', async () => {
      const tracker = createContentChangeTracker({
        storagePath,
        maxHistoryEntries: 5,
      });
      const url = 'https://example.com/page1';

      // Generate more than 5 changes
      await tracker.trackUrl(url, sampleContent1);
      for (let i = 0; i < 10; i++) {
        await tracker.checkForChanges(url, sampleContent1 + `\n\nChange ${i}`);
      }

      const history = await tracker.getChangeHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should maintain history order (most recent first)', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker.trackUrl(url, sampleContent1);
      await tracker.checkForChanges(url, sampleContent2);
      await new Promise(r => setTimeout(r, 10)); // Small delay
      await tracker.checkForChanges(url, sampleContent3);

      const history = await tracker.getChangeHistory();
      expect(history.length).toBe(2);
      expect(history[0].timestamp).toBeGreaterThan(history[1].timestamp);
    });
  });

  // ============================================
  // LISTING AND FILTERING
  // ============================================
  describe('Listing and Filtering', () => {
    it('should list all tracked URLs', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.trackUrl('https://example.com/page2', sampleContent1);
      await tracker.trackUrl('https://other.com/page', sampleContent1);

      const urls = await tracker.listTrackedUrls();
      expect(urls.length).toBe(3);
    });

    it('should filter by domain', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.trackUrl('https://example.com/page2', sampleContent1);
      await tracker.trackUrl('https://other.com/page', sampleContent1);

      const urls = await tracker.listTrackedUrls({ domain: 'example.com' });
      expect(urls.length).toBe(2);
    });

    it('should filter by tags', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1, {
        tags: ['government', 'visa'],
      });
      await tracker.trackUrl('https://example.com/page2', sampleContent1, {
        tags: ['government', 'passport'],
      });
      await tracker.trackUrl('https://other.com/page', sampleContent1, {
        tags: ['commercial'],
      });

      const urls = await tracker.listTrackedUrls({ tags: ['government'] });
      expect(urls.length).toBe(2);
    });

    it('should filter by hasChanges', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.trackUrl('https://example.com/page2', sampleContent1);
      await tracker.checkForChanges('https://example.com/page1', sampleContent2);

      const changedUrls = await tracker.listTrackedUrls({ hasChanges: true });
      expect(changedUrls.length).toBe(1);
      expect(changedUrls[0].url).toBe('https://example.com/page1');

      const unchangedUrls = await tracker.listTrackedUrls({ hasChanges: false });
      expect(unchangedUrls.length).toBe(1);
      expect(unchangedUrls[0].url).toBe('https://example.com/page2');
    });

    it('should apply limit', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      for (let i = 0; i < 10; i++) {
        await tracker.trackUrl(`https://example.com/page${i}`, sampleContent1);
      }

      const urls = await tracker.listTrackedUrls({ limit: 5 });
      expect(urls.length).toBe(5);
    });

    it('should get URLs by domain', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.trackUrl('https://example.com/page2', sampleContent1);
      await tracker.trackUrl('https://other.com/page', sampleContent1);

      const urls = await tracker.getUrlsByDomain('example.com');
      expect(urls.length).toBe(2);
    });
  });

  // ============================================
  // STATISTICS
  // ============================================
  describe('Statistics', () => {
    it('should compute statistics correctly', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.trackUrl('https://example.com/page2', sampleContent1);
      await tracker.checkForChanges('https://example.com/page1', sampleContent2);
      await tracker.checkForChanges('https://example.com/page1', sampleContent3);

      const stats = await tracker.getStats();

      expect(stats.totalTracked).toBe(2);
      expect(stats.urlsWithChanges).toBe(1);
      expect(stats.totalChanges).toBe(2);
      expect(stats.recentChanges.length).toBe(2);
    });

    it('should track changes by significance', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.checkForChanges('https://example.com/page1', sampleContent3); // High change

      const stats = await tracker.getStats();
      expect(stats.changesBySignificance.high).toBeGreaterThan(0);
    });
  });

  // ============================================
  // PERSISTENCE
  // ============================================
  describe('Persistence', () => {
    it('should persist tracking data', async () => {
      const tracker1 = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker1.trackUrl(url, sampleContent1, {
        label: 'Test Page',
        tags: ['test'],
      });
      await tracker1.flush();

      // Create new tracker with same storage path
      const tracker2 = createContentChangeTracker({ storagePath });
      const tracked = await tracker2.getTrackedUrl(url);

      expect(tracked).toBeDefined();
      expect(tracked?.url).toBe(url);
      expect(tracked?.label).toBe('Test Page');
      expect(tracked?.tags).toEqual(['test']);
    });

    it('should persist change history', async () => {
      const tracker1 = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/page1';

      await tracker1.trackUrl(url, sampleContent1);
      await tracker1.checkForChanges(url, sampleContent2);
      await tracker1.flush();

      // Create new tracker with same storage path
      const tracker2 = createContentChangeTracker({ storagePath });
      const history = await tracker2.getChangeHistory();

      expect(history.length).toBe(1);
      expect(history[0].url).toBe(url);
    });
  });

  // ============================================
  // CLEAR OPERATIONS
  // ============================================
  describe('Clear Operations', () => {
    it('should clear all tracking data', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      await tracker.trackUrl('https://example.com/page1', sampleContent1);
      await tracker.trackUrl('https://example.com/page2', sampleContent1);
      await tracker.checkForChanges('https://example.com/page1', sampleContent2);

      await tracker.clear();

      const stats = await tracker.getStats();
      expect(stats.totalTracked).toBe(0);
      expect(stats.totalChanges).toBe(0);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/empty';

      const tracked = await tracker.trackUrl(url, '');
      expect(tracked.fingerprint.textLength).toBe(0);
      // Empty string split by whitespace produces [''] which has length 1
      expect(tracked.fingerprint.wordCount).toBe(1);
    });

    it('should handle whitespace-only content', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/whitespace';

      const tracked = await tracker.trackUrl(url, '   \n\n   \t  ');
      expect(tracked.fingerprint.textLength).toBe(0);
    });

    it('should handle very long content', async () => {
      const tracker = createContentChangeTracker({ storagePath });
      const url = 'https://example.com/long';
      const longContent = 'x'.repeat(1000000); // 1MB of content

      const tracked = await tracker.trackUrl(url, longContent);
      expect(tracked.fingerprint.textLength).toBe(1000000);
    });

    it('should extract domain correctly from various URLs', async () => {
      const tracker = createContentChangeTracker({ storagePath });

      const testCases = [
        { url: 'https://example.com/page', expected: 'example.com' },
        { url: 'https://sub.example.com/page', expected: 'sub.example.com' },
        { url: 'http://example.com:8080/page', expected: 'example.com' },
        { url: 'https://example.com', expected: 'example.com' },
      ];

      for (const { url, expected } of testCases) {
        const tracked = await tracker.trackUrl(url, sampleContent1);
        expect(tracked.domain).toBe(expected);
        await tracker.untrackUrl(url);
      }
    });
  });
});
