/**
 * Workflow Recording Types
 *
 * Types for recording browsing workflows and replaying them with variables.
 * Inspired by Anthropic's "Teach Claude" mode but with progressive optimization.
 */

import type { BrowsingAction } from './index.js';

/**
 * Workflow recording session
 */
export interface WorkflowRecording {
  id: string;
  name: string;
  description: string;
  domain: string;
  tags: string[];
  status: 'recording' | 'completed' | 'failed';
  steps: WorkflowStep[];
  startedAt: number;
  completedAt?: number;
  createdBy: string; // tenant ID
}

/**
 * Individual step in a workflow
 */
export interface WorkflowStep {
  stepNumber: number;
  action: 'browse' | 'extract' | 'navigate' | 'wait';
  url?: string;
  description: string;
  userAnnotation?: string;
  importance: 'critical' | 'important' | 'optional';

  // Captured automatically from browse result
  tier?: 'intelligence' | 'lightweight' | 'playwright';
  duration?: number;
  success: boolean;

  // Extraction data
  selectors?: string[];
  extractedData?: any;

  // Patterns learned
  patternsUsed?: string[];
  patternsLearned?: string[];
}

/**
 * Workflow type classification (GAP-003)
 * Used to identify special workflow types like login flows
 */
export type WorkflowType =
  | 'general'       // Default workflow type
  | 'login'         // Authentication/login workflow
  | 'checkout'      // E-commerce checkout workflow
  | 'form'          // Form submission workflow
  | 'search'        // Search/query workflow
  | 'navigation';   // Navigation/browsing workflow

/**
 * Saved workflow (can be replayed)
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  domain: string;
  tags: string[];
  type?: WorkflowType; // GAP-003: Workflow type for special handling (default: 'general')
  steps: WorkflowStep[];

  // Metadata
  version: number;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  successRate: number;

  // Procedural memory integration
  skillId?: string; // Link to ProceduralMemory skill
}

/**
 * Request to start recording
 */
export interface StartRecordingRequest {
  name: string;
  description: string;
  domain: string;
  tags?: string[];
  tenantId: string;
}

/**
 * Request to annotate a step
 */
export interface AnnotateStepRequest {
  stepNumber: number;
  annotation: string;
  importance?: 'critical' | 'important' | 'optional';
}

/**
 * Result of replaying a workflow
 */
export interface WorkflowReplayResult {
  workflowId: string;
  executedAt: number;
  results: WorkflowStepResult[];
  overallSuccess: boolean;
  totalDuration: number;
}

/**
 * Result of executing a single workflow step
 */
export interface WorkflowStepResult {
  stepNumber: number;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  tier?: 'intelligence' | 'lightweight' | 'playwright';
}

/**
 * Variables for workflow replay
 */
export interface WorkflowVariables {
  [key: string]: string | number | boolean;
}

/**
 * FEAT-004: Scheduled Workflow Types
 */

/**
 * Scheduled workflow configuration
 */
export interface ScheduledWorkflow {
  id: string;
  workflowId: string;
  name: string;
  description?: string;

  // Schedule configuration
  schedule: string; // Cron expression (e.g., "0 0 * * *" for daily at midnight)
  timezone?: string; // IANA timezone (default: UTC)
  enabled: boolean;

  // Webhook delivery
  webhookUrl?: string;
  webhookSecret?: string; // HMAC secret for webhook signature

  // Execution options
  variables?: WorkflowVariables;
  retryOnFailure?: boolean;
  maxRetries?: number;

  // Metadata
  createdAt: number;
  updatedAt: number;
  createdBy: string; // tenant ID
  lastExecutedAt?: number;
  nextExecutionAt?: number;

  // Statistics
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
}

/**
 * Request to create a scheduled workflow
 */
export interface CreateScheduledWorkflowRequest {
  workflowId: string;
  name: string;
  description?: string;
  schedule: string;
  timezone?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  variables?: WorkflowVariables;
  retryOnFailure?: boolean;
  maxRetries?: number;
  tenantId: string;
}

/**
 * Request to update a scheduled workflow
 */
export interface UpdateScheduledWorkflowRequest {
  name?: string;
  description?: string;
  schedule?: string;
  timezone?: string;
  enabled?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  variables?: WorkflowVariables;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Result of a scheduled workflow execution
 */
export interface ScheduledWorkflowExecution {
  id: string;
  scheduledWorkflowId: string;
  workflowId: string;
  executedAt: number;
  duration: number;
  success: boolean;
  result: WorkflowReplayResult;
  error?: string;

  // Webhook delivery
  webhookDelivered?: boolean;
  webhookDeliveryStatus?: number;
  webhookDeliveryError?: string;
  webhookDeliveredAt?: number;
}
