/**
 * Workflow Recorder
 *
 * Manages workflow recording sessions, capturing browse operations
 * and converting them to replayable workflows.
 *
 * Features:
 * - Recording session management
 * - Automatic step capture from browse results
 * - User annotations and importance levels
 * - Conversion to ProceduralMemory skills
 */

import { logger } from '../utils/logger.js';
import type {
  WorkflowRecording,
  WorkflowStep,
  Workflow,
  StartRecordingRequest,
  AnnotateStepRequest,
} from '../types/workflow.js';
import type { SmartBrowseResult } from './smart-browser.js';

export class WorkflowRecorder {
  private activeSessions: Map<string, WorkflowRecording> = new Map();
  private workflows: Map<string, Workflow> = new Map();

  /**
   * Start a new recording session
   */
  async startRecording(request: StartRecordingRequest): Promise<string> {
    const recordingId = this.generateRecordingId();

    const recording: WorkflowRecording = {
      id: recordingId,
      name: request.name,
      description: request.description,
      domain: request.domain,
      tags: request.tags || [],
      status: 'recording',
      steps: [],
      startedAt: Date.now(),
      createdBy: request.tenantId,
    };

    this.activeSessions.set(recordingId, recording);

    logger.workflowRecorder.info('Recording session started', {
      recordingId,
      name: request.name,
      domain: request.domain,
    });

    return recordingId;
  }

  /**
   * Record a step from a browse result
   *
   * IMPORTANT: Stores only metadata, not actual content, to comply with
   * copyright and privacy regulations. Full content is re-fetched on replay.
   */
  async recordStep(recordingId: string, browseResult: SmartBrowseResult): Promise<void> {
    const recording = this.activeSessions.get(recordingId);
    if (!recording) {
      throw new Error(`Recording session not found: ${recordingId}`);
    }

    if (recording.status !== 'recording') {
      throw new Error(`Recording session ${recordingId} is not active (status: ${recording.status})`);
    }

    const step: WorkflowStep = {
      stepNumber: recording.steps.length + 1,
      action: 'browse',
      url: browseResult.url,
      description: `Browse ${browseResult.url}`,
      importance: 'important',
      tier: browseResult.learning?.renderTier,
      duration: browseResult.metadata?.loadTime,
      success: true,
      selectors: browseResult.learning?.selectorsUsed,
      // Store only metadata, not actual content (compliance requirement)
      extractedData: {
        title: browseResult.title,
        // Content metadata (not actual content - compliance)
        contentLength: browseResult.content?.markdown?.length || 0,
        contentType: 'markdown',
        hasContent: (browseResult.content?.markdown?.length || 0) > 0,
        // Table schemas (structure, not data - compliance)
        tableSchemas: browseResult.tables?.map(t => ({
          headers: t.headers,
          rowCount: t.data?.length || 0,
          caption: t.caption,
        })),
      },
      patternsUsed: browseResult.learning?.skillApplied ? [browseResult.learning.skillApplied] : undefined,
    };

    recording.steps.push(step);

    logger.workflowRecorder.debug('Step recorded', {
      recordingId,
      stepNumber: step.stepNumber,
      url: browseResult.url,
      tier: step.tier,
      contentLength: step.extractedData.contentLength,
    });
  }

  /**
   * Annotate a step with user description and importance
   */
  async annotateStep(
    recordingId: string,
    request: AnnotateStepRequest
  ): Promise<void> {
    const recording = this.activeSessions.get(recordingId);
    if (!recording) {
      throw new Error(`Recording session not found: ${recordingId}`);
    }

    const step = recording.steps.find(s => s.stepNumber === request.stepNumber);
    if (!step) {
      throw new Error(`Step ${request.stepNumber} not found in recording ${recordingId}`);
    }

    step.userAnnotation = request.annotation;
    if (request.importance) {
      step.importance = request.importance;
    }

    logger.workflowRecorder.debug('Step annotated', {
      recordingId,
      stepNumber: request.stepNumber,
      annotation: request.annotation,
      importance: request.importance,
    });
  }

  /**
   * Stop recording and optionally save as workflow
   */
  async stopRecording(recordingId: string, save: boolean = true): Promise<Workflow | null> {
    const recording = this.activeSessions.get(recordingId);
    if (!recording) {
      throw new Error(`Recording session not found: ${recordingId}`);
    }

    recording.status = 'completed';
    recording.completedAt = Date.now();

    this.activeSessions.delete(recordingId);

    logger.workflowRecorder.info('Recording session stopped', {
      recordingId,
      save,
      steps: recording.steps.length,
    });

    if (!save) {
      return null;
    }

    // Convert recording to workflow
    const workflow = this.recordingToWorkflow(recording);
    this.workflows.set(workflow.id, workflow);

    logger.workflowRecorder.info('Workflow created', {
      workflowId: workflow.id,
      name: workflow.name,
      steps: workflow.steps.length,
    });

    return workflow;
  }

  /**
   * Get active recording session
   */
  getRecording(recordingId: string): WorkflowRecording | undefined {
    return this.activeSessions.get(recordingId);
  }

  /**
   * Get saved workflow
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * List all workflows
   */
  listWorkflows(domain?: string, tags?: string[]): Workflow[] {
    let workflows = Array.from(this.workflows.values());

    if (domain) {
      workflows = workflows.filter(w => w.domain === domain);
    }

    if (tags && tags.length > 0) {
      workflows = workflows.filter(w =>
        tags.some(tag => w.tags.includes(tag))
      );
    }

    // Sort by usage count (most used first)
    return workflows.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const deleted = this.workflows.delete(workflowId);

    if (deleted) {
      logger.workflowRecorder.info('Workflow deleted', { workflowId });
    }

    return deleted;
  }

  /**
   * Update workflow usage stats
   */
  async updateWorkflowStats(workflowId: string, success: boolean): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return;
    }

    workflow.usageCount++;

    // Update success rate using exponential moving average
    const alpha = 0.2; // Weight for new observation
    const newValue = success ? 1.0 : 0.0;
    workflow.successRate = workflow.successRate * (1 - alpha) + newValue * alpha;

    workflow.updatedAt = Date.now();

    logger.workflowRecorder.debug('Workflow stats updated', {
      workflowId,
      usageCount: workflow.usageCount,
      successRate: workflow.successRate,
    });
  }

  /**
   * Convert recording to workflow
   */
  private recordingToWorkflow(recording: WorkflowRecording): Workflow {
    const workflowId = this.generateWorkflowId();

    return {
      id: workflowId,
      name: recording.name,
      description: recording.description,
      domain: recording.domain,
      tags: recording.tags,
      steps: recording.steps,
      version: 1,
      createdAt: recording.startedAt,
      updatedAt: recording.completedAt || Date.now(),
      usageCount: 0,
      successRate: 1.0, // Assume success since it was just recorded
    };
  }

  /**
   * Generate unique recording ID
   */
  private generateRecordingId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate unique workflow ID
   */
  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
