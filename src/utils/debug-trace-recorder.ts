/**
 * Debug Trace Recorder (O-005)
 *
 * Records comprehensive debug traces for browsing operations to enable
 * failure reproduction and debugging. Traces are persisted to disk and
 * can be queried, exported, and replayed.
 *
 * Key features:
 * - Persistent storage with automatic retention policy
 * - Comprehensive trace data (tiers, selectors, network, errors)
 * - Query by domain, time range, error type
 * - Export for sharing/replay
 * - Enable/disable per domain or globally
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from './logger.js';
import type { DecisionTrace, TierAttempt, SelectorAttempt, TitleAttempt } from '../types/decision-trace.js';
import type { RenderTier, NetworkRequest } from '../types/index.js';

/**
 * Error information captured in a trace
 */
export interface TraceError {
  /** Error type classification */
  type: 'timeout' | 'network' | 'selector' | 'validation' | 'bot_challenge' | 'rate_limit' | 'auth' | 'unknown';

  /** Error message */
  message: string;

  /** Stack trace if available */
  stack?: string;

  /** Whether recovery was attempted */
  recoveryAttempted: boolean;

  /** Whether recovery succeeded */
  recoverySucceeded?: boolean;

  /** Timestamp when error occurred */
  timestamp: number;
}

/**
 * Validation result captured in a trace
 */
export interface TraceValidation {
  /** Whether content passed validation */
  valid: boolean;

  /** Reasons for validation result */
  reasons: string[];

  /** Validators that were applied */
  validatorsApplied: string[];

  /** Content length at validation time */
  contentLength: number;
}

/**
 * Network activity captured in a trace
 */
export interface TraceNetwork {
  /** Total requests made */
  requestCount: number;

  /** API requests discovered */
  apiRequests: Array<{
    url: string;
    method: string;
    status?: number;
    duration?: number;
  }>;

  /** Failed requests */
  failedRequests: Array<{
    url: string;
    status?: number;
    error?: string;
  }>;

  /** Total bytes transferred */
  bytesTransferred?: number;
}

/**
 * Complete debug trace for a browse operation
 */
export interface DebugTrace {
  /** Unique trace ID */
  id: string;

  /** Timestamp when trace was created */
  timestamp: number;

  /** Target URL */
  url: string;

  /** Domain extracted from URL */
  domain: string;

  /** Final URL after redirects */
  finalUrl: string;

  /** Total operation duration in ms */
  durationMs: number;

  /** Whether the operation succeeded */
  success: boolean;

  /** Rendering tier decisions */
  tiers: {
    /** All tiers attempted */
    attempts: TierAttempt[];

    /** Final tier used */
    finalTier: RenderTier;

    /** Whether fallback occurred */
    fellBack: boolean;

    /** Budget constraints applied */
    budget?: {
      maxLatencyMs?: number;
      maxCostTier?: RenderTier;
      latencyExceeded: boolean;
      tiersSkipped: RenderTier[];
    };
  };

  /** Selector extraction decisions */
  selectors: {
    /** All selectors tried */
    attempts: SelectorAttempt[];

    /** Final selector used */
    finalSelector: string;

    /** Whether fallback to body was used */
    fallbackUsed: boolean;
  };

  /** Title extraction decisions */
  title: {
    /** All title sources tried */
    attempts: TitleAttempt[];

    /** Final title value */
    value?: string;

    /** Source of final title */
    source: string;
  };

  /** Validation results */
  validation?: TraceValidation;

  /** Network activity */
  network?: TraceNetwork;

  /** Errors encountered */
  errors: TraceError[];

  /** Content extraction results */
  content: {
    /** Length of extracted text */
    textLength: number;

    /** Length of markdown */
    markdownLength: number;

    /** Number of tables extracted */
    tableCount: number;

    /** Number of APIs discovered */
    apiCount: number;
  };

  /** Skill/procedural memory info */
  skills?: {
    /** Skills that matched */
    matched: string[];

    /** Skill that was applied */
    applied?: string;

    /** Whether trajectory was recorded */
    trajectoryRecorded: boolean;
  };

  /** Anomaly detection results */
  anomaly?: {
    /** Type of anomaly detected */
    type: string;

    /** Suggested action */
    action: string;

    /** Detection confidence */
    confidence: number;
  };

  /** Additional metadata */
  metadata: {
    /** User agent used */
    userAgent?: string;

    /** Session profile used */
    sessionProfile?: string;

    /** Whether session was loaded */
    sessionLoaded: boolean;

    /** Options passed to browse */
    options: Record<string, unknown>;
  };
}

/**
 * Query filter for searching traces
 */
export interface TraceQuery {
  /** Filter by domain */
  domain?: string;

  /** Filter by URL pattern (regex) */
  urlPattern?: string;

  /** Filter by time range (start) */
  startTime?: number;

  /** Filter by time range (end) */
  endTime?: number;

  /** Filter by success/failure */
  success?: boolean;

  /** Filter by error type */
  errorType?: TraceError['type'];

  /** Filter by tier used */
  tier?: RenderTier;

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Recording configuration
 */
export interface RecordingConfig {
  /** Whether recording is enabled globally */
  enabled: boolean;

  /** Domains to always record (even if disabled globally) */
  alwaysRecordDomains: string[];

  /** Domains to never record (even if enabled globally) */
  neverRecordDomains: string[];

  /** Only record failures */
  onlyRecordFailures: boolean;

  /** Maximum traces to retain */
  maxTraces: number;

  /** Maximum age of traces in hours */
  maxAgeHours: number;

  /** Maximum storage size in bytes */
  maxStorageBytes: number;
}

/**
 * Trace storage statistics
 */
export interface TraceStats {
  /** Total traces stored */
  totalTraces: number;

  /** Traces by domain */
  byDomain: Record<string, number>;

  /** Traces by tier */
  byTier: Record<string, number>;

  /** Success vs failure counts */
  successCount: number;
  failureCount: number;

  /** Storage size in bytes */
  storageSizeBytes: number;

  /** Oldest trace timestamp */
  oldestTrace?: number;

  /** Newest trace timestamp */
  newestTrace?: number;
}

/**
 * Default recording configuration
 */
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  enabled: false, // Disabled by default to avoid overhead
  alwaysRecordDomains: [],
  neverRecordDomains: [],
  onlyRecordFailures: false,
  maxTraces: 1000,
  maxAgeHours: 168, // 7 days
  maxStorageBytes: 100 * 1024 * 1024, // 100MB
};

/**
 * DebugTraceRecorder - Records and manages debug traces
 */
export class DebugTraceRecorder {
  private traceDir: string;
  private config: RecordingConfig;
  private traceIndex: Map<string, { timestamp: number; domain: string; success: boolean }> = new Map();
  private initialized = false;

  constructor(traceDir: string = './debug-traces', config: Partial<RecordingConfig> = {}) {
    this.traceDir = path.resolve(traceDir);
    // Deep copy to avoid mutating shared arrays in DEFAULT_RECORDING_CONFIG
    this.config = {
      ...DEFAULT_RECORDING_CONFIG,
      alwaysRecordDomains: [...DEFAULT_RECORDING_CONFIG.alwaysRecordDomains],
      neverRecordDomains: [...DEFAULT_RECORDING_CONFIG.neverRecordDomains],
      ...config,
      // Ensure config arrays are also copied
      ...(config.alwaysRecordDomains && { alwaysRecordDomains: [...config.alwaysRecordDomains] }),
      ...(config.neverRecordDomains && { neverRecordDomains: [...config.neverRecordDomains] }),
    };
  }

  /**
   * Initialize the recorder (load index from disk)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.traceDir, { recursive: true });
      await this.loadIndex();
      await this.enforceRetention();
      this.initialized = true;
      logger.server.debug('DebugTraceRecorder initialized', { traceDir: this.traceDir });
    } catch (error) {
      logger.server.error('Failed to initialize DebugTraceRecorder', { error });
      throw error;
    }
  }

  /**
   * Check if recording should occur for a given domain and success state
   */
  shouldRecord(domain: string, success: boolean): boolean {
    // Check never-record list first
    if (this.config.neverRecordDomains.includes(domain)) {
      return false;
    }

    // Check always-record list
    if (this.config.alwaysRecordDomains.includes(domain)) {
      return true;
    }

    // Check global enable
    if (!this.config.enabled) {
      return false;
    }

    // Check failure-only mode
    if (this.config.onlyRecordFailures && success) {
      return false;
    }

    return true;
  }

  /**
   * Record a debug trace
   */
  async record(trace: DebugTrace): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.shouldRecord(trace.domain, trace.success)) {
      return;
    }

    const filePath = this.getTracePath(trace.id);

    try {
      await fs.writeFile(filePath, JSON.stringify(trace, null, 2), 'utf-8');

      // Update index
      this.traceIndex.set(trace.id, {
        timestamp: trace.timestamp,
        domain: trace.domain,
        success: trace.success,
      });

      logger.server.debug('Recorded debug trace', {
        id: trace.id,
        domain: trace.domain,
        success: trace.success,
      });

      // Enforce retention limits
      await this.enforceRetention();
    } catch (error) {
      logger.server.error('Failed to record debug trace', { error, traceId: trace.id });
    }
  }

  /**
   * Get a trace by ID
   */
  async getTrace(id: string): Promise<DebugTrace | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const filePath = this.getTracePath(id);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as DebugTrace;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Query traces with filters
   */
  async query(filter: TraceQuery = {}): Promise<DebugTrace[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    const results: DebugTrace[] = [];

    // Get matching trace IDs from index
    const matchingIds: string[] = [];

    for (const [id, meta] of this.traceIndex.entries()) {
      // Apply index-level filters
      if (filter.domain && meta.domain !== filter.domain) continue;
      if (filter.startTime && meta.timestamp < filter.startTime) continue;
      if (filter.endTime && meta.timestamp > filter.endTime) continue;
      if (filter.success !== undefined && meta.success !== filter.success) continue;

      matchingIds.push(id);
    }

    // Sort by timestamp descending (newest first)
    matchingIds.sort((a, b) => {
      const aTime = this.traceIndex.get(a)?.timestamp ?? 0;
      const bTime = this.traceIndex.get(b)?.timestamp ?? 0;
      return bTime - aTime;
    });

    // Apply pagination at index level
    const paginatedIds = matchingIds.slice(offset, offset + limit);

    // Load and filter full traces
    for (const id of paginatedIds) {
      const trace = await this.getTrace(id);
      if (!trace) continue;

      // Apply full-trace filters
      if (filter.urlPattern) {
        const regex = new RegExp(filter.urlPattern);
        if (!regex.test(trace.url)) continue;
      }

      if (filter.errorType && !trace.errors.some(e => e.type === filter.errorType)) {
        continue;
      }

      if (filter.tier && trace.tiers.finalTier !== filter.tier) {
        continue;
      }

      results.push(trace);
    }

    return results;
  }

  /**
   * Get trace statistics
   */
  async getStats(): Promise<TraceStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    const byDomain: Record<string, number> = {};
    const byTier: Record<string, number> = {};
    let successCount = 0;
    let failureCount = 0;
    let oldestTrace: number | undefined;
    let newestTrace: number | undefined;

    for (const meta of this.traceIndex.values()) {
      byDomain[meta.domain] = (byDomain[meta.domain] ?? 0) + 1;

      if (meta.success) {
        successCount++;
      } else {
        failureCount++;
      }

      if (!oldestTrace || meta.timestamp < oldestTrace) {
        oldestTrace = meta.timestamp;
      }
      if (!newestTrace || meta.timestamp > newestTrace) {
        newestTrace = meta.timestamp;
      }
    }

    // Calculate tier distribution (requires loading traces)
    const recentTraces = await this.query({ limit: 100 });
    for (const trace of recentTraces) {
      const tier = trace.tiers.finalTier;
      byTier[tier] = (byTier[tier] ?? 0) + 1;
    }

    // Calculate storage size
    let storageSizeBytes = 0;
    try {
      const files = await fs.readdir(this.traceDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const stat = await fs.stat(path.join(this.traceDir, file));
          storageSizeBytes += stat.size;
        }
      }
    } catch {
      // Ignore errors
    }

    return {
      totalTraces: this.traceIndex.size,
      byDomain,
      byTier,
      successCount,
      failureCount,
      storageSizeBytes,
      oldestTrace,
      newestTrace,
    };
  }

  /**
   * Delete a trace by ID
   */
  async deleteTrace(id: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    const filePath = this.getTracePath(id);

    try {
      await fs.unlink(filePath);
      this.traceIndex.delete(id);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.traceIndex.delete(id);
        return false;
      }
      throw error;
    }
  }

  /**
   * Clear all traces
   */
  async clearAll(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    const count = this.traceIndex.size;

    for (const id of this.traceIndex.keys()) {
      await this.deleteTrace(id);
    }

    return count;
  }

  /**
   * Export traces for sharing/replay
   */
  async exportTraces(ids: string[]): Promise<{ traces: DebugTrace[]; exportedAt: number }> {
    const traces: DebugTrace[] = [];

    for (const id of ids) {
      const trace = await this.getTrace(id);
      if (trace) {
        traces.push(trace);
      }
    }

    return {
      traces,
      exportedAt: Date.now(),
    };
  }

  /**
   * Update recording configuration
   */
  updateConfig(config: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...config };
    logger.server.debug('Updated recording config', { config: this.config });
  }

  /**
   * Get current recording configuration
   */
  getConfig(): RecordingConfig {
    return { ...this.config };
  }

  /**
   * Enable recording globally
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable recording globally
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Add domain to always-record list
   */
  alwaysRecord(domain: string): void {
    if (!this.config.alwaysRecordDomains.includes(domain)) {
      this.config.alwaysRecordDomains.push(domain);
    }
    // Remove from never-record if present
    const idx = this.config.neverRecordDomains.indexOf(domain);
    if (idx >= 0) {
      this.config.neverRecordDomains.splice(idx, 1);
    }
  }

  /**
   * Add domain to never-record list
   */
  neverRecord(domain: string): void {
    if (!this.config.neverRecordDomains.includes(domain)) {
      this.config.neverRecordDomains.push(domain);
    }
    // Remove from always-record if present
    const idx = this.config.alwaysRecordDomains.indexOf(domain);
    if (idx >= 0) {
      this.config.alwaysRecordDomains.splice(idx, 1);
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getTracePath(id: string): string {
    return path.join(this.traceDir, `${id}.json`);
  }

  private async loadIndex(): Promise<void> {
    try {
      const files = await fs.readdir(this.traceDir);

      for (const file of files) {
        if (!file.endsWith('.json') || file === 'index.json') continue;

        const id = file.replace('.json', '');
        const filePath = path.join(this.traceDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const trace = JSON.parse(content) as DebugTrace;

          this.traceIndex.set(id, {
            timestamp: trace.timestamp,
            domain: trace.domain,
            success: trace.success,
          });
        } catch {
          // Skip invalid files
          logger.server.warn('Skipping invalid trace file', { file });
        }
      }

      logger.server.debug('Loaded trace index', { count: this.traceIndex.size });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async enforceRetention(): Promise<void> {
    const now = Date.now();
    const maxAgeMs = this.config.maxAgeHours * 60 * 60 * 1000;
    const idsToDelete: string[] = [];

    // Find traces to delete by age
    for (const [id, meta] of this.traceIndex.entries()) {
      if (now - meta.timestamp > maxAgeMs) {
        idsToDelete.push(id);
      }
    }

    // Find traces to delete by count
    if (this.traceIndex.size - idsToDelete.length > this.config.maxTraces) {
      // Sort by timestamp and mark oldest for deletion
      const sortedIds = Array.from(this.traceIndex.entries())
        .filter(([id]) => !idsToDelete.includes(id))
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .map(([id]) => id);

      const toRemove = sortedIds.slice(0, this.traceIndex.size - this.config.maxTraces - idsToDelete.length);
      idsToDelete.push(...toRemove);
    }

    // Delete marked traces
    for (const id of idsToDelete) {
      await this.deleteTrace(id);
    }

    if (idsToDelete.length > 0) {
      logger.server.debug('Enforced trace retention', { deleted: idsToDelete.length });
    }
  }
}

/**
 * Create a debug trace from browse operation data
 */
export function createDebugTrace(
  url: string,
  finalUrl: string,
  success: boolean,
  durationMs: number,
  data: {
    decisionTrace?: DecisionTrace;
    network?: NetworkRequest[];
    errors?: Array<{ type: string; message: string; stack?: string }>;
    validation?: { valid: boolean; reasons: string[] };
    content?: { text: string; markdown: string; tables: number; apis: number };
    skills?: { matched: string[]; applied?: string; trajectoryRecorded: boolean };
    anomaly?: { type: string; action: string; confidence: number };
    options?: Record<string, unknown>;
    sessionProfile?: string;
    sessionLoaded?: boolean;
    tier?: RenderTier;
    fellBack?: boolean;
    tiersAttempted?: RenderTier[];
    budget?: {
      maxLatencyMs?: number;
      maxCostTier?: RenderTier;
      latencyExceeded: boolean;
      tiersSkipped: RenderTier[];
    };
  }
): DebugTrace {
  const id = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const domain = new URL(url).hostname;
  const now = Date.now();

  return {
    id,
    timestamp: now,
    url,
    domain,
    finalUrl,
    durationMs,
    success,
    tiers: {
      attempts: data.decisionTrace?.tiers ?? [],
      finalTier: data.tier ?? data.decisionTrace?.summary.finalTier ?? 'playwright',
      fellBack: data.fellBack ?? false,
      budget: data.budget,
    },
    selectors: {
      attempts: data.decisionTrace?.selectors ?? [],
      finalSelector: data.decisionTrace?.summary.finalSelector ?? 'body',
      fallbackUsed: data.decisionTrace?.summary.fallbackUsed ?? false,
    },
    title: {
      attempts: data.decisionTrace?.title ?? [],
      value: undefined, // Filled from content extraction
      source: data.decisionTrace?.summary.finalTitleSource ?? 'unknown',
    },
    validation: data.validation
      ? {
          valid: data.validation.valid,
          reasons: data.validation.reasons,
          validatorsApplied: [],
          contentLength: data.content?.text.length ?? 0,
        }
      : undefined,
    network: data.network
      ? {
          requestCount: data.network.length,
          apiRequests: data.network
            .filter(r => r.url.includes('/api/') || r.contentType?.includes('json'))
            .map(r => ({
              url: r.url,
              method: r.method,
              status: r.status,
              duration: undefined,
            })),
          failedRequests: data.network
            .filter(r => r.status && r.status >= 400)
            .map(r => ({
              url: r.url,
              status: r.status,
            })),
        }
      : undefined,
    errors: (data.errors ?? []).map(e => ({
      type: ['timeout', 'network', 'selector', 'validation', 'bot_challenge', 'rate_limit', 'auth', 'unknown'].includes(e.type) ? (e.type as TraceError['type']) : 'unknown',
      message: e.message,
      stack: e.stack,
      recoveryAttempted: false,
      timestamp: now,
    })),
    content: {
      textLength: data.content?.text.length ?? 0,
      markdownLength: data.content?.markdown.length ?? 0,
      tableCount: data.content?.tables ?? 0,
      apiCount: data.content?.apis ?? 0,
    },
    skills: data.skills,
    anomaly: data.anomaly,
    metadata: {
      sessionProfile: data.sessionProfile,
      sessionLoaded: data.sessionLoaded ?? false,
      options: data.options ?? {},
    },
  };
}

/**
 * Global debug trace recorder instance
 */
let globalRecorder: DebugTraceRecorder | null = null;

/**
 * Get or create the global debug trace recorder
 */
export function getDebugTraceRecorder(traceDir?: string): DebugTraceRecorder {
  if (!globalRecorder) {
    globalRecorder = new DebugTraceRecorder(traceDir);
  }
  return globalRecorder;
}

/**
 * Reset the global recorder (for testing)
 */
export function resetDebugTraceRecorder(): void {
  globalRecorder = null;
}
