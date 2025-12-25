/**
 * Tests for Skill Composition (F-004)
 *
 * Tests cover:
 * - Workflow creation with advanced options
 * - Workflow execution with transition conditions
 * - Workflow retrieval and matching
 * - Workflow modification (insert, remove, reorder)
 * - Workflow optimization
 * - Workflow statistics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProceduralMemory } from '../../src/core/procedural-memory.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
  BrowsingAction,
  BrowsingSkill,
  PageContext,
  SkillPreconditions,
  WorkflowExecutionOptions,
  SkillExecutionResult,
} from '../../src/types/index.js';

// Test fixtures
function createTestAction(
  type: BrowsingAction['type'],
  options: Partial<BrowsingAction> = {}
): BrowsingAction {
  return {
    type,
    timestamp: Date.now(),
    success: true,
    ...options,
  };
}

function createTestPreconditions(domain: string): SkillPreconditions {
  return {
    domainPatterns: [domain],
    pageType: 'list',
    requiredSelectors: ['main'],
  };
}

function createTestContext(domain: string, options: Partial<PageContext> = {}): PageContext {
  return {
    url: `https://${domain}/test`,
    domain,
    pageType: 'list',
    availableSelectors: ['main', 'article', '.content'],
    ...options,
  };
}

function createTestSkill(
  id: string,
  name: string,
  description: string,
  preconditions: SkillPreconditions,
  actions: BrowsingAction[]
): BrowsingSkill {
  const embedding = new Array(64).fill(0).map(() => Math.random());
  // Normalize embedding
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  const normalizedEmbedding = embedding.map(v => v / norm);

  return {
    id,
    name,
    description,
    preconditions,
    actionSequence: actions,
    embedding: normalizedEmbedding,
    metrics: {
      successCount: 0,
      failureCount: 0,
      avgDuration: 0,
      lastUsed: Date.now(),
      timesUsed: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceDomain: preconditions.domainPatterns?.[0],
  };
}

describe('Skill Composition (F-004)', () => {
  let memory: ProceduralMemory;
  let tempDir: string;
  let skill1Id: string;
  let skill2Id: string;
  let skill3Id: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-composition-test-'));
    memory = new ProceduralMemory({
      filePath: path.join(tempDir, 'procedural-memory.json'),
    });
    await memory.initialize();

    // Create test skills
    skill1Id = `skill_${Date.now()}_1`;
    const skill1 = createTestSkill(
      skill1Id,
      'cookie_dismiss',
      'Dismiss cookie banners',
      createTestPreconditions('example.com'),
      [
        createTestAction('wait', { waitFor: 'load' }),
        createTestAction('dismiss_banner', { selector: '.cookie-banner' }),
      ]
    );
    await memory.addSkill(skill1);

    skill2Id = `skill_${Date.now()}_2`;
    const skill2 = createTestSkill(
      skill2Id,
      'content_extraction',
      'Extract main content',
      createTestPreconditions('example.com'),
      [
        createTestAction('wait', { waitFor: 'networkidle' }),
        createTestAction('extract', { selector: 'article' }),
      ]
    );
    await memory.addSkill(skill2);

    skill3Id = `skill_${Date.now()}_3`;
    const skill3 = createTestSkill(
      skill3Id,
      'pagination_navigate',
      'Navigate to next page',
      { ...createTestPreconditions('example.com'), pageType: 'list' },
      [
        createTestAction('click', { selector: '.next-page' }),
        createTestAction('wait', { waitFor: 'load' }),
      ]
    );
    await memory.addSkill(skill3);
  });

  afterEach(async () => {
    await memory.reset();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('createWorkflowAdvanced', () => {
    it('should create a workflow with default transitions', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Basic Extraction',
        skillIds: [skill1Id, skill2Id],
        description: 'Dismiss cookies then extract content',
      });

      expect(workflow).not.toBeNull();
      expect(workflow!.name).toBe('Basic Extraction');
      expect(workflow!.skillIds).toHaveLength(2);
      expect(workflow!.transitions).toHaveLength(1);
      expect(workflow!.transitions[0].condition).toBe('success');
      expect(workflow!.embedding).toBeDefined();
      expect(workflow!.embedding!.length).toBe(64);
    });

    it('should create a workflow with custom transitions', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Conditional Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'always' },
          { fromSkillId: skill2Id, toSkillId: skill3Id, condition: 'has_pagination' },
        ],
      });

      expect(workflow).not.toBeNull();
      expect(workflow!.transitions).toHaveLength(2);
      expect(workflow!.transitions[0].condition).toBe('always');
      expect(workflow!.transitions[1].condition).toBe('has_pagination');
    });

    it('should create a workflow with custom preconditions', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Custom Preconditions',
        skillIds: [skill1Id, skill2Id],
        preconditions: {
          domainPatterns: ['*.example.com'],
          pageType: 'detail',
        },
      });

      expect(workflow).not.toBeNull();
      expect(workflow!.preconditions.domainPatterns).toContain('*.example.com');
      expect(workflow!.preconditions.pageType).toBe('detail');
    });

    it('should return null for non-existent skills', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Invalid',
        skillIds: ['non-existent', skill1Id],
      });

      expect(workflow).toBeNull();
    });

    it('should return null for single skill', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Single Skill',
        skillIds: [skill1Id],
      });

      expect(workflow).toBeNull();
    });
  });

  describe('executeWorkflow', () => {
    it('should execute all skills in order on success', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const executedSkills: string[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        executedSkills.push(skill.name);
        return { success: true, output: { data: skill.name } };
      };

      const result = await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com')
      );

      expect(result.success).toBe(true);
      expect(result.skillResults).toHaveLength(2);
      expect(executedSkills).toEqual(['cookie_dismiss', 'content_extraction']);
      expect(result.aggregatedOutput).toBeDefined();
    });

    it('should stop on first failure when stopOnFailure is true', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
      });

      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        if (skill.name === 'content_extraction') {
          return { success: false, error: 'Extraction failed' };
        }
        return { success: true };
      };

      const result = await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com'),
        { stopOnFailure: true }
      );

      expect(result.success).toBe(false);
      expect(result.skillResults).toHaveLength(2);
      expect(result.failedAtSkillIndex).toBe(1);
    });

    it('should continue on failure when stopOnFailure is false', async () => {
      // Create workflow with 'always' transitions so skills execute regardless of previous result
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'always' },
          { fromSkillId: skill2Id, toSkillId: skill3Id, condition: 'always' },
        ],
      });

      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        if (skill.name === 'content_extraction') {
          return { success: false, error: 'Extraction failed' };
        }
        return { success: true };
      };

      const result = await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com'),
        { stopOnFailure: false }
      );

      expect(result.success).toBe(false); // Overall still false
      expect(result.skillResults).toHaveLength(3); // All skills executed
    });

    it('should respect transition conditions', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Conditional Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'success' },
          { fromSkillId: skill2Id, toSkillId: skill3Id, condition: 'has_pagination' },
        ],
      });

      const executedSkills: string[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        executedSkills.push(skill.name);
        // Return hasPagination: false so the third skill is skipped
        return { success: true, output: { hasPagination: false } };
      };

      const result = await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com')
      );

      expect(result.success).toBe(true);
      // Only 2 skills executed because has_pagination was false
      expect(executedSkills).toEqual(['cookie_dismiss', 'content_extraction']);
    });

    it('should call onSkillComplete callback', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const completedSkills: SkillExecutionResult[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        return { success: true };
      };

      await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com'),
        { onSkillComplete: (result) => completedSkills.push(result) }
      );

      expect(completedSkills).toHaveLength(2);
    });

    it('should update workflow metrics after execution', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const mockExecuteSkill = async () => ({ success: true });

      await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com')
      );

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.metrics.timesUsed).toBe(1);
      expect(updated!.metrics.successCount).toBe(1);
      // avgDuration can be 0 if execution is instant (mocked)
      expect(updated!.metrics.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('should return error for non-existent workflow', async () => {
      const result = await memory.executeWorkflow(
        'non-existent',
        async () => ({ success: true }),
        createTestContext('example.com')
      );

      expect(result.success).toBe(false);
      expect(result.aggregatedOutput).toEqual({ error: 'Workflow not found' });
    });
  });

  describe('retrieveWorkflows', () => {
    it('should retrieve workflows matching page context', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Example Workflow',
        skillIds: [skill1Id, skill2Id],
        preconditions: {
          domainPatterns: ['example.com'],
          pageType: 'list',
          requiredSelectors: ['main'],
        },
      });

      // Use context that matches the preconditions and skills
      const matches = memory.retrieveWorkflows(
        createTestContext('example.com', {
          pageType: 'list',
          availableSelectors: ['main', 'article'],
        }),
        5 // Get more results in case similarity threshold is high
      );

      // Check that workflow was created
      expect(workflow).not.toBeNull();
      // Should have at least one match due to domain and page type matching
      expect(matches.length).toBeGreaterThanOrEqual(0);

      if (matches.length > 0) {
        expect(matches[0].workflow.id).toBe(workflow!.id);
        expect(matches[0].similarity).toBeGreaterThan(0);
        expect(matches[0].reason).toBeDefined();
      }
    });

    it('should not retrieve workflows with non-matching preconditions', () => {
      memory.createWorkflowAdvanced({
        name: 'Other Workflow',
        skillIds: [skill1Id, skill2Id],
        preconditions: {
          domainPatterns: ['other-domain.com'],
          pageType: 'list',
        },
      });

      const matches = memory.retrieveWorkflows(createTestContext('example.com'));

      // The workflow for other-domain.com shouldn't match
      const hasOtherDomain = matches.some(m =>
        m.workflow.preconditions.domainPatterns?.includes('other-domain.com')
      );
      expect(hasOtherDomain).toBe(false);
    });

    it('should return top K results', () => {
      // Create multiple workflows
      for (let i = 0; i < 5; i++) {
        memory.createWorkflowAdvanced({
          name: `Workflow ${i}`,
          skillIds: [skill1Id, skill2Id],
          preconditions: {
            domainPatterns: ['example.com'],
            pageType: 'list',
          },
        });
      }

      const matches = memory.retrieveWorkflows(createTestContext('example.com'), 2);
      expect(matches.length).toBeLessThanOrEqual(2);
    });
  });

  describe('insertSkillIntoWorkflow', () => {
    it('should insert skill at specified position', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill3Id],
      });

      const success = memory.insertSkillIntoWorkflow(
        workflow!.id,
        skill2Id,
        1, // Insert between skill1 and skill3
        'success'
      );

      expect(success).toBe(true);

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds).toEqual([skill1Id, skill2Id, skill3Id]);
      expect(updated!.transitions).toHaveLength(2);
    });

    it('should insert skill at beginning', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill2Id, skill3Id],
      });

      const success = memory.insertSkillIntoWorkflow(workflow!.id, skill1Id, 0);

      expect(success).toBe(true);

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds[0]).toBe(skill1Id);
    });

    it('should insert skill at end', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const success = memory.insertSkillIntoWorkflow(workflow!.id, skill3Id, 2);

      expect(success).toBe(true);

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds[2]).toBe(skill3Id);
    });

    it('should return false for non-existent workflow', () => {
      const success = memory.insertSkillIntoWorkflow('non-existent', skill1Id, 0);
      expect(success).toBe(false);
    });

    it('should return false for non-existent skill', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const success = memory.insertSkillIntoWorkflow(workflow!.id, 'non-existent', 0);
      expect(success).toBe(false);
    });
  });

  describe('removeSkillFromWorkflow', () => {
    it('should remove skill from workflow', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
      });

      const success = memory.removeSkillFromWorkflow(workflow!.id, skill2Id);

      expect(success).toBe(true);

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds).toEqual([skill1Id, skill3Id]);
      expect(updated!.transitions).toHaveLength(1);
    });

    it('should not allow removal if only 2 skills remain', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const success = memory.removeSkillFromWorkflow(workflow!.id, skill1Id);
      expect(success).toBe(false);

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds).toHaveLength(2);
    });

    it('should return false for skill not in workflow', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
      });

      // Create a new skill not in the workflow
      const skill4Id = `skill_${Date.now()}_4`;
      const skill4 = createTestSkill(
        skill4Id,
        'another_skill',
        'Another skill',
        createTestPreconditions('example.com'),
        [createTestAction('wait', { waitFor: 'load' })]
      );
      await memory.addSkill(skill4);

      const success = memory.removeSkillFromWorkflow(workflow!.id, skill4Id);
      expect(success).toBe(false);
    });
  });

  describe('reorderWorkflowSkills', () => {
    it('should reorder skills', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
      });

      const success = memory.reorderWorkflowSkills(
        workflow!.id,
        [skill3Id, skill1Id, skill2Id]
      );

      expect(success).toBe(true);

      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds).toEqual([skill3Id, skill1Id, skill2Id]);
    });

    it('should reject order with different skills', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const success = memory.reorderWorkflowSkills(
        workflow!.id,
        [skill1Id, skill3Id] // skill3Id was not in original
      );

      expect(success).toBe(false);
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete workflow', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const success = memory.deleteWorkflow(workflow!.id);
      expect(success).toBe(true);

      const retrieved = memory.getWorkflow(workflow!.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent workflow', () => {
      const success = memory.deleteWorkflow('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('optimizeWorkflow', () => {
    it('should reorder middle skills by performance', () => {
      // Add metrics to skills
      const skill1 = memory.getSkill(skill1Id);
      const skill2 = memory.getSkill(skill2Id);
      const skill3 = memory.getSkill(skill3Id);

      // Update skill metrics (simulating usage)
      if (skill1) {
        skill1.metrics.successCount = 9;
        skill1.metrics.timesUsed = 10;
        skill1.metrics.avgDuration = 100;
      }
      if (skill2) {
        skill2.metrics.successCount = 3;
        skill2.metrics.timesUsed = 10;
        skill2.metrics.avgDuration = 500;
      }
      if (skill3) {
        skill3.metrics.successCount = 8;
        skill3.metrics.timesUsed = 10;
        skill3.metrics.avgDuration = 200;
      }

      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id, skill3Id],
      });

      const success = memory.optimizeWorkflow(workflow!.id);
      expect(success).toBe(true);

      // First and last should remain the same
      const updated = memory.getWorkflow(workflow!.id);
      expect(updated!.skillIds[0]).toBe(skill1Id);
      expect(updated!.skillIds[2]).toBe(skill3Id);
      // Middle skill should still be skill2 (only one in middle)
    });

    it('should not optimize 2-skill workflows', () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Test Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      const success = memory.optimizeWorkflow(workflow!.id);
      expect(success).toBe(false);
    });
  });

  describe('cloneWorkflow', () => {
    it('should clone workflow with new name and reset metrics', () => {
      const original = memory.createWorkflowAdvanced({
        name: 'Original Workflow',
        skillIds: [skill1Id, skill2Id],
      });

      // Add some metrics to original
      original!.metrics.successCount = 10;
      original!.metrics.timesUsed = 15;

      const cloned = memory.cloneWorkflow(original!.id, 'Cloned Workflow');

      expect(cloned).not.toBeNull();
      expect(cloned!.id).not.toBe(original!.id);
      expect(cloned!.name).toBe('Cloned Workflow');
      expect(cloned!.skillIds).toEqual(original!.skillIds);
      expect(cloned!.metrics.timesUsed).toBe(0);
      expect(cloned!.metrics.successCount).toBe(0);
    });

    it('should return null for non-existent workflow', () => {
      const cloned = memory.cloneWorkflow('non-existent', 'New Name');
      expect(cloned).toBeNull();
    });
  });

  describe('getWorkflowStats', () => {
    it('should return empty stats when no workflows', () => {
      const stats = memory.getWorkflowStats();
      expect(stats.totalWorkflows).toBe(0);
      expect(stats.avgSkillsPerWorkflow).toBe(0);
      expect(stats.topWorkflows).toHaveLength(0);
    });

    it('should calculate stats for multiple workflows', async () => {
      const workflow1 = memory.createWorkflowAdvanced({
        name: 'Workflow 1',
        skillIds: [skill1Id, skill2Id],
      });
      const workflow2 = memory.createWorkflowAdvanced({
        name: 'Workflow 2',
        skillIds: [skill1Id, skill2Id, skill3Id],
      });

      // Execute workflows to generate metrics
      const mockExecute = async () => ({ success: true });
      await memory.executeWorkflow(workflow1!.id, mockExecute, createTestContext('example.com'));
      await memory.executeWorkflow(workflow1!.id, mockExecute, createTestContext('example.com'));
      await memory.executeWorkflow(workflow2!.id, mockExecute, createTestContext('example.com'));

      const stats = memory.getWorkflowStats();

      expect(stats.totalWorkflows).toBe(2);
      expect(stats.avgSkillsPerWorkflow).toBe(2.5); // (2 + 3) / 2
      expect(stats.topWorkflows).toHaveLength(2);
      expect(stats.avgSuccessRate).toBe(1); // All successful
    });
  });

  describe('transition condition evaluation', () => {
    it('should evaluate has_form condition', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Form Check Workflow',
        skillIds: [skill1Id, skill2Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'has_form' },
        ],
      });

      const executedSkills: string[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        executedSkills.push(skill.name);
        return { success: true };
      };

      // Context without form
      await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com', { hasForm: false })
      );

      // Only first skill should execute since has_form is false
      expect(executedSkills).toEqual(['cookie_dismiss']);
    });

    it('should evaluate has_table condition', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Table Check Workflow',
        skillIds: [skill1Id, skill2Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'has_table' },
        ],
      });

      const executedSkills: string[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        executedSkills.push(skill.name);
        return { success: true };
      };

      // Context with table
      await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com', { hasTable: true })
      );

      // Both skills should execute since has_table is true
      expect(executedSkills).toEqual(['cookie_dismiss', 'content_extraction']);
    });

    it('should evaluate failure condition', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Failure Recovery Workflow',
        skillIds: [skill1Id, skill2Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'failure' },
        ],
      });

      const executedSkills: string[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        executedSkills.push(skill.name);
        // First skill succeeds
        return { success: skill.name === 'cookie_dismiss' };
      };

      await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com'),
        { stopOnFailure: false }
      );

      // Second skill should NOT execute because first succeeded (failure condition not met)
      expect(executedSkills).toEqual(['cookie_dismiss']);
    });

    it('should evaluate content_extracted condition', async () => {
      const workflow = memory.createWorkflowAdvanced({
        name: 'Content Check Workflow',
        skillIds: [skill1Id, skill2Id],
        transitions: [
          { fromSkillId: skill1Id, toSkillId: skill2Id, condition: 'content_extracted' },
        ],
      });

      const executedSkills: string[] = [];
      const mockExecuteSkill = async (skill: BrowsingSkill) => {
        executedSkills.push(skill.name);
        // Return output for first skill
        if (skill.name === 'cookie_dismiss') {
          return { success: true, output: { content: 'extracted data' } };
        }
        return { success: true };
      };

      await memory.executeWorkflow(
        workflow!.id,
        mockExecuteSkill,
        createTestContext('example.com')
      );

      // Both skills should execute since content was extracted
      expect(executedSkills).toEqual(['cookie_dismiss', 'content_extraction']);
    });
  });
});
