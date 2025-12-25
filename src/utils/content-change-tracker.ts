/**
 * Content Change Tracker - Persistent tracking of website content changes
 *
 * Provides:
 * - Persistent fingerprint storage using PersistentStore
 * - URL tracking with change history
 * - Change detection with detailed reports
 * - Alert support for content changes
 *
 * Part of F-003: Content Change Detection Alerts
 */

import {
  type ContentFingerprint,
  type ChangeReport,
  createFingerprint,
  compareContent,
  hasContentChanged,
  getChangeSignificance,
} from './change-detector.js';
import {
  generateDiff,
  type DiffResult,
  type DiffOptions,
  type DiffStats,
} from './diff-generator.js';
import { PersistentStore, createPersistentStore } from './persistent-store.js';
import { logger } from './logger.js';

/**
 * A tracked URL with its fingerprint and metadata
 */
export interface TrackedUrl {
  /** The URL being tracked */
  url: string;

  /** Domain extracted from URL */
  domain: string;

  /** Current content fingerprint */
  fingerprint: ContentFingerprint;

  /** When tracking started */
  trackedSince: number;

  /** Last check timestamp */
  lastChecked: number;

  /** Number of times checked */
  checkCount: number;

  /** Number of times content changed */
  changeCount: number;

  /** Optional label for this tracked URL */
  label?: string;

  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * A record of a content change
 */
export interface ChangeRecord {
  /** The URL that changed */
  url: string;

  /** When the change was detected */
  timestamp: number;

  /** Previous fingerprint */
  previousFingerprint: ContentFingerprint;

  /** New fingerprint */
  newFingerprint: ContentFingerprint;

  /** Significance of the change */
  significance: 'low' | 'medium' | 'high';

  /** Summary of the change */
  summary: string;

  /** Number of sections added */
  sectionsAdded: number;

  /** Number of sections removed */
  sectionsRemoved: number;

  /** Number of sections modified */
  sectionsModified: number;

  /** Diff statistics (added in F-010) */
  diffStats?: DiffStats;
}

/**
 * Result of generating a diff between content versions
 */
export interface ContentDiffResult {
  /** The URL being compared */
  url: string;

  /** Whether there are any changes */
  hasChanges: boolean;

  /** Unified diff format string (like git diff) */
  unifiedDiff: string;

  /** Summary of changes */
  summary: string;

  /** Detailed statistics */
  stats: DiffStats;

  /** Full diff result for advanced usage */
  fullDiff: DiffResult;
}

/**
 * Stored data structure for persistence
 */
interface StoredData {
  /** Map of URL to tracked URL info */
  trackedUrls: Record<string, TrackedUrl>;

  /** Change history (most recent first) */
  changeHistory: ChangeRecord[];

  /** Maximum history entries to keep */
  maxHistoryEntries: number;
}

/**
 * Options for tracking a URL
 */
export interface TrackUrlOptions {
  /** Optional label for the tracked URL */
  label?: string;

  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Result of checking for content changes
 */
export interface CheckResult {
  /** Whether the URL is being tracked */
  isTracked: boolean;

  /** Whether content has changed since last check */
  hasChanged: boolean;

  /** Full change report if content changed */
  changeReport?: ChangeReport;

  /** The tracked URL info */
  trackedUrl?: TrackedUrl;

  /** Whether this is the first check (no previous fingerprint) */
  isFirstCheck: boolean;
}

/**
 * Statistics about tracked URLs
 */
export interface TrackerStats {
  /** Total number of tracked URLs */
  totalTracked: number;

  /** Number of URLs with at least one change */
  urlsWithChanges: number;

  /** Total changes detected */
  totalChanges: number;

  /** Changes by significance */
  changesBySignificance: {
    low: number;
    medium: number;
    high: number;
  };

  /** Most recently changed URLs */
  recentChanges: Array<{
    url: string;
    timestamp: number;
    significance: 'low' | 'medium' | 'high';
  }>;
}

/**
 * Configuration for ContentChangeTracker
 */
export interface ContentChangeTrackerConfig {
  /** Maximum history entries to keep (default: 1000) */
  maxHistoryEntries: number;

  /** Storage file path */
  storagePath: string;
}

const DEFAULT_CONFIG: ContentChangeTrackerConfig = {
  maxHistoryEntries: 1000,
  storagePath: './content-changes.json',
};

/**
 * ContentChangeTracker - Tracks content changes across URLs persistently
 */
export class ContentChangeTracker {
  private store: PersistentStore<StoredData>;
  private data: StoredData;
  private config: ContentChangeTrackerConfig;
  private initialized: boolean = false;

  constructor(config: Partial<ContentChangeTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = createPersistentStore<StoredData>(
      this.config.storagePath,
      'ContentChangeTracker'
    );
    this.data = {
      trackedUrls: {},
      changeHistory: [],
      maxHistoryEntries: this.config.maxHistoryEntries,
    };
  }

  /**
   * Initialize the tracker by loading stored data
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const stored = await this.store.load();
      if (stored) {
        this.data = {
          ...this.data,
          ...stored,
          maxHistoryEntries: this.config.maxHistoryEntries,
        };
        logger.server.debug('ContentChangeTracker: Loaded stored data', {
          trackedUrls: Object.keys(this.data.trackedUrls).length,
          historyEntries: this.data.changeHistory.length,
        });
      }
      this.initialized = true;
    } catch (error) {
      logger.server.error('ContentChangeTracker: Failed to load stored data', { error });
      this.initialized = true; // Continue with empty state
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Track a URL for content changes
   *
   * @param url - The URL to track
   * @param content - Current content of the page
   * @param options - Optional tracking options
   * @returns The tracked URL info
   */
  async trackUrl(
    url: string,
    content: string,
    options: TrackUrlOptions = {}
  ): Promise<TrackedUrl> {
    await this.initialize();

    const fingerprint = createFingerprint(content);
    const now = Date.now();
    const domain = this.extractDomain(url);

    const existing = this.data.trackedUrls[url];

    if (existing) {
      // Update existing tracking
      existing.fingerprint = fingerprint;
      existing.lastChecked = now;
      existing.checkCount++;
      if (options.label !== undefined) {
        existing.label = options.label;
      }
      if (options.tags !== undefined) {
        existing.tags = options.tags;
      }

      logger.server.debug('ContentChangeTracker: Updated tracking for URL', { url });
      await this.save();
      return existing;
    }

    // Create new tracking
    const tracked: TrackedUrl = {
      url,
      domain,
      fingerprint,
      trackedSince: now,
      lastChecked: now,
      checkCount: 1,
      changeCount: 0,
      label: options.label,
      tags: options.tags,
    };

    this.data.trackedUrls[url] = tracked;
    logger.server.info('ContentChangeTracker: Started tracking URL', { url, domain });
    await this.save();

    return tracked;
  }

  /**
   * Check if tracked content has changed
   *
   * @param url - The URL to check
   * @param currentContent - Current content of the page
   * @returns Check result with change details
   */
  async checkForChanges(url: string, currentContent: string): Promise<CheckResult> {
    await this.initialize();

    const tracked = this.data.trackedUrls[url];

    if (!tracked) {
      return {
        isTracked: false,
        hasChanged: false,
        isFirstCheck: true,
      };
    }

    const newFingerprint = createFingerprint(currentContent);
    const changed = hasContentChanged(tracked.fingerprint, newFingerprint);

    // Update check stats
    tracked.lastChecked = Date.now();
    tracked.checkCount++;

    if (!changed) {
      await this.save();
      return {
        isTracked: true,
        hasChanged: false,
        trackedUrl: tracked,
        isFirstCheck: false,
      };
    }

    // Content has changed - generate detailed report
    // Note: We need to reconstruct content for detailed comparison
    // Since we only store fingerprints, we provide a limited report
    const rawSignificance = getChangeSignificance(tracked.fingerprint, newFingerprint);
    // Since we only get here when hasContentChanged is true, 'none' shouldn't occur
    // But handle it as 'low' just in case
    const significance: 'low' | 'medium' | 'high' = rawSignificance === 'none' ? 'low' : rawSignificance;

    // Record the change
    const changeRecord: ChangeRecord = {
      url,
      timestamp: Date.now(),
      previousFingerprint: tracked.fingerprint,
      newFingerprint,
      significance,
      summary: this.generateChangeSummary(tracked.fingerprint, newFingerprint, significance),
      sectionsAdded: 0, // Would need content comparison
      sectionsRemoved: 0,
      sectionsModified: 0,
    };

    this.data.changeHistory.unshift(changeRecord);

    // Trim history if needed
    if (this.data.changeHistory.length > this.data.maxHistoryEntries) {
      this.data.changeHistory = this.data.changeHistory.slice(0, this.data.maxHistoryEntries);
    }

    // Update tracked URL
    tracked.fingerprint = newFingerprint;
    tracked.changeCount++;

    await this.save();

    logger.server.info('ContentChangeTracker: Content changed', {
      url,
      significance,
      changeCount: tracked.changeCount,
    });

    return {
      isTracked: true,
      hasChanged: true,
      trackedUrl: tracked,
      isFirstCheck: false,
      changeReport: {
        hasChanges: true,
        overallSignificance: significance,
        changes: [], // Would need content for detailed changes
        oldFingerprint: changeRecord.previousFingerprint,
        newFingerprint: changeRecord.newFingerprint,
        summary: changeRecord.summary,
      },
    };
  }

  /**
   * Check for changes with full content comparison
   *
   * @param url - The URL to check
   * @param previousContent - Previous content for detailed comparison
   * @param currentContent - Current content
   * @returns Check result with detailed change report
   */
  async checkWithDetailedComparison(
    url: string,
    previousContent: string,
    currentContent: string
  ): Promise<CheckResult> {
    await this.initialize();

    const tracked = this.data.trackedUrls[url];
    const newFingerprint = createFingerprint(currentContent);

    // Full content comparison
    const changeReport = compareContent(previousContent, currentContent);

    if (tracked) {
      tracked.lastChecked = Date.now();
      tracked.checkCount++;

      if (changeReport.hasChanges) {
        // Record the change
        const changeRecord: ChangeRecord = {
          url,
          timestamp: Date.now(),
          previousFingerprint: tracked.fingerprint,
          newFingerprint,
          significance: changeReport.overallSignificance as 'low' | 'medium' | 'high',
          summary: changeReport.summary,
          sectionsAdded: changeReport.changes.filter(c => c.type === 'added').length,
          sectionsRemoved: changeReport.changes.filter(c => c.type === 'removed').length,
          sectionsModified: changeReport.changes.filter(c => c.type === 'modified').length,
        };

        this.data.changeHistory.unshift(changeRecord);
        if (this.data.changeHistory.length > this.data.maxHistoryEntries) {
          this.data.changeHistory = this.data.changeHistory.slice(0, this.data.maxHistoryEntries);
        }

        tracked.fingerprint = newFingerprint;
        tracked.changeCount++;
      }

      await this.save();
    }

    return {
      isTracked: !!tracked,
      hasChanged: changeReport.hasChanges,
      changeReport,
      trackedUrl: tracked,
      isFirstCheck: !tracked,
    };
  }

  /**
   * Generate a change summary based on fingerprints
   */
  private generateChangeSummary(
    oldFingerprint: ContentFingerprint,
    newFingerprint: ContentFingerprint,
    significance: 'low' | 'medium' | 'high'
  ): string {
    const parts: string[] = [];

    if (oldFingerprint.structureHash !== newFingerprint.structureHash) {
      parts.push('structure changed');
    }

    const lengthDiff = newFingerprint.textLength - oldFingerprint.textLength;
    if (Math.abs(lengthDiff) > 100) {
      const direction = lengthDiff > 0 ? 'increased' : 'decreased';
      parts.push(`content ${direction} by ${Math.abs(lengthDiff)} characters`);
    }

    const wordDiff = newFingerprint.wordCount - oldFingerprint.wordCount;
    if (Math.abs(wordDiff) > 10) {
      const direction = wordDiff > 0 ? 'added' : 'removed';
      parts.push(`${Math.abs(wordDiff)} words ${direction}`);
    }

    if (parts.length === 0) {
      return `${significance} significance change detected`;
    }

    return `${significance.charAt(0).toUpperCase() + significance.slice(1)} change: ${parts.join(', ')}`;
  }

  /**
   * Stop tracking a URL
   *
   * @param url - The URL to stop tracking
   * @returns Whether the URL was being tracked
   */
  async untrackUrl(url: string): Promise<boolean> {
    await this.initialize();

    if (!this.data.trackedUrls[url]) {
      return false;
    }

    delete this.data.trackedUrls[url];
    logger.server.info('ContentChangeTracker: Stopped tracking URL', { url });
    await this.save();

    return true;
  }

  /**
   * Get a tracked URL's info
   *
   * @param url - The URL to get info for
   * @returns The tracked URL info or undefined
   */
  async getTrackedUrl(url: string): Promise<TrackedUrl | undefined> {
    await this.initialize();
    return this.data.trackedUrls[url];
  }

  /**
   * List all tracked URLs
   *
   * @param options - Filter options
   * @returns Array of tracked URLs
   */
  async listTrackedUrls(options: {
    domain?: string;
    tags?: string[];
    hasChanges?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<TrackedUrl[]> {
    await this.initialize();

    let urls = Object.values(this.data.trackedUrls);

    // Apply filters
    if (options.domain) {
      urls = urls.filter(u => u.domain === options.domain);
    }

    if (options.tags && options.tags.length > 0) {
      urls = urls.filter(u =>
        u.tags && options.tags!.some(tag => u.tags!.includes(tag))
      );
    }

    if (options.hasChanges !== undefined) {
      urls = urls.filter(u =>
        options.hasChanges ? u.changeCount > 0 : u.changeCount === 0
      );
    }

    // Sort by last checked (most recent first)
    urls.sort((a, b) => b.lastChecked - a.lastChecked);

    // Apply pagination
    if (options.offset) {
      urls = urls.slice(options.offset);
    }
    if (options.limit) {
      urls = urls.slice(0, options.limit);
    }

    return urls;
  }

  /**
   * Get change history for a URL or all URLs
   *
   * @param url - Optional URL to filter by
   * @param limit - Maximum entries to return
   * @returns Array of change records
   */
  async getChangeHistory(url?: string, limit: number = 50): Promise<ChangeRecord[]> {
    await this.initialize();

    let history = this.data.changeHistory;

    if (url) {
      history = history.filter(r => r.url === url);
    }

    return history.slice(0, limit);
  }

  /**
   * Get tracker statistics
   */
  async getStats(): Promise<TrackerStats> {
    await this.initialize();

    const urls = Object.values(this.data.trackedUrls);
    const history = this.data.changeHistory;

    const changesBySignificance = {
      low: 0,
      medium: 0,
      high: 0,
    };

    for (const record of history) {
      changesBySignificance[record.significance]++;
    }

    const recentChanges = history.slice(0, 10).map(r => ({
      url: r.url,
      timestamp: r.timestamp,
      significance: r.significance,
    }));

    return {
      totalTracked: urls.length,
      urlsWithChanges: urls.filter(u => u.changeCount > 0).length,
      totalChanges: history.length,
      changesBySignificance,
      recentChanges,
    };
  }

  /**
   * Clear all tracking data
   */
  async clear(): Promise<void> {
    await this.initialize();

    this.data = {
      trackedUrls: {},
      changeHistory: [],
      maxHistoryEntries: this.config.maxHistoryEntries,
    };

    await this.save();
    logger.server.info('ContentChangeTracker: Cleared all tracking data');
  }

  /**
   * Check if a URL is being tracked
   */
  async isTracking(url: string): Promise<boolean> {
    await this.initialize();
    return url in this.data.trackedUrls;
  }

  /**
   * Get URLs by domain
   */
  async getUrlsByDomain(domain: string): Promise<TrackedUrl[]> {
    await this.initialize();
    return Object.values(this.data.trackedUrls).filter(u => u.domain === domain);
  }

  /**
   * Flush pending writes
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }

  /**
   * Generate a line-by-line diff between two content versions
   *
   * This is the main method for F-010: Diff Generation.
   * It provides a unified diff format (like git diff) showing exactly what changed.
   *
   * @param oldContent - Previous content
   * @param newContent - Current content
   * @param url - URL for labeling (optional)
   * @param options - Diff generation options
   * @returns ContentDiffResult with unified diff and statistics
   */
  generateDiff(
    oldContent: string,
    newContent: string,
    url: string = 'content',
    options: DiffOptions = {}
  ): ContentDiffResult {
    const diffOptions: DiffOptions = {
      contextLines: 3,
      oldLabel: `${url} (previous)`,
      newLabel: `${url} (current)`,
      ...options,
    };

    const diff = generateDiff(oldContent, newContent, diffOptions);

    return {
      url,
      hasChanges: diff.hasChanges,
      unifiedDiff: diff.unifiedDiff,
      summary: diff.summary,
      stats: diff.stats,
      fullDiff: diff,
    };
  }

  /**
   * Check for changes and generate a diff if content has changed
   *
   * Combines change detection with diff generation for a complete
   * before/after comparison.
   *
   * @param url - The URL to check
   * @param previousContent - Previous content for comparison
   * @param currentContent - Current content
   * @param diffOptions - Options for diff generation
   * @returns Check result with optional diff
   */
  async checkAndDiff(
    url: string,
    previousContent: string,
    currentContent: string,
    diffOptions: DiffOptions = {}
  ): Promise<CheckResult & { diff?: ContentDiffResult }> {
    const result = await this.checkWithDetailedComparison(
      url,
      previousContent,
      currentContent
    );

    if (result.hasChanged) {
      const diff = this.generateDiff(
        previousContent,
        currentContent,
        url,
        diffOptions
      );
      return { ...result, diff };
    }

    return result;
  }

  /**
   * Save data to persistent storage
   */
  private async save(): Promise<void> {
    await this.store.save(this.data);
  }
}

// Singleton instance for global access
let globalTracker: ContentChangeTracker | null = null;

/**
 * Get the global ContentChangeTracker instance
 */
export function getContentChangeTracker(
  config?: Partial<ContentChangeTrackerConfig>
): ContentChangeTracker {
  if (!globalTracker) {
    globalTracker = new ContentChangeTracker(config);
  }
  return globalTracker;
}

/**
 * Create a new ContentChangeTracker instance (for testing)
 */
export function createContentChangeTracker(
  config?: Partial<ContentChangeTrackerConfig>
): ContentChangeTracker {
  return new ContentChangeTracker(config);
}
