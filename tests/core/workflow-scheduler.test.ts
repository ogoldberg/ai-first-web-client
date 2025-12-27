/**
 * Workflow Scheduler Tests (FEAT-004)
 *
 * Tests scheduled workflow execution and webhook delivery.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowScheduler } from '../../src/core/workflow-scheduler.js';
import type { SmartBrowser } from '../../src/core/smart-browser.js';
import type { Workflow, CreateScheduledWorkflowRequest, ScheduledWorkflow } from '../../src/types/workflow.js';

// Mock SmartBrowser
const mockSmartBrowser = {
  replayWorkflow: vi.fn(),
} as unknown as SmartBrowser;

describe('FEAT-004: Workflow Scheduler', () => {
  let scheduler: WorkflowScheduler;
  const tenantId = 'test-tenant-123';

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new WorkflowScheduler(mockSmartBrowser, tenantId);
  });

  describe('Cron Expression Validation', () => {
    it('should accept valid cron expressions', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Daily Report',
        schedule: '0 9 * * *', // Daily at 9 AM
        tenantId,
      };

      const workflow = await scheduler.createScheduledWorkflow(request);

      expect(workflow).toBeDefined();
      expect(workflow.schedule).toBe('0 9 * * *');
      expect(workflow.enabled).toBe(true);
    });

    it('should reject invalid cron expressions', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Invalid Schedule',
        schedule: 'not a cron', // Invalid
        tenantId,
      };

      await expect(scheduler.createScheduledWorkflow(request)).rejects.toThrow('Invalid cron expression');
    });

    it('should reject cron with wrong number of parts', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Wrong Parts',
        schedule: '0 9 *', // Only 3 parts, need 5
        tenantId,
      };

      await expect(scheduler.createScheduledWorkflow(request)).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('Scheduled Workflow CRUD', () => {
    it('should create a scheduled workflow', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test Workflow',
        description: 'Test description',
        schedule: '0 * * * *', // Every hour
        timezone: 'America/New_York',
        webhookUrl: 'https://example.com/webhook',
        webhookSecret: 'secret123',
        variables: { key: 'value' },
        retryOnFailure: true,
        maxRetries: 3,
        tenantId,
      };

      const workflow = await scheduler.createScheduledWorkflow(request);

      expect(workflow.id).toBeDefined();
      expect(workflow.name).toBe('Test Workflow');
      expect(workflow.schedule).toBe('0 * * * *');
      expect(workflow.timezone).toBe('America/New_York');
      expect(workflow.webhookUrl).toBe('https://example.com/webhook');
      expect(workflow.enabled).toBe(true);
      expect(workflow.totalExecutions).toBe(0);
      expect(workflow.nextExecutionAt).toBeGreaterThan(Date.now());
    });

    it('should list scheduled workflows', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test 1',
        schedule: '0 * * * *',
        tenantId,
      };

      await scheduler.createScheduledWorkflow(request);
      await scheduler.createScheduledWorkflow({ ...request, name: 'Test 2' });

      const workflows = scheduler.listScheduledWorkflows();

      expect(workflows.length).toBe(2);
    });

    it('should get a specific scheduled workflow', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 * * * *',
        tenantId,
      };

      const created = await scheduler.createScheduledWorkflow(request);
      const retrieved = scheduler.getScheduledWorkflow(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should update a scheduled workflow', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Original Name',
        schedule: '0 * * * *',
        tenantId,
      };

      const created = await scheduler.createScheduledWorkflow(request);
      const updated = await scheduler.updateScheduledWorkflow(created.id, {
        name: 'Updated Name',
        enabled: false,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.enabled).toBe(false);
    });

    it('should delete a scheduled workflow', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 * * * *',
        tenantId,
      };

      const created = await scheduler.createScheduledWorkflow(request);
      await scheduler.deleteScheduledWorkflow(created.id);

      const retrieved = scheduler.getScheduledWorkflow(created.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Webhook URL Validation', () => {
    it('should accept valid webhook URLs', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 * * * *',
        webhookUrl: 'https://example.com/webhook',
        tenantId,
      };

      const workflow = await scheduler.createScheduledWorkflow(request);
      expect(workflow.webhookUrl).toBe('https://example.com/webhook');
    });

    it('should reject invalid webhook URLs', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 * * * *',
        webhookUrl: 'not a url',
        tenantId,
      };

      await expect(scheduler.createScheduledWorkflow(request)).rejects.toThrow('Invalid webhook URL');
    });
  });

  describe('Workflow Registration', () => {
    it('should register workflows for replay', () => {
      const workflow: Workflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        description: 'Test',
        domain: 'example.com',
        tags: [],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 1.0,
      };

      scheduler.registerWorkflow(workflow);

      // Workflow is now available for scheduled execution
      expect(() => scheduler.registerWorkflow(workflow)).not.toThrow();
    });
  });

  describe('Execution History', () => {
    it('should retrieve execution history', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 * * * *',
        tenantId,
      };

      const workflow = await scheduler.createScheduledWorkflow(request);
      const history = scheduler.getExecutionHistory(workflow.id);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0); // No executions yet
    });

    it('should limit execution history', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 * * * *',
        tenantId,
      };

      const workflow = await scheduler.createScheduledWorkflow(request);
      const history = scheduler.getExecutionHistory(workflow.id, 10);

      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Schedule Updates', () => {
    it('should recalculate next execution when schedule changes', async () => {
      const request: CreateScheduledWorkflowRequest = {
        workflowId: 'workflow-1',
        name: 'Test',
        schedule: '0 9 * * *', // 9 AM daily
        tenantId,
      };

      const created = await scheduler.createScheduledWorkflow(request);
      const originalNext = created.nextExecutionAt;

      const updated = await scheduler.updateScheduledWorkflow(created.id, {
        schedule: '0 17 * * *', // 5 PM daily
      });

      expect(updated.nextExecutionAt).not.toBe(originalNext);
      expect(updated.schedule).toBe('0 17 * * *');
    });
  });

  describe('Workflow Shutdown', () => {
    it('should shutdown cleanly', () => {
      expect(() => scheduler.shutdown()).not.toThrow();
    });
  });
});
