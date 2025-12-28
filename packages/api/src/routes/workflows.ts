/**
 * Workflow Recording API Routes
 *
 * COMP-009: API endpoints for workflow recording and replay
 *
 * Endpoints:
 * - POST /v1/workflows/record/start - Start recording session
 * - POST /v1/workflows/record/:id/stop - Stop and save recording
 * - POST /v1/workflows/record/:id/annotate - Annotate a step
 * - POST /v1/workflows/:id/replay - Replay workflow with variables
 * - GET /v1/workflows - List workflows
 * - GET /v1/workflows/:id - Get workflow details
 * - DELETE /v1/workflows/:id - Delete workflow
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { ProceduralMemory } from '../../../../src/core/procedural-memory.js';
import { getWorkflowRecorder } from './browse.js';
import { getBrowserClient } from '../services/browser.js';

const workflows = new Hono();

// Apply auth and rate limiting to all routes
workflows.use('*', authMiddleware);
workflows.use('*', rateLimitMiddleware);

// Singleton instances (in production, these would be properly managed)
const proceduralMemory = new ProceduralMemory();

// Initialize ProceduralMemory
proceduralMemory.initialize().catch(err => {
  console.error('Failed to initialize ProceduralMemory:', err);
});

// ============================================
// Request Validators
// ============================================

const startRecordingValidator = zValidator(
  'json',
  z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    domain: z.string().min(1).max(500),
    tags: z.array(z.string()).optional(),
  })
);

const annotateStepValidator = zValidator(
  'json',
  z.object({
    stepNumber: z.number().int().min(1),
    annotation: z.string().min(1).max(500),
    importance: z.enum(['critical', 'important', 'optional']).optional(),
  })
);

const stopRecordingValidator = zValidator(
  'json',
  z.object({
    save: z.boolean().optional().default(true),
  })
);

const replayWorkflowValidator = zValidator(
  'json',
  z.object({
    variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
);

// ============================================
// Endpoints
// ============================================

/**
 * POST /v1/workflows/record/start
 * Start a new workflow recording session
 */
workflows.post('/record/start', requirePermission('browse'), startRecordingValidator, async (c) => {
  const tenant = c.get('tenant');
  const body = c.req.valid('json');

  try {
    const workflowRecorder = getWorkflowRecorder();
    const recordingId = await workflowRecorder.startRecording({
      name: body.name,
      description: body.description,
      domain: body.domain,
      tags: body.tags || [],
      tenantId: tenant.id,
    });

    return c.json({
      success: true,
      data: {
        recordingId,
        status: 'recording',
        startedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'RECORDING_START_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * POST /v1/workflows/record/:id/stop
 * Stop recording and optionally save as workflow
 */
workflows.post('/record/:id/stop', requirePermission('browse'), stopRecordingValidator, async (c) => {
  const recordingId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const workflowRecorder = getWorkflowRecorder();
    const workflow = await workflowRecorder.stopRecording(recordingId, body.save);

    if (!workflow) {
      return c.json({
        success: true,
        data: {
          recordingId,
          saved: false,
          message: 'Recording discarded',
        },
      });
    }

    // Store in ProceduralMemory for persistence
    await proceduralMemory.storeWorkflow(workflow);

    // Create skill from workflow for automatic application
    const skill = await proceduralMemory.createSkillFromWorkflow(workflow);

    return c.json({
      success: true,
      data: {
        workflowId: workflow.id,
        skillId: skill.id,
        name: workflow.name,
        steps: workflow.steps.length,
        estimatedDuration: workflow.steps.reduce((sum, s) => sum + (s.duration || 0), 0),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'RECORDING_STOP_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * POST /v1/workflows/record/:id/annotate
 * Annotate a step in an active recording
 */
workflows.post('/record/:id/annotate', requirePermission('browse'), annotateStepValidator, async (c) => {
  const recordingId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const workflowRecorder = getWorkflowRecorder();
    await workflowRecorder.annotateStep(recordingId, {
      stepNumber: body.stepNumber,
      annotation: body.annotation,
      importance: body.importance,
    });

    return c.json({
      success: true,
      data: {
        recordingId,
        stepNumber: body.stepNumber,
        annotated: true,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'ANNOTATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * GET /v1/workflows/record/:id
 * Get active recording session details
 */
workflows.get('/record/:id', requirePermission('browse'), async (c) => {
  const recordingId = c.req.param('id');

  try {
    const workflowRecorder = getWorkflowRecorder();
    const recording = workflowRecorder.getRecording(recordingId);

    if (!recording) {
      return c.json({
        success: false,
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: `Recording ${recordingId} not found`,
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        recordingId: recording.id,
        name: recording.name,
        description: recording.description,
        domain: recording.domain,
        status: recording.status,
        steps: recording.steps.length,
        startedAt: new Date(recording.startedAt).toISOString(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'RECORDING_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * POST /v1/workflows/:id/replay
 * Replay a saved workflow with optional variables
 */
workflows.post('/:id/replay', requirePermission('browse'), replayWorkflowValidator, async (c) => {
  const workflowId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    // Get SmartBrowser client for workflow replay
    const browserClient = await getBrowserClient();

    const result = await proceduralMemory.replayWorkflow(
      workflowId,
      body.variables as Record<string, string | number | boolean> | undefined,
      browserClient
    );

    return c.json({
      success: true,
      data: {
        workflowId: result.workflowId,
        overallSuccess: result.overallSuccess,
        totalDuration: result.totalDuration,
        results: result.results.map(r => ({
          stepNumber: r.stepNumber,
          success: r.success,
          duration: r.duration,
          tier: r.tier,
          error: r.error,
        })),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'REPLAY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * GET /v1/workflows
 * List all workflows for the authenticated tenant
 */
workflows.get('/', requirePermission('browse'), async (c) => {
  const domain = c.req.query('domain');
  const tags = c.req.query('tags')?.split(',');

  try {
    const workflowRecorder = getWorkflowRecorder();
    const allWorkflows = workflowRecorder.listWorkflows(domain, tags);

    return c.json({
      success: true,
      data: {
        workflows: allWorkflows.map(w => ({
          id: w.id,
          name: w.name,
          description: w.description,
          domain: w.domain,
          tags: w.tags,
          steps: w.steps.length,
          version: w.version,
          usageCount: w.usageCount,
          successRate: w.successRate,
          createdAt: new Date(w.createdAt).toISOString(),
          updatedAt: new Date(w.updatedAt).toISOString(),
        })),
        total: allWorkflows.length,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'LIST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * GET /v1/workflows/:id
 * Get workflow details including full step information
 */
workflows.get('/:id', requirePermission('browse'), async (c) => {
  const workflowId = c.req.param('id');

  try {
    const workflowRecorder = getWorkflowRecorder();
    const workflow = workflowRecorder.getWorkflow(workflowId);

    if (!workflow) {
      return c.json({
        success: false,
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: `Workflow ${workflowId} not found`,
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        domain: workflow.domain,
        tags: workflow.tags,
        version: workflow.version,
        usageCount: workflow.usageCount,
        successRate: workflow.successRate,
        skillId: workflow.skillId,
        steps: workflow.steps.map(s => ({
          stepNumber: s.stepNumber,
          action: s.action,
          url: s.url,
          description: s.description,
          userAnnotation: s.userAnnotation,
          importance: s.importance,
          tier: s.tier,
          duration: s.duration,
          success: s.success,
        })),
        createdAt: new Date(workflow.createdAt).toISOString(),
        updatedAt: new Date(workflow.updatedAt).toISOString(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'WORKFLOW_GET_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * DELETE /v1/workflows/:id
 * Delete a saved workflow
 */
workflows.delete('/:id', requirePermission('browse'), async (c) => {
  const workflowId = c.req.param('id');

  try {
    const workflowRecorder = getWorkflowRecorder();
    const deleted = await workflowRecorder.deleteWorkflow(workflowId);

    if (!deleted) {
      return c.json({
        success: false,
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: `Workflow ${workflowId} not found`,
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        workflowId,
        deleted: true,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

export default workflows;
