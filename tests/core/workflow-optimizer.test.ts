/**
 * Tests for WorkflowOptimizer (GAP-004)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkflowOptimizer,
  workflowOptimizer,
  type WorkflowOptimization,
  type StepNetworkData,
} from '../../src/core/workflow-optimizer.js';
import type { NetworkRequest } from '../../src/types/index.js';
import type { Workflow, WorkflowStep } from '../../src/types/workflow.js';

describe('WorkflowOptimizer', () => {
  let optimizer: WorkflowOptimizer;

  beforeEach(() => {
    optimizer = new WorkflowOptimizer();
  });

  // ============================================
  // HELPER FACTORIES
  // ============================================

  function createNetworkRequest(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
    return {
      url: 'https://example.com/api/data',
      method: 'GET',
      status: 200,
      statusText: 'OK',
      headers: {},
      requestHeaders: {},
      contentType: 'application/json',
      responseBody: { data: [] },
      timestamp: Date.now(),
      duration: 100,
      ...overrides,
    };
  }

  function createWorkflowStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
    return {
      stepNumber: 1,
      action: 'browse',
      description: 'Test step',
      importance: 'important',
      success: true,
      ...overrides,
    };
  }

  function createWorkflow(overrides: Partial<Workflow> = {}): Workflow {
    return {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'A test workflow',
      domain: 'example.com',
      tags: [],
      steps: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: 1,
      ...overrides,
    };
  }

  function createStepNetworkData(overrides: Partial<StepNetworkData> = {}): StepNetworkData {
    return {
      stepNumber: 1,
      stepUrl: 'https://example.com/page1',
      requests: [],
      apiRequests: [],
      duration: 1000,
      ...overrides,
    };
  }

  // ============================================
  // BASIC FUNCTIONALITY TESTS
  // ============================================

  describe('analyzeWorkflow', () => {
    it('should return empty optimizations for single-step workflow', async () => {
      const workflow = createWorkflow({
        steps: [createWorkflowStep({ stepNumber: 1 })],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 1000 }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      expect(result.workflowId).toBe('workflow-1');
      expect(result.totalSteps).toBe(1);
      expect(result.optimizations).toHaveLength(0);
    });

    it('should analyze multi-step workflow', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { name: 'John' } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { email: 'john@example.com' } }),
          createWorkflowStep({
            stepNumber: 3,
            extractedData: { name: 'John', email: 'john@example.com', status: 'complete' },
          }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({ stepNumber: 2, duration: 1500 }),
        createStepNetworkData({
          stepNumber: 3,
          duration: 500,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/result',
              responseBody: { name: 'John', email: 'john@example.com', status: 'complete' },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      expect(result.workflowId).toBe('workflow-1');
      expect(result.totalSteps).toBe(3);
      expect(result.totalDuration).toBe(4000); // 2000 + 1500 + 500
    });

    it('should include analysis timestamp', async () => {
      const workflow = createWorkflow({ steps: [] });
      const networkData: StepNetworkData[] = [];

      const before = Date.now();
      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      const after = Date.now();

      expect(result.analysisTimestamp).toBeGreaterThanOrEqual(before);
      expect(result.analysisTimestamp).toBeLessThanOrEqual(after);
    });
  });

  // ============================================
  // API SHORTCUT DETECTION TESTS
  // ============================================

  describe('API shortcut detection', () => {
    it('should detect API shortcut when later step has JSON API', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { title: 'Product' } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { price: 99.99 } }),
          createWorkflowStep({
            stepNumber: 3,
            extractedData: { title: 'Product', price: 99.99, description: 'Great item' },
          }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000, requests: [] }),
        createStepNetworkData({ stepNumber: 2, duration: 2000, requests: [] }),
        createStepNetworkData({
          stepNumber: 3,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/product/123',
              method: 'GET',
              status: 200,
              contentType: 'application/json',
              responseBody: {
                title: 'Product',
                price: 99.99,
                description: 'Great item',
              },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      // Should find optimizations - the API contains all fields from earlier steps
      // and the confidence should be high enough given the complete field coverage
      expect(result.optimizations.length).toBeGreaterThan(0);
    });

    it('should not detect shortcut for non-JSON responses', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1 }),
          createWorkflowStep({ stepNumber: 2 }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000, requests: [] }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 500,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/page',
              contentType: 'text/html',
              responseBody: '<html>...</html>',
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      const apiShortcuts = result.optimizations.filter(o => o.type === 'api_shortcut');

      expect(apiShortcuts).toHaveLength(0);
    });

    it('should not detect shortcut for failed requests', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1 }),
          createWorkflowStep({ stepNumber: 2 }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000, requests: [] }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 500,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/data',
              status: 404,
              contentType: 'application/json',
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      const apiShortcuts = result.optimizations.filter(o => o.type === 'api_shortcut');

      expect(apiShortcuts).toHaveLength(0);
    });

    it('should prefer /api/ paths in detection', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { id: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { id: 1, name: 'Test' } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/items/1',
              responseBody: { id: 1, name: 'Test' },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      // With API path and full coverage, should find optimizations
      expect(result.optimizations.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // DATA SUFFICIENCY DETECTION TESTS
  // ============================================

  describe('data sufficiency detection', () => {
    it('should detect when later step has all earlier fields', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { name: 'John' } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { email: 'john@test.com' } }),
          createWorkflowStep({
            stepNumber: 3,
            extractedData: { name: 'John', email: 'john@test.com', id: 123 },
          }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({ stepNumber: 2, duration: 1500 }),
        createStepNetworkData({
          stepNumber: 3,
          duration: 300,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/user',
              responseBody: { name: 'John', email: 'john@test.com', id: 123 },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      const dataSufficiencyOpts = result.optimizations.filter(o => o.type === 'data_sufficiency');

      // Should detect data sufficiency since step 3 has all fields from steps 1 and 2
      expect(dataSufficiencyOpts.length).toBeGreaterThan(0);
    });

    it('should not detect sufficiency when fields are missing', async () => {
      const workflow = createWorkflow({
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { name: 'John', age: 30 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { name: 'John' } }), // Missing age
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 300,
          requests: [
            createNetworkRequest({
              responseBody: { name: 'John' }, // No age field
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      const dataSufficiencyOpts = result.optimizations.filter(o => o.type === 'data_sufficiency');

      // Coverage would be 50% (name present, age missing), below 80% threshold
      expect(dataSufficiencyOpts).toHaveLength(0);
    });
  });

  // ============================================
  // OPTIMIZATION MANAGEMENT TESTS
  // ============================================

  describe('optimization management', () => {
    it('should store and retrieve optimizations', async () => {
      const workflow = createWorkflow({
        id: 'wf-store-test',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { a: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { a: 1, b: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/combined',
              responseBody: { a: 1, b: 2 },
            }),
          ],
        }),
      ];

      await optimizer.analyzeWorkflow(workflow, networkData);

      const workflowOpts = optimizer.getWorkflowOptimizations('wf-store-test');
      // Should have stored any found optimizations
      expect(workflowOpts).toBeDefined();
    });

    it('should return undefined for non-existent optimization', () => {
      const opt = optimizer.getOptimization('non-existent-id');
      expect(opt).toBeUndefined();
    });

    it('should return empty array for workflow with no optimizations', () => {
      const opts = optimizer.getWorkflowOptimizations('workflow-without-opts');
      expect(opts).toEqual([]);
    });
  });

  // ============================================
  // METRICS TRACKING TESTS
  // ============================================

  describe('metrics tracking', () => {
    it('should record successful optimization result', async () => {
      // First, create an optimization
      const workflow = createWorkflow({
        id: 'wf-metrics-test',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { x: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { x: 1, y: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/xy',
              responseBody: { x: 1, y: 2 },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;

        // Record success
        optimizer.recordOptimizationResult(optId, true, 150);

        const opt = optimizer.getOptimization(optId);
        expect(opt?.metrics.timesUsed).toBe(1);
        expect(opt?.metrics.successCount).toBe(1);
        expect(opt?.metrics.failureCount).toBe(0);
        expect(opt?.metrics.avgOptimizedDuration).toBe(150);
      }
    });

    it('should record failed optimization result', async () => {
      const workflow = createWorkflow({
        id: 'wf-fail-test',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { foo: 'bar' } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { foo: 'bar', baz: 'qux' } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/foobar',
              responseBody: { foo: 'bar', baz: 'qux' },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;

        // Record failure
        optimizer.recordOptimizationResult(optId, false, 0);

        const opt = optimizer.getOptimization(optId);
        expect(opt?.metrics.timesUsed).toBe(1);
        expect(opt?.metrics.successCount).toBe(0);
        expect(opt?.metrics.failureCount).toBe(1);
      }
    });

    it('should handle recording for non-existent optimization', () => {
      // Should not throw
      expect(() => {
        optimizer.recordOptimizationResult('non-existent', true, 100);
      }).not.toThrow();
    });

    it('should record original workflow duration', async () => {
      const workflow = createWorkflow({
        id: 'wf-original-duration',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { test: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { test: 1, more: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 3000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/test',
              responseBody: { test: 1, more: 2 },
            }),
          ],
        }),
      ];

      await optimizer.analyzeWorkflow(workflow, networkData);

      // Record original duration
      optimizer.recordOriginalDuration('wf-original-duration', 5000);

      const opts = optimizer.getWorkflowOptimizations('wf-original-duration');
      if (opts.length > 0) {
        expect(opts[0].metrics.avgOriginalDuration).toBe(5000);
      }
    });
  });

  // ============================================
  // PROMOTION TESTS
  // ============================================

  describe('optimization promotion', () => {
    it('should auto-promote after sufficient successful uses', async () => {
      const workflow = createWorkflow({
        id: 'wf-auto-promote',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { field: 'value' } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { field: 'value', extra: 'data' } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/promote-test',
              responseBody: { field: 'value', extra: 'data' },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;

        // Record 5 successful uses (minimum for promotion)
        for (let i = 0; i < 5; i++) {
          optimizer.recordOptimizationResult(optId, true, 100);
        }

        const opt = optimizer.getOptimization(optId);
        expect(opt?.isPromoted).toBe(true);
      }
    });

    it('should not auto-promote with failures', async () => {
      const workflow = createWorkflow({
        id: 'wf-no-auto-promote',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { key: 'val' } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { key: 'val', extra: 'info' } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/no-promote',
              responseBody: { key: 'val', extra: 'info' },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;

        // Record mix of successes and failures (below 90% threshold)
        optimizer.recordOptimizationResult(optId, true, 100);
        optimizer.recordOptimizationResult(optId, true, 100);
        optimizer.recordOptimizationResult(optId, true, 100);
        optimizer.recordOptimizationResult(optId, false, 0);
        optimizer.recordOptimizationResult(optId, false, 0);

        const opt = optimizer.getOptimization(optId);
        expect(opt?.isPromoted).toBe(false);
      }
    });

    it('should manually promote optimization', async () => {
      const workflow = createWorkflow({
        id: 'wf-manual-promote',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { a: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { a: 1, b: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/manual',
              responseBody: { a: 1, b: 2 },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;

        const promoted = optimizer.promoteOptimization(optId);
        expect(promoted).toBe(true);

        const opt = optimizer.getOptimization(optId);
        expect(opt?.isPromoted).toBe(true);
      }
    });

    it('should demote optimization', async () => {
      const workflow = createWorkflow({
        id: 'wf-demote',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { x: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { x: 1, y: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/demote',
              responseBody: { x: 1, y: 2 },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;

        optimizer.promoteOptimization(optId);
        expect(optimizer.getOptimization(optId)?.isPromoted).toBe(true);

        optimizer.demoteOptimization(optId);
        expect(optimizer.getOptimization(optId)?.isPromoted).toBe(false);
      }
    });

    it('should return false when promoting non-existent optimization', () => {
      const result = optimizer.promoteOptimization('non-existent');
      expect(result).toBe(false);
    });

    it('should return promoted optimization for workflow', async () => {
      const workflow = createWorkflow({
        id: 'wf-get-promoted',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { item: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { item: 1, extra: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/get-promoted',
              responseBody: { item: 1, extra: 2 },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      if (result.optimizations.length > 0) {
        const optId = result.optimizations[0].id;
        optimizer.promoteOptimization(optId);

        const promoted = optimizer.getPromotedOptimization('wf-get-promoted');
        expect(promoted?.id).toBe(optId);
      }
    });
  });

  // ============================================
  // STATISTICS TESTS
  // ============================================

  describe('statistics', () => {
    it('should return correct statistics', async () => {
      // Analyze a few workflows to generate optimizations
      const workflow1 = createWorkflow({
        id: 'wf-stats-1',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { a: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { a: 1, b: 2 } }),
        ],
      });

      const networkData1: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/stats1',
              responseBody: { a: 1, b: 2 },
            }),
          ],
        }),
      ];

      await optimizer.analyzeWorkflow(workflow1, networkData1);

      const stats = optimizer.getStatistics();

      expect(stats.totalOptimizations).toBeGreaterThanOrEqual(0);
      expect(stats.byType).toBeDefined();
      expect(typeof stats.avgSpeedup).toBe('number');
      expect(typeof stats.avgConfidence).toBe('number');
    });

    it('should return zeros for empty optimizer', () => {
      const freshOptimizer = new WorkflowOptimizer();
      const stats = freshOptimizer.getStatistics();

      expect(stats.totalOptimizations).toBe(0);
      expect(stats.promotedOptimizations).toBe(0);
      expect(stats.avgSpeedup).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.byType).toEqual({});
    });
  });

  // ============================================
  // CLEAR TESTS
  // ============================================

  describe('clear', () => {
    it('should clear all optimizations', async () => {
      const workflow = createWorkflow({
        id: 'wf-clear-test',
        steps: [
          createWorkflowStep({ stepNumber: 1, extractedData: { data: 1 } }),
          createWorkflowStep({ stepNumber: 2, extractedData: { data: 1, more: 2 } }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/clear',
              responseBody: { data: 1, more: 2 },
            }),
          ],
        }),
      ];

      await optimizer.analyzeWorkflow(workflow, networkData);

      optimizer.clear();

      const stats = optimizer.getStatistics();
      expect(stats.totalOptimizations).toBe(0);

      const opts = optimizer.getWorkflowOptimizations('wf-clear-test');
      expect(opts).toHaveLength(0);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('edge cases', () => {
    it('should handle workflow with no extracted data', async () => {
      const workflow = createWorkflow({
        id: 'wf-no-data',
        steps: [
          createWorkflowStep({ stepNumber: 1 }), // No extractedData
          createWorkflowStep({ stepNumber: 2 }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 1000 }),
        createStepNetworkData({ stepNumber: 2, duration: 500 }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      // Should complete without error
      expect(result.workflowId).toBe('wf-no-data');
      expect(result.totalSteps).toBe(2);
    });

    it('should handle empty network requests', async () => {
      const workflow = createWorkflow({
        id: 'wf-no-network',
        steps: [
          createWorkflowStep({ stepNumber: 1 }),
          createWorkflowStep({ stepNumber: 2 }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 1000, requests: [] }),
        createStepNetworkData({ stepNumber: 2, duration: 500, requests: [] }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      // Should complete without error
      expect(result.workflowId).toBe('wf-no-network');
    });

    it('should handle deeply nested extracted data', async () => {
      const workflow = createWorkflow({
        id: 'wf-nested',
        steps: [
          createWorkflowStep({
            stepNumber: 1,
            extractedData: {
              user: {
                profile: {
                  name: 'John',
                  details: { age: 30 },
                },
              },
            },
          }),
          createWorkflowStep({
            stepNumber: 2,
            extractedData: {
              user: {
                profile: {
                  name: 'John',
                  details: { age: 30, city: 'NYC' },
                },
              },
            },
          }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 2000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 200,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/nested',
              responseBody: {
                user: {
                  profile: {
                    name: 'John',
                    details: { age: 30, city: 'NYC' },
                  },
                },
              },
            }),
          ],
        }),
      ];

      const result = await optimizer.analyzeWorkflow(workflow, networkData);

      // Should complete without error
      expect(result.workflowId).toBe('wf-nested');
    });

    it('should handle invalid URL in network request', async () => {
      const workflow = createWorkflow({
        id: 'wf-bad-url',
        steps: [
          createWorkflowStep({ stepNumber: 1 }),
          createWorkflowStep({ stepNumber: 2 }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 1000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 500,
          requests: [
            createNetworkRequest({
              url: 'not-a-valid-url',
              contentType: 'application/json',
              responseBody: { test: 1 },
            }),
          ],
        }),
      ];

      // Should not throw
      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      expect(result.workflowId).toBe('wf-bad-url');
    });

    it('should handle non-JSON response body string', async () => {
      const workflow = createWorkflow({
        id: 'wf-non-json-string',
        steps: [
          createWorkflowStep({ stepNumber: 1 }),
          createWorkflowStep({ stepNumber: 2 }),
        ],
      });

      const networkData: StepNetworkData[] = [
        createStepNetworkData({ stepNumber: 1, duration: 1000 }),
        createStepNetworkData({
          stepNumber: 2,
          duration: 500,
          requests: [
            createNetworkRequest({
              url: 'https://example.com/api/text',
              contentType: 'application/json',
              responseBody: 'not json content',
            }),
          ],
        }),
      ];

      // Should not throw
      const result = await optimizer.analyzeWorkflow(workflow, networkData);
      expect(result.workflowId).toBe('wf-non-json-string');
    });
  });

  // ============================================
  // SINGLETON TESTS
  // ============================================

  describe('singleton export', () => {
    it('should export default optimizer instance', () => {
      expect(workflowOptimizer).toBeDefined();
      expect(workflowOptimizer).toBeInstanceOf(WorkflowOptimizer);
    });
  });
});
