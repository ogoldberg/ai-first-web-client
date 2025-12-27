/**
 * Workflow Scheduler (FEAT-004)
 *
 * Handles scheduled workflow execution with cron-based scheduling.
 * Executes workflows at scheduled intervals and delivers results via webhooks.
 */

import type {
  ScheduledWorkflow,
  CreateScheduledWorkflowRequest,
  UpdateScheduledWorkflowRequest,
  ScheduledWorkflowExecution,
  Workflow,
  WorkflowReplayResult,
  WorkflowVariables,
} from '../types/workflow.js';
import type { SmartBrowser } from './smart-browser.js';
import { logger } from '../utils/logger.js';
import { createHmac } from 'crypto';

/**
 * Simple cron parser for basic patterns
 * Supports: minute hour day-of-month month day-of-week
 */
class CronParser {
  private pattern: string;

  constructor(pattern: string) {
    this.pattern = pattern;
  }

  /**
   * Parse cron expression and validate format
   */
  static validate(pattern: string): boolean {
    const parts = pattern.trim().split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }

    // Basic validation: each part should be * or number or range
    return parts.every(part => {
      return /^(\*|[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*)$/.test(part);
    });
  }

  /**
   * Calculate next execution time from now
   */
  getNextExecution(from: Date = new Date(), timezone?: string): Date {
    // Parse cron pattern
    const parts = this.pattern.split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron pattern: ${this.pattern}`);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Start from the next minute
    const next = new Date(from);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);

    // Find next matching time (max 1 year ahead)
    const maxIterations = 365 * 24 * 60; // 1 year in minutes
    let iterations = 0;

    while (iterations < maxIterations) {
      if (
        this.matchesPart(next.getMinutes(), minute) &&
        this.matchesPart(next.getHours(), hour) &&
        this.matchesPart(next.getDate(), dayOfMonth) &&
        this.matchesPart(next.getMonth() + 1, month) &&
        (dayOfWeek === '*' || this.matchesPart(next.getDay(), dayOfWeek))
      ) {
        return next;
      }

      next.setMinutes(next.getMinutes() + 1);
      iterations++;
    }

    throw new Error(`Could not find next execution time for pattern: ${this.pattern}`);
  }

  /**
   * Check if a value matches a cron part
   */
  private matchesPart(value: number, part: string): boolean {
    if (part === '*') {
      return true;
    }

    // Handle comma-separated values
    if (part.includes(',')) {
      return part.split(',').some(p => this.matchesPart(value, p));
    }

    // Handle ranges
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return value >= start && value <= end;
    }

    // Exact match
    return value === Number(part);
  }
}

/**
 * Workflow Scheduler
 */
export class WorkflowScheduler {
  private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map();
  private executions: Map<string, ScheduledWorkflowExecution[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private workflows: Map<string, Workflow> = new Map();

  constructor(
    private smartBrowser: SmartBrowser,
    private tenantId: string
  ) {}

  /**
   * Create a new scheduled workflow
   */
  async createScheduledWorkflow(
    request: CreateScheduledWorkflowRequest
  ): Promise<ScheduledWorkflow> {
    // Validate cron expression
    if (!CronParser.validate(request.schedule)) {
      throw new Error(`Invalid cron expression: ${request.schedule}`);
    }

    // Validate webhook URL if provided
    if (request.webhookUrl) {
      try {
        new URL(request.webhookUrl);
      } catch {
        throw new Error(`Invalid webhook URL: ${request.webhookUrl}`);
      }
    }

    // Calculate next execution time
    const parser = new CronParser(request.schedule);
    const nextExecutionAt = parser.getNextExecution(new Date(), request.timezone).getTime();

    const scheduledWorkflow: ScheduledWorkflow = {
      id: this.generateId(),
      workflowId: request.workflowId,
      name: request.name,
      description: request.description,
      schedule: request.schedule,
      timezone: request.timezone || 'UTC',
      enabled: true,
      webhookUrl: request.webhookUrl,
      webhookSecret: request.webhookSecret,
      variables: request.variables,
      retryOnFailure: request.retryOnFailure ?? false,
      maxRetries: request.maxRetries ?? 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: request.tenantId,
      nextExecutionAt,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    };

    this.scheduledWorkflows.set(scheduledWorkflow.id, scheduledWorkflow);
    this.scheduleExecution(scheduledWorkflow);

    logger.workflowScheduler.info('Created scheduled workflow', {
      id: scheduledWorkflow.id,
      name: scheduledWorkflow.name,
      schedule: scheduledWorkflow.schedule,
      nextExecutionAt: new Date(nextExecutionAt).toISOString(),
    });

    return scheduledWorkflow;
  }

  /**
   * Update a scheduled workflow
   */
  async updateScheduledWorkflow(
    id: string,
    request: UpdateScheduledWorkflowRequest
  ): Promise<ScheduledWorkflow> {
    const workflow = this.scheduledWorkflows.get(id);
    if (!workflow) {
      throw new Error(`Scheduled workflow not found: ${id}`);
    }

    // Validate cron expression if changed
    if (request.schedule && !CronParser.validate(request.schedule)) {
      throw new Error(`Invalid cron expression: ${request.schedule}`);
    }

    // Validate webhook URL if changed
    if (request.webhookUrl !== undefined) {
      try {
        new URL(request.webhookUrl);
      } catch {
        throw new Error(`Invalid webhook URL: ${request.webhookUrl}`);
      }
    }

    // Update fields
    const updated: ScheduledWorkflow = {
      ...workflow,
      name: request.name ?? workflow.name,
      description: request.description ?? workflow.description,
      schedule: request.schedule ?? workflow.schedule,
      timezone: request.timezone ?? workflow.timezone,
      enabled: request.enabled ?? workflow.enabled,
      webhookUrl: request.webhookUrl ?? workflow.webhookUrl,
      webhookSecret: request.webhookSecret ?? workflow.webhookSecret,
      variables: request.variables ?? workflow.variables,
      retryOnFailure: request.retryOnFailure ?? workflow.retryOnFailure,
      maxRetries: request.maxRetries ?? workflow.maxRetries,
      updatedAt: Date.now(),
    };

    // Recalculate next execution if schedule or timezone changed
    if (request.schedule || request.timezone) {
      const parser = new CronParser(updated.schedule);
      updated.nextExecutionAt = parser.getNextExecution(new Date(), updated.timezone).getTime();
    }

    this.scheduledWorkflows.set(id, updated);

    // Reschedule if enabled state or schedule changed
    if (request.enabled !== undefined || request.schedule || request.timezone) {
      this.cancelExecution(id);
      if (updated.enabled) {
        this.scheduleExecution(updated);
      }
    }

    logger.workflowScheduler.info('Updated scheduled workflow', { id, updates: request });

    return updated;
  }

  /**
   * Delete a scheduled workflow
   */
  async deleteScheduledWorkflow(id: string): Promise<void> {
    const workflow = this.scheduledWorkflows.get(id);
    if (!workflow) {
      throw new Error(`Scheduled workflow not found: ${id}`);
    }

    this.cancelExecution(id);
    this.scheduledWorkflows.delete(id);
    this.executions.delete(id);

    logger.workflowScheduler.info('Deleted scheduled workflow', { id });
  }

  /**
   * Get a scheduled workflow by ID
   */
  getScheduledWorkflow(id: string): ScheduledWorkflow | undefined {
    return this.scheduledWorkflows.get(id);
  }

  /**
   * List all scheduled workflows for tenant
   */
  listScheduledWorkflows(): ScheduledWorkflow[] {
    return Array.from(this.scheduledWorkflows.values());
  }

  /**
   * Get execution history for a scheduled workflow
   */
  getExecutionHistory(scheduledWorkflowId: string, limit = 50): ScheduledWorkflowExecution[] {
    const executions = this.executions.get(scheduledWorkflowId) || [];
    return executions.slice(0, limit);
  }

  /**
   * Register a workflow for replay
   */
  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Schedule the next execution
   */
  private scheduleExecution(scheduledWorkflow: ScheduledWorkflow): void {
    if (!scheduledWorkflow.enabled || !scheduledWorkflow.nextExecutionAt) {
      return;
    }

    const now = Date.now();
    const delay = Math.max(0, scheduledWorkflow.nextExecutionAt - now);

    const timer = setTimeout(() => {
      this.executeWorkflow(scheduledWorkflow);
    }, delay);

    this.timers.set(scheduledWorkflow.id, timer);

    logger.workflowScheduler.debug('Scheduled workflow execution', {
      id: scheduledWorkflow.id,
      nextExecutionAt: new Date(scheduledWorkflow.nextExecutionAt).toISOString(),
      delayMs: delay,
    });
  }

  /**
   * Cancel a scheduled execution
   */
  private cancelExecution(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(scheduledWorkflow: ScheduledWorkflow): Promise<void> {
    const startTime = Date.now();
    let retryCount = 0;
    let success = false;
    let result: WorkflowReplayResult | null = null;
    let error: string | undefined;

    logger.workflowScheduler.info('Executing scheduled workflow', {
      id: scheduledWorkflow.id,
      workflowId: scheduledWorkflow.workflowId,
    });

    // Get the workflow
    const workflow = this.workflows.get(scheduledWorkflow.workflowId);
    if (!workflow) {
      error = `Workflow not found: ${scheduledWorkflow.workflowId}`;
      logger.workflowScheduler.error(error);
    } else {
      // Execute with retries
      while (!success && retryCount <= (scheduledWorkflow.maxRetries || 0)) {
        try {
          result = await this.smartBrowser.replayWorkflow(
            workflow,
            scheduledWorkflow.variables
          );
          success = result.overallSuccess;

          if (!success && scheduledWorkflow.retryOnFailure && retryCount < (scheduledWorkflow.maxRetries || 0)) {
            retryCount++;
            logger.workflowScheduler.warn('Workflow execution failed, retrying', {
              id: scheduledWorkflow.id,
              retryCount,
              maxRetries: scheduledWorkflow.maxRetries,
            });
            await this.delay(1000 * retryCount); // Exponential backoff
          } else {
            break;
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          logger.workflowScheduler.error('Workflow execution error', {
            id: scheduledWorkflow.id,
            error,
            retryCount,
          });

          if (!scheduledWorkflow.retryOnFailure || retryCount >= (scheduledWorkflow.maxRetries || 0)) {
            break;
          }

          retryCount++;
          await this.delay(1000 * retryCount);
        }
      }
    }

    // Create execution record
    const execution: ScheduledWorkflowExecution = {
      id: this.generateId(),
      scheduledWorkflowId: scheduledWorkflow.id,
      workflowId: scheduledWorkflow.workflowId,
      executedAt: startTime,
      duration: Date.now() - startTime,
      success,
      result: result || {
        workflowId: scheduledWorkflow.workflowId,
        executedAt: startTime,
        results: [],
        overallSuccess: false,
        totalDuration: Date.now() - startTime,
      },
      error,
    };

    // Store execution
    const executions = this.executions.get(scheduledWorkflow.id) || [];
    executions.unshift(execution);
    this.executions.set(scheduledWorkflow.id, executions.slice(0, 100)); // Keep last 100

    // Update statistics
    scheduledWorkflow.totalExecutions++;
    if (success) {
      scheduledWorkflow.successfulExecutions++;
    } else {
      scheduledWorkflow.failedExecutions++;
    }
    scheduledWorkflow.lastExecutedAt = startTime;

    // Calculate next execution
    try {
      const parser = new CronParser(scheduledWorkflow.schedule);
      scheduledWorkflow.nextExecutionAt = parser.getNextExecution(
        new Date(),
        scheduledWorkflow.timezone
      ).getTime();
    } catch (err) {
      logger.workflowScheduler.error('Failed to calculate next execution', {
        id: scheduledWorkflow.id,
        error: err instanceof Error ? err.message : String(err),
      });
      scheduledWorkflow.enabled = false;
    }

    this.scheduledWorkflows.set(scheduledWorkflow.id, scheduledWorkflow);

    // Deliver webhook if configured
    if (scheduledWorkflow.webhookUrl) {
      try {
        await this.deliverWebhook(scheduledWorkflow, execution);
      } catch (err) {
        logger.workflowScheduler.error('Webhook delivery failed', {
          id: scheduledWorkflow.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Schedule next execution
    if (scheduledWorkflow.enabled) {
      this.scheduleExecution(scheduledWorkflow);
    }

    logger.workflowScheduler.info('Completed scheduled workflow execution', {
      id: scheduledWorkflow.id,
      success,
      duration: execution.duration,
      nextExecutionAt: scheduledWorkflow.nextExecutionAt
        ? new Date(scheduledWorkflow.nextExecutionAt).toISOString()
        : null,
    });
  }

  /**
   * Deliver webhook notification
   */
  private async deliverWebhook(
    scheduledWorkflow: ScheduledWorkflow,
    execution: ScheduledWorkflowExecution
  ): Promise<void> {
    if (!scheduledWorkflow.webhookUrl) {
      return;
    }

    const deliveryStart = Date.now();

    try {
      const payload = {
        scheduledWorkflowId: scheduledWorkflow.id,
        workflowId: scheduledWorkflow.workflowId,
        executionId: execution.id,
        executedAt: execution.executedAt,
        success: execution.success,
        duration: execution.duration,
        result: execution.result,
        error: execution.error,
      };

      const body = JSON.stringify(payload);

      // Generate HMAC signature if secret is provided
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Timestamp': Date.now().toString(),
      };

      if (scheduledWorkflow.webhookSecret) {
        const signature = createHmac('sha256', scheduledWorkflow.webhookSecret)
          .update(body)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(scheduledWorkflow.webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      execution.webhookDelivered = response.ok;
      execution.webhookDeliveryStatus = response.status;
      execution.webhookDeliveryError = response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`;
      execution.webhookDeliveredAt = Date.now();

      logger.workflowScheduler.info('Webhook delivered', {
        scheduledWorkflowId: scheduledWorkflow.id,
        executionId: execution.id,
        success: response.ok,
        statusCode: response.status,
        duration: Date.now() - deliveryStart,
      });
    } catch (err) {
      execution.webhookDelivered = false;
      execution.webhookDeliveryError = err instanceof Error ? err.message : String(err);

      logger.workflowScheduler.error('Webhook delivery failed', {
        scheduledWorkflowId: scheduledWorkflow.id,
        executionId: execution.id,
        error: execution.webhookDeliveryError,
      });
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop all scheduled executions
   */
  shutdown(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    logger.workflowScheduler.info('Workflow scheduler shutdown complete');
  }
}
