/**
 * Skill Prompt Analytics (SK-011)
 *
 * Tracks usage of Claude skill prompts (research_product, monitor_changes, etc.)
 * to understand which skills are most used, their success rates, and common
 * parameter modifications.
 *
 * This is different from ProceduralMemory skills - those are learned browsing
 * patterns. Skill prompts are user-facing workflow templates in skills/prompts/.
 */

import { logger } from './logger.js';
import { addSchemaVersion } from '../types/schema-version.js';

// Create a custom logger for skill prompt analytics
const log = logger.create('SkillPromptAnalytics');

// ============================================
// Types
// ============================================

/**
 * Record of a single skill prompt execution
 */
export interface SkillPromptExecution {
  /** Skill prompt ID (e.g., 'research_product', 'monitor_changes') */
  skillPromptId: string;
  /** Workflow step within the skill (if known) */
  workflowStep?: number;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  completedAt?: number;
  /** Whether the execution succeeded */
  success: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Domain being browsed */
  domain?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Parameters that were overridden from defaults */
  parameterOverrides?: Record<string, unknown>;
}

/**
 * Aggregated statistics for a skill prompt
 */
export interface SkillPromptStats {
  /** Skill prompt ID */
  skillPromptId: string;
  /** Total number of executions */
  totalExecutions: number;
  /** Number of successful executions */
  successCount: number;
  /** Number of failed executions */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** 95th percentile duration */
  p95DurationMs: number;
  /** First used timestamp */
  firstUsed: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Common domains used with this skill */
  topDomains: Array<{ domain: string; count: number }>;
  /** Most common parameter overrides */
  commonOverrides: Array<{ parameter: string; count: number; exampleValues: unknown[] }>;
}

/**
 * Summary of all skill prompt analytics
 */
export interface SkillPromptAnalyticsSummary {
  /** Schema version for API compatibility */
  schemaVersion: string;
  /** When this snapshot was generated */
  generatedAt: number;
  /** Total executions across all skills */
  totalExecutions: number;
  /** Overall success rate */
  overallSuccessRate: number;
  /** Most used skill prompts */
  mostUsed: SkillPromptStats[];
  /** Highest success rate skills */
  highestSuccessRate: SkillPromptStats[];
  /** Skills with potential issues (low success rate) */
  needsAttention: SkillPromptStats[];
  /** Stats by skill prompt */
  bySkillPrompt: Record<string, SkillPromptStats>;
}

/**
 * Options for getting analytics
 */
export interface SkillPromptAnalyticsOptions {
  /** Limit for number of items in lists (default: 10) */
  limit?: number;
  /** Filter by skill prompt ID */
  skillPromptId?: string;
  /** Filter by domain */
  domain?: string;
  /** Time range start (timestamp) */
  since?: number;
  /** Time range end (timestamp) */
  until?: number;
}

// ============================================
// In-Memory Storage
// ============================================

/**
 * Storage for skill prompt executions (in-memory for now, could be persisted)
 */
interface SkillPromptStorage {
  executions: SkillPromptExecution[];
  maxExecutions: number;
}

const storage: SkillPromptStorage = {
  executions: [],
  maxExecutions: 10000, // Keep last 10k executions
};

// ============================================
// Core Analytics Functions
// ============================================

/**
 * Record the start of a skill prompt execution
 */
export function startSkillPromptExecution(
  skillPromptId: string,
  options?: {
    workflowStep?: number;
    domain?: string;
    parameterOverrides?: Record<string, unknown>;
  }
): SkillPromptExecution {
  const execution: SkillPromptExecution = {
    skillPromptId,
    workflowStep: options?.workflowStep,
    startedAt: Date.now(),
    success: false, // Will be updated when completed
    domain: options?.domain,
    parameterOverrides: options?.parameterOverrides,
  };

  log.debug(`Skill prompt execution started: ${skillPromptId}`);

  return execution;
}

/**
 * Complete a skill prompt execution
 */
export function completeSkillPromptExecution(
  execution: SkillPromptExecution,
  success: boolean,
  errorMessage?: string
): void {
  execution.completedAt = Date.now();
  execution.success = success;
  execution.durationMs = execution.completedAt - execution.startedAt;
  execution.errorMessage = errorMessage;

  // Store the execution
  storage.executions.push(execution);

  // Trim if over limit
  if (storage.executions.length > storage.maxExecutions) {
    storage.executions = storage.executions.slice(-storage.maxExecutions);
  }

  log.debug(
    `Skill prompt execution completed: ${execution.skillPromptId} ` +
    `success=${success} duration=${execution.durationMs}ms`
  );
}

/**
 * Record a complete skill prompt execution in one call
 */
export function recordSkillPromptExecution(
  skillPromptId: string,
  success: boolean,
  options?: {
    workflowStep?: number;
    domain?: string;
    durationMs?: number;
    errorMessage?: string;
    parameterOverrides?: Record<string, unknown>;
  }
): void {
  const now = Date.now();
  const durationMs = options?.durationMs ?? 0;

  const execution: SkillPromptExecution = {
    skillPromptId,
    workflowStep: options?.workflowStep,
    startedAt: now - durationMs,
    completedAt: now,
    success,
    durationMs,
    domain: options?.domain,
    errorMessage: options?.errorMessage,
    parameterOverrides: options?.parameterOverrides,
  };

  storage.executions.push(execution);

  if (storage.executions.length > storage.maxExecutions) {
    storage.executions = storage.executions.slice(-storage.maxExecutions);
  }

  log.debug(
    `Skill prompt execution recorded: ${skillPromptId} ` +
    `success=${success} duration=${durationMs}ms`
  );
}

// ============================================
// Stats Calculation
// ============================================

/**
 * Calculate statistics for a specific skill prompt
 */
function calculateSkillStats(
  skillPromptId: string,
  executions: SkillPromptExecution[]
): SkillPromptStats | null {
  const skillExecutions = executions.filter(e => e.skillPromptId === skillPromptId);

  if (skillExecutions.length === 0) {
    return null;
  }

  const successCount = skillExecutions.filter(e => e.success).length;
  const failureCount = skillExecutions.length - successCount;
  const successRate = skillExecutions.length > 0 ? successCount / skillExecutions.length : 0;

  // Calculate duration stats
  const durations = skillExecutions
    .filter(e => e.durationMs !== undefined)
    .map(e => e.durationMs as number)
    .sort((a, b) => a - b);

  const avgDurationMs = durations.length > 0
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : 0;

  const p95Index = Math.floor(durations.length * 0.95);
  const p95DurationMs = durations.length > 0 ? durations[p95Index] ?? durations[durations.length - 1] : 0;

  // Calculate top domains
  const domainCounts = new Map<string, number>();
  for (const exec of skillExecutions) {
    if (exec.domain) {
      domainCounts.set(exec.domain, (domainCounts.get(exec.domain) ?? 0) + 1);
    }
  }
  const topDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  // Calculate common parameter overrides
  const overrideCounts = new Map<string, { count: number; values: Set<unknown> }>();
  for (const exec of skillExecutions) {
    if (exec.parameterOverrides) {
      for (const [key, value] of Object.entries(exec.parameterOverrides)) {
        const existing = overrideCounts.get(key) ?? { count: 0, values: new Set() };
        existing.count++;
        if (existing.values.size < 5) {
          existing.values.add(value);
        }
        overrideCounts.set(key, existing);
      }
    }
  }
  const commonOverrides = Array.from(overrideCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([parameter, data]) => ({
      parameter,
      count: data.count,
      exampleValues: Array.from(data.values),
    }));

  // Find first and last used
  const timestamps = skillExecutions.map(e => e.startedAt).sort((a, b) => a - b);
  const firstUsed = timestamps[0];
  const lastUsed = timestamps[timestamps.length - 1];

  return {
    skillPromptId,
    totalExecutions: skillExecutions.length,
    successCount,
    failureCount,
    successRate,
    avgDurationMs,
    p95DurationMs,
    firstUsed,
    lastUsed,
    topDomains,
    commonOverrides,
  };
}

/**
 * Get filtered executions based on options
 */
function getFilteredExecutions(options: SkillPromptAnalyticsOptions = {}): SkillPromptExecution[] {
  let executions = [...storage.executions];

  if (options.skillPromptId) {
    executions = executions.filter(e => e.skillPromptId === options.skillPromptId);
  }

  if (options.domain) {
    executions = executions.filter(e => e.domain === options.domain);
  }

  if (options.since) {
    executions = executions.filter(e => e.startedAt >= options.since!);
  }

  if (options.until) {
    executions = executions.filter(e => e.startedAt <= options.until!);
  }

  return executions;
}

// ============================================
// Public API
// ============================================

/**
 * Get analytics summary for skill prompts
 */
export function getSkillPromptAnalytics(
  options: SkillPromptAnalyticsOptions = {}
): SkillPromptAnalyticsSummary {
  const limit = options.limit ?? 10;
  const executions = getFilteredExecutions(options);

  // Get unique skill prompt IDs
  const skillPromptIds = [...new Set(executions.map(e => e.skillPromptId))];

  // Calculate stats for each skill
  const allStats: SkillPromptStats[] = [];
  const bySkillPrompt: Record<string, SkillPromptStats> = {};

  for (const skillPromptId of skillPromptIds) {
    const stats = calculateSkillStats(skillPromptId, executions);
    if (stats) {
      allStats.push(stats);
      bySkillPrompt[skillPromptId] = stats;
    }
  }

  // Calculate overall metrics
  const totalExecutions = executions.length;
  const totalSuccesses = executions.filter(e => e.success).length;
  const overallSuccessRate = totalExecutions > 0 ? totalSuccesses / totalExecutions : 0;

  // Sort for different views
  const mostUsed = [...allStats]
    .sort((a, b) => b.totalExecutions - a.totalExecutions)
    .slice(0, limit);

  const highestSuccessRate = [...allStats]
    .filter(s => s.totalExecutions >= 5) // Need at least 5 executions for meaningful rate
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, limit);

  const needsAttention = [...allStats]
    .filter(s => s.totalExecutions >= 5 && s.successRate < 0.7) // Less than 70% success
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, limit);

  const summary: SkillPromptAnalyticsSummary = {
    schemaVersion: '1.0',
    generatedAt: Date.now(),
    totalExecutions,
    overallSuccessRate,
    mostUsed,
    highestSuccessRate,
    needsAttention,
    bySkillPrompt,
  };

  return addSchemaVersion(summary);
}

/**
 * Get stats for a specific skill prompt
 */
export function getSkillPromptStats(skillPromptId: string): SkillPromptStats | null {
  return calculateSkillStats(skillPromptId, storage.executions);
}

/**
 * Get recent executions (for debugging/auditing)
 */
export function getRecentExecutions(limit: number = 100): SkillPromptExecution[] {
  return storage.executions.slice(-limit).reverse();
}

/**
 * Clear all stored executions (mainly for testing)
 */
export function clearSkillPromptAnalytics(): void {
  storage.executions = [];
  log.debug('Skill prompt analytics cleared');
}

/**
 * Get raw execution count (for quick checks)
 */
export function getSkillPromptExecutionCount(): number {
  return storage.executions.length;
}
