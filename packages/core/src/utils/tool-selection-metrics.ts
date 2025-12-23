/**
 * Tool Selection Metrics (TC-010)
 *
 * Tracks tool selection patterns to measure the effectiveness of the
 * 5-tool interface consolidation. Helps identify:
 * - Which tools are most used
 * - Whether deprecated tools are still being called (confusion indicator)
 * - First-browse success rate
 * - Tool sequence patterns (repeated attempts)
 */

import { PersistentStore } from './persistent-store.js';
import { logger as loggerFactory } from './logger.js';

const logger = loggerFactory.create('ToolSelectionMetrics');

// ============================================
// Types
// ============================================

/**
 * Core tools that should be visible by default
 */
export const CORE_TOOLS = [
  'smart_browse',
  'batch_browse',
  'execute_api_call',
  'session_management',
  'api_auth',
] as const;

/**
 * Debug tools (visible with DEBUG_MODE)
 */
export const DEBUG_TOOLS = [
  'capture_screenshot',
  'export_har',
  'debug_traces',
] as const;

/**
 * Admin tools (visible with ADMIN_MODE)
 */
export const ADMIN_TOOLS = [
  'get_performance_metrics',
  'usage_analytics',
  'get_analytics_dashboard',
  'get_system_status',
  'get_browser_providers',
  'tier_management',
  'content_tracking',
] as const;

/**
 * Deprecated tools that indicate confusion if called
 */
export const DEPRECATED_TOOLS = [
  'get_domain_intelligence',
  'get_domain_capabilities',
  'get_learning_stats',
  'get_learning_effectiveness',
  'skill_management',
  'get_api_auth_status',
  'configure_api_auth',
  'complete_oauth',
  'get_auth_guidance',
  'delete_api_auth',
  'list_configured_auth',
  // Legacy tools from before consolidation
  'browse', // Old browse tool
] as const;

export type CoreTool = typeof CORE_TOOLS[number];
export type DebugTool = typeof DEBUG_TOOLS[number];
export type AdminTool = typeof ADMIN_TOOLS[number];
export type DeprecatedTool = typeof DEPRECATED_TOOLS[number];
export type AllTools = CoreTool | DebugTool | AdminTool | DeprecatedTool;

/**
 * A single tool invocation event
 */
export interface ToolInvocationEvent {
  /** Unique event ID */
  id: string;
  /** Timestamp of invocation */
  timestamp: number;
  /** Tool name */
  tool: string;
  /** Whether the invocation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Session ID to track sequences within a session */
  sessionId?: string;
  /** Optional tenant ID for multi-tenant deployments */
  tenantId?: string;
  /** Whether this was a deprecated tool */
  isDeprecated: boolean;
  /** Tool category */
  category: 'core' | 'debug' | 'admin' | 'deprecated' | 'unknown';
}

/**
 * Aggregated tool usage statistics
 */
export interface ToolUsageStats {
  /** Total invocations */
  totalInvocations: number;
  /** Breakdown by tool */
  byTool: Record<string, ToolStats>;
  /** Breakdown by category */
  byCategory: CategoryStats;
  /** First-browse success rate (smart_browse success on first try per session) */
  firstBrowseSuccessRate: number;
  /** Deprecated tool usage rate (confusion indicator) */
  deprecatedUsageRate: number;
  /** Session stats */
  sessionStats: {
    totalSessions: number;
    avgToolsPerSession: number;
    sessionsWithDeprecatedUsage: number;
  };
  /** Time range of data */
  periodStart: number;
  periodEnd: number;
}

export interface ToolStats {
  /** Number of invocations */
  invocations: number;
  /** Success count */
  successCount: number;
  /** Failure count */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average duration in ms */
  avgDurationMs: number;
  /** Last used timestamp */
  lastUsed: number;
}

export interface CategoryStats {
  core: { invocations: number; successRate: number };
  debug: { invocations: number; successRate: number };
  admin: { invocations: number; successRate: number };
  deprecated: { invocations: number; successRate: number };
  unknown: { invocations: number; successRate: number };
}

/**
 * Query options for tool selection metrics
 */
export interface ToolMetricsQueryOptions {
  /** Filter by tool name */
  tool?: string;
  /** Filter by category */
  category?: 'core' | 'debug' | 'admin' | 'deprecated' | 'unknown';
  /** Filter by session */
  sessionId?: string;
  /** Filter by tenant */
  tenantId?: string;
  /** Time period */
  period?: 'hour' | 'day' | 'week' | 'month' | 'all';
  /** Custom start time */
  startTime?: number;
  /** Custom end time */
  endTime?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Categorize a tool name
 */
export function categorize(tool: string): 'core' | 'debug' | 'admin' | 'deprecated' | 'unknown' {
  if ((CORE_TOOLS as readonly string[]).includes(tool)) return 'core';
  if ((DEBUG_TOOLS as readonly string[]).includes(tool)) return 'debug';
  if ((ADMIN_TOOLS as readonly string[]).includes(tool)) return 'admin';
  if ((DEPRECATED_TOOLS as readonly string[]).includes(tool)) return 'deprecated';
  return 'unknown';
}

/**
 * Check if a tool is deprecated
 */
export function isDeprecated(tool: string): boolean {
  return (DEPRECATED_TOOLS as readonly string[]).includes(tool);
}

// ============================================
// ToolSelectionMetrics Class
// ============================================

export class ToolSelectionMetrics {
  private events: ToolInvocationEvent[] = [];
  private persistentStore: PersistentStore<ToolInvocationEvent[]>;
  private maxEvents: number;
  private initialized = false;

  constructor(options?: {
    persistPath?: string;
    maxEvents?: number;
    debounceMs?: number;
  }) {
    this.maxEvents = options?.maxEvents ?? 50000;
    this.persistentStore = new PersistentStore<ToolInvocationEvent[]>(
      options?.persistPath ?? 'tool-selection-metrics.json',
      { debounceMs: options?.debounceMs ?? 5000 }
    );
  }

  /**
   * Initialize the metrics tracker (load persisted events)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const loaded = await this.persistentStore.load();
    if (loaded) {
      this.events = loaded;
      logger.info('Loaded tool selection events', { count: this.events.length });
    }
    this.initialized = true;
  }

  /**
   * Record a tool invocation
   */
  async record(event: Omit<ToolInvocationEvent, 'id' | 'isDeprecated' | 'category'>): Promise<ToolInvocationEvent> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fullEvent: ToolInvocationEvent = {
      ...event,
      id: this.generateId(),
      isDeprecated: isDeprecated(event.tool),
      category: categorize(event.tool),
    };

    this.events.push(fullEvent);

    // Trim old events if exceeding max
    if (this.events.length > this.maxEvents) {
      const trimCount = this.events.length - this.maxEvents;
      this.events = this.events.slice(trimCount);
      logger.debug('Trimmed old tool selection events', { trimCount });
    }

    // Persist asynchronously
    this.persistentStore.save(this.events);

    if (fullEvent.isDeprecated) {
      logger.warn('Deprecated tool used', { tool: event.tool });
    } else {
      logger.debug('Recorded tool invocation', {
        tool: event.tool,
        category: fullEvent.category,
        success: event.success,
      });
    }

    return fullEvent;
  }

  /**
   * Generate a unique event ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `ts-${timestamp}-${random}`;
  }

  /**
   * Get period boundaries based on time period
   */
  private getPeriodBoundaries(period: 'hour' | 'day' | 'week' | 'month' | 'all'): { start: number; end: number } {
    const now = Date.now();

    switch (period) {
      case 'hour': {
        const hourStart = new Date(now);
        hourStart.setMinutes(0, 0, 0);
        return { start: hourStart.getTime(), end: now };
      }
      case 'day': {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        return { start: dayStart.getTime(), end: now };
      }
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return { start: weekStart.getTime(), end: now };
      }
      case 'month': {
        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        return { start: monthStart.getTime(), end: now };
      }
      case 'all':
      default:
        return { start: 0, end: now };
    }
  }

  /**
   * Filter events based on query options
   */
  private filterEvents(options: ToolMetricsQueryOptions): ToolInvocationEvent[] {
    let filtered = this.events;

    // Time filter
    if (options.startTime !== undefined || options.endTime !== undefined) {
      const start = options.startTime ?? 0;
      const end = options.endTime ?? Date.now();
      filtered = filtered.filter(e => e.timestamp >= start && e.timestamp <= end);
    } else if (options.period && options.period !== 'all') {
      const { start, end } = this.getPeriodBoundaries(options.period);
      filtered = filtered.filter(e => e.timestamp >= start && e.timestamp <= end);
    }

    // Tool filter
    if (options.tool) {
      filtered = filtered.filter(e => e.tool === options.tool);
    }

    // Category filter
    if (options.category) {
      filtered = filtered.filter(e => e.category === options.category);
    }

    // Session filter
    if (options.sessionId) {
      filtered = filtered.filter(e => e.sessionId === options.sessionId);
    }

    // Tenant filter
    if (options.tenantId) {
      filtered = filtered.filter(e => e.tenantId === options.tenantId);
    }

    return filtered;
  }

  /**
   * Get tool usage statistics
   */
  async getStats(options: ToolMetricsQueryOptions = {}): Promise<ToolUsageStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    const period = options.period ?? 'day';
    const { start: periodStart, end: periodEnd } = options.startTime !== undefined || options.endTime !== undefined
      ? { start: options.startTime ?? 0, end: options.endTime ?? Date.now() }
      : this.getPeriodBoundaries(period);

    const events = this.filterEvents({ ...options, startTime: periodStart, endTime: periodEnd });

    if (events.length === 0) {
      return this.emptyStats(periodStart, periodEnd);
    }

    // Aggregate by tool
    const byTool: Record<string, { count: number; success: number; duration: number; lastUsed: number }> = {};
    for (const event of events) {
      if (!byTool[event.tool]) {
        byTool[event.tool] = { count: 0, success: 0, duration: 0, lastUsed: 0 };
      }
      byTool[event.tool].count++;
      if (event.success) byTool[event.tool].success++;
      byTool[event.tool].duration += event.durationMs;
      byTool[event.tool].lastUsed = Math.max(byTool[event.tool].lastUsed, event.timestamp);
    }

    // Convert to ToolStats
    const toolStats: Record<string, ToolStats> = {};
    for (const [tool, stats] of Object.entries(byTool)) {
      toolStats[tool] = {
        invocations: stats.count,
        successCount: stats.success,
        failureCount: stats.count - stats.success,
        successRate: stats.count > 0 ? stats.success / stats.count : 0,
        avgDurationMs: stats.count > 0 ? Math.round(stats.duration / stats.count) : 0,
        lastUsed: stats.lastUsed,
      };
    }

    // Aggregate by category
    const categoryAgg: Record<string, { count: number; success: number }> = {
      core: { count: 0, success: 0 },
      debug: { count: 0, success: 0 },
      admin: { count: 0, success: 0 },
      deprecated: { count: 0, success: 0 },
      unknown: { count: 0, success: 0 },
    };
    for (const event of events) {
      categoryAgg[event.category].count++;
      if (event.success) categoryAgg[event.category].success++;
    }

    const categoryStats: CategoryStats = {
      core: {
        invocations: categoryAgg.core.count,
        successRate: categoryAgg.core.count > 0 ? categoryAgg.core.success / categoryAgg.core.count : 0,
      },
      debug: {
        invocations: categoryAgg.debug.count,
        successRate: categoryAgg.debug.count > 0 ? categoryAgg.debug.success / categoryAgg.debug.count : 0,
      },
      admin: {
        invocations: categoryAgg.admin.count,
        successRate: categoryAgg.admin.count > 0 ? categoryAgg.admin.success / categoryAgg.admin.count : 0,
      },
      deprecated: {
        invocations: categoryAgg.deprecated.count,
        successRate: categoryAgg.deprecated.count > 0 ? categoryAgg.deprecated.success / categoryAgg.deprecated.count : 0,
      },
      unknown: {
        invocations: categoryAgg.unknown.count,
        successRate: categoryAgg.unknown.count > 0 ? categoryAgg.unknown.success / categoryAgg.unknown.count : 0,
      },
    };

    // Calculate first-browse success rate
    // Group by session, find first smart_browse call (by timestamp), check if it succeeded
    const sessionFirstBrowse = new Map<string, boolean>();
    // Sort events by timestamp to ensure we get the actual first browse per session
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
    for (const event of sortedEvents) {
      if (event.tool === 'smart_browse' && event.sessionId) {
        if (!sessionFirstBrowse.has(event.sessionId)) {
          sessionFirstBrowse.set(event.sessionId, event.success);
        }
      }
    }
    const firstBrowseResults = Array.from(sessionFirstBrowse.values());
    const firstBrowseSuccessRate = firstBrowseResults.length > 0
      ? firstBrowseResults.filter(s => s).length / firstBrowseResults.length
      : 0;

    // Deprecated usage rate
    const deprecatedUsageRate = events.length > 0
      ? events.filter(e => e.isDeprecated).length / events.length
      : 0;

    // Session stats
    const sessionToolCounts = new Map<string, number>();
    const sessionsWithDeprecated = new Set<string>();
    for (const event of events) {
      if (event.sessionId) {
        sessionToolCounts.set(event.sessionId, (sessionToolCounts.get(event.sessionId) ?? 0) + 1);
        if (event.isDeprecated) {
          sessionsWithDeprecated.add(event.sessionId);
        }
      }
    }
    const totalSessions = sessionToolCounts.size;
    const avgToolsPerSession = totalSessions > 0
      ? Array.from(sessionToolCounts.values()).reduce((a, b) => a + b, 0) / totalSessions
      : 0;

    return {
      totalInvocations: events.length,
      byTool: toolStats,
      byCategory: categoryStats,
      firstBrowseSuccessRate,
      deprecatedUsageRate,
      sessionStats: {
        totalSessions,
        avgToolsPerSession: Math.round(avgToolsPerSession * 100) / 100,
        sessionsWithDeprecatedUsage: sessionsWithDeprecated.size,
      },
      periodStart,
      periodEnd,
    };
  }

  /**
   * Return empty stats
   */
  private emptyStats(periodStart: number, periodEnd: number): ToolUsageStats {
    return {
      totalInvocations: 0,
      byTool: {},
      byCategory: {
        core: { invocations: 0, successRate: 0 },
        debug: { invocations: 0, successRate: 0 },
        admin: { invocations: 0, successRate: 0 },
        deprecated: { invocations: 0, successRate: 0 },
        unknown: { invocations: 0, successRate: 0 },
      },
      firstBrowseSuccessRate: 0,
      deprecatedUsageRate: 0,
      sessionStats: {
        totalSessions: 0,
        avgToolsPerSession: 0,
        sessionsWithDeprecatedUsage: 0,
      },
      periodStart,
      periodEnd,
    };
  }

  /**
   * Get confusion indicators
   * Returns metrics that suggest LLM confusion with tools
   */
  async getConfusionIndicators(options: ToolMetricsQueryOptions = {}): Promise<{
    deprecatedToolCalls: { tool: string; count: number; suggestion: string }[];
    repeatedFailures: { tool: string; failureCount: number; lastError?: string }[];
    toolHopping: { sessionsWithMultipleTools: number; avgToolSwitches: number };
    overallConfusionScore: number;
    recommendations: string[];
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const events = this.filterEvents(options);

    // Find deprecated tool calls with suggestions
    const deprecatedCalls = new Map<string, number>();
    for (const event of events) {
      if (event.isDeprecated) {
        deprecatedCalls.set(event.tool, (deprecatedCalls.get(event.tool) ?? 0) + 1);
      }
    }

    const deprecatedToolCalls = Array.from(deprecatedCalls.entries()).map(([tool, count]) => ({
      tool,
      count,
      suggestion: this.getSuggestionForDeprecatedTool(tool),
    }));

    // Find tools with repeated failures
    const toolFailures = new Map<string, { count: number; lastError?: string }>();
    for (const event of events) {
      if (!event.success) {
        const existing = toolFailures.get(event.tool) ?? { count: 0 };
        toolFailures.set(event.tool, {
          count: existing.count + 1,
          lastError: event.error,
        });
      }
    }

    const repeatedFailures = Array.from(toolFailures.entries())
      .filter(([, data]) => data.count >= 2)
      .map(([tool, data]) => ({
        tool,
        failureCount: data.count,
        lastError: data.lastError,
      }));

    // Detect tool hopping (sessions with many different tools)
    const sessionTools = new Map<string, Set<string>>();
    for (const event of events) {
      if (event.sessionId) {
        if (!sessionTools.has(event.sessionId)) {
          sessionTools.set(event.sessionId, new Set());
        }
        sessionTools.get(event.sessionId)!.add(event.tool);
      }
    }

    const toolCounts = Array.from(sessionTools.values()).map(tools => tools.size);
    const sessionsWithMultipleTools = toolCounts.filter(c => c > 1).length;
    const avgToolSwitches = toolCounts.length > 0
      ? toolCounts.reduce((a, b) => a + b, 0) / toolCounts.length
      : 0;

    // Calculate confusion score (0-100)
    // Factors: deprecated usage, failure rate, tool hopping
    const deprecatedRate = events.length > 0
      ? events.filter(e => e.isDeprecated).length / events.length
      : 0;
    const failureRate = events.length > 0
      ? events.filter(e => !e.success).length / events.length
      : 0;
    const hoppingRate = sessionTools.size > 0
      ? sessionsWithMultipleTools / sessionTools.size
      : 0;

    // Weight: deprecated (40%), failures (30%), hopping (30%)
    const overallConfusionScore = Math.round(
      (deprecatedRate * 40 + failureRate * 30 + hoppingRate * 30)
    );

    // Generate recommendations
    const recommendations: string[] = [];
    if (deprecatedRate > 0.1) {
      recommendations.push('High deprecated tool usage detected. Consider updating prompts to use consolidated tools.');
    }
    if (failureRate > 0.2) {
      recommendations.push('High failure rate. Review common error patterns and improve tool documentation.');
    }
    if (avgToolSwitches > 3) {
      recommendations.push('LLMs are trying many tools per session. Consider adding better guidance in tool descriptions.');
    }
    if (overallConfusionScore < 10) {
      recommendations.push('Tool selection is healthy. Continue monitoring.');
    }

    return {
      deprecatedToolCalls,
      repeatedFailures,
      toolHopping: {
        sessionsWithMultipleTools,
        avgToolSwitches: Math.round(avgToolSwitches * 100) / 100,
      },
      overallConfusionScore,
      recommendations,
    };
  }

  /**
   * Get suggestion for deprecated tool
   */
  private getSuggestionForDeprecatedTool(tool: string): string {
    const suggestions: Record<string, string> = {
      'get_domain_intelligence': 'Use smart_browse with includeInsights=true',
      'get_domain_capabilities': 'Use smart_browse with includeInsights=true',
      'get_learning_stats': 'Use get_analytics_dashboard (requires ADMIN_MODE)',
      'get_learning_effectiveness': 'Use get_analytics_dashboard (requires ADMIN_MODE)',
      'skill_management': 'Skills are auto-applied during smart_browse',
      'get_api_auth_status': 'Use api_auth with action="status"',
      'configure_api_auth': 'Use api_auth with action="configure"',
      'complete_oauth': 'Use api_auth with action="complete_oauth"',
      'get_auth_guidance': 'Use api_auth with action="guidance"',
      'delete_api_auth': 'Use api_auth with action="delete"',
      'list_configured_auth': 'Use api_auth with action="list"',
      'browse': 'Use smart_browse (includes automatic learning)',
    };
    return suggestions[tool] ?? 'Use the equivalent core tool';
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Reset metrics data
   */
  async reset(): Promise<void> {
    this.events = [];
    await this.persistentStore.save([]);
    logger.info('Tool selection metrics reset');
  }

  /**
   * Flush pending data to storage
   */
  async flush(): Promise<void> {
    await this.persistentStore.save(this.events);
    await this.persistentStore.flush();
    logger.info('Tool selection metrics flushed');
  }
}

// ============================================
// Singleton Instance
// ============================================

let metricsInstance: ToolSelectionMetrics | null = null;

/**
 * Get or create the global tool selection metrics instance
 */
export function getToolSelectionMetrics(): ToolSelectionMetrics {
  if (!metricsInstance) {
    metricsInstance = new ToolSelectionMetrics();
  }
  return metricsInstance;
}

/**
 * Reset the global metrics instance (for testing)
 */
export function resetToolSelectionMetricsInstance(): void {
  metricsInstance = null;
}
