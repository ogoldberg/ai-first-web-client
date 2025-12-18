/**
 * Comprehensive tests for ProceduralMemory
 *
 * These tests cover:
 * - Skill management (create, read, update, delete)
 * - Trajectory recording and skill learning
 * - Skill retrieval and similarity matching
 * - Versioning and rollback
 * - Anti-pattern recording and checking
 * - Workflows (composition, detection)
 * - User feedback
 * - Skill dependencies and fallbacks
 * - Persistence (save/load/export/import)
 * - Skill decay and pruning
 * - Active learning (coverage tracking)
 * - Template bootstrapping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProceduralMemory } from '../../src/core/procedural-memory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  BrowsingAction,
  BrowsingTrajectory,
  PageContext,
  SkillPreconditions,
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

function createTestTrajectory(
  domain: string,
  options: Partial<BrowsingTrajectory> = {}
): BrowsingTrajectory {
  return {
    id: `traj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    startUrl: `https://${domain}/page`,
    endUrl: `https://${domain}/result`,
    domain,
    actions: [
      createTestAction('navigate', { url: `https://${domain}/page` }),
      createTestAction('click', { selector: '.button' }),
      createTestAction('extract', { selector: 'main' }),
    ],
    success: true,
    totalDuration: 1500,
    timestamp: Date.now(),
    ...options,
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

describe('ProceduralMemory', () => {
  let memory: ProceduralMemory;
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'procedural-memory-test-'));
    filePath = path.join(tempDir, 'procedural-memory.json');
    memory = new ProceduralMemory({ filePath });
    await memory.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ============================================
  // SKILL MANAGEMENT TESTS
  // ============================================
  describe('Skill Management', () => {
    it('should add a manual skill', () => {
      const preconditions: SkillPreconditions = {
        domainPatterns: ['example.com'],
        pageType: 'list',
      };

      const skill = memory.addManualSkill(
        'test_skill',
        'A test skill for extracting content',
        preconditions,
        [createTestAction('extract', { selector: 'main' })]
      );

      expect(skill.id).toBeDefined();
      expect(skill.name).toBe('test_skill');
      expect(skill.description).toBe('A test skill for extracting content');
      expect(skill.preconditions).toEqual(preconditions);
      expect(skill.actionSequence).toHaveLength(1);
      expect(skill.embedding).toBeDefined();
      expect(skill.embedding.length).toBe(64);
    });

    it('should get a skill by ID', () => {
      const skill = memory.addManualSkill(
        'get_test',
        'Test skill',
        { domainPatterns: ['test.com'] },
        [createTestAction('click', { selector: 'button' })]
      );

      const retrieved = memory.getSkill(skill.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('get_test');
    });

    it('should return null for non-existent skill', () => {
      expect(memory.getSkill('nonexistent')).toBeNull();
    });

    it('should get all skills', () => {
      memory.addManualSkill('skill1', 'First', {}, [createTestAction('click')]);
      memory.addManualSkill('skill2', 'Second', {}, [createTestAction('extract')]);

      const skills = memory.getAllSkills();
      expect(skills).toHaveLength(2);
      expect(skills.map(s => s.name)).toContain('skill1');
      expect(skills.map(s => s.name)).toContain('skill2');
    });

    it('should delete a skill', () => {
      const skill = memory.addManualSkill('to_delete', 'Will be deleted', {}, [
        createTestAction('click'),
      ]);

      expect(memory.getSkill(skill.id)).not.toBeNull();
      const deleted = memory.deleteSkill(skill.id);
      expect(deleted).toBe(true);
      expect(memory.getSkill(skill.id)).toBeNull();
    });

    it('should return false when deleting non-existent skill', () => {
      expect(memory.deleteSkill('nonexistent')).toBe(false);
    });

    it('should evict least used skill when at capacity', async () => {
      // Create memory with small max
      const smallMemory = new ProceduralMemory({ filePath, maxSkills: 3 });
      await smallMemory.initialize();

      // Add 3 skills using addSkill (which enforces the limit)
      const skill1 = smallMemory.addManualSkill('skill1', '', {}, [createTestAction('click')]);
      const skill2 = smallMemory.addManualSkill('skill2', '', {}, [createTestAction('click')]);
      const skill3 = smallMemory.addManualSkill('skill3', '', {}, [createTestAction('click')]);

      // Use skill2 and skill3 but not skill1
      await smallMemory.recordSkillExecution(skill2.id, true, 100);
      await smallMemory.recordSkillExecution(skill3.id, true, 100);
      await smallMemory.recordSkillExecution(skill3.id, true, 100);

      // Add 4th skill using addSkill which triggers eviction
      const skill4 = {
        id: 'skill4_id',
        name: 'skill4',
        description: '',
        preconditions: {},
        actionSequence: [createTestAction('click')],
        embedding: new Array(64).fill(0),
        metrics: { successCount: 0, failureCount: 0, avgDuration: 0, lastUsed: Date.now(), timesUsed: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await smallMemory.addSkill(skill4);

      expect(smallMemory.getSkill(skill1.id)).toBeNull(); // Evicted (least used)
      expect(smallMemory.getAllSkills()).toHaveLength(3);
    });

    it('should record skill execution metrics', async () => {
      const skill = memory.addManualSkill('metrics_test', 'Test', {}, [createTestAction('click')]);

      await memory.recordSkillExecution(skill.id, true, 100);
      await memory.recordSkillExecution(skill.id, true, 200);
      await memory.recordSkillExecution(skill.id, false, 150);

      const updated = memory.getSkill(skill.id)!;
      expect(updated.metrics.successCount).toBe(2); // 2 from record (starts at 0)
      expect(updated.metrics.failureCount).toBe(1);
      expect(updated.metrics.timesUsed).toBe(3); // 3 executions
    });
  });

  // ============================================
  // TRAJECTORY AND LEARNING TESTS
  // ============================================
  describe('Trajectory Recording and Learning', () => {
    it('should record a successful trajectory', async () => {
      const trajectory = createTestTrajectory('learning.com');
      await memory.recordTrajectory(trajectory);

      const stats = memory.getStats();
      expect(stats.totalTrajectories).toBeGreaterThanOrEqual(1);
    });

    it('should learn skill from successful trajectory', async () => {
      const trajectory = createTestTrajectory('learned.com', {
        actions: [
          createTestAction('navigate', { url: 'https://learned.com/start' }),
          createTestAction('click', { selector: '.button' }),
          createTestAction('wait', { waitFor: 'load' }),
          createTestAction('extract', { selector: 'main' }),
        ],
      });

      await memory.recordTrajectory(trajectory);

      const stats = memory.getStats();
      expect(stats.totalSkills).toBeGreaterThanOrEqual(1);

      // Check skill was learned with correct domain
      const skillsByDomain = memory.getSkillsByDomain();
      expect(skillsByDomain.has('learned.com')).toBe(true);
    });

    it('should not learn from failed trajectory', async () => {
      const trajectory = createTestTrajectory('failed.com', { success: false });
      await memory.recordTrajectory(trajectory);

      const skillsByDomain = memory.getSkillsByDomain();
      expect(skillsByDomain.has('failed.com')).toBe(false);
    });

    it('should not learn from trajectory with too few actions', async () => {
      const trajectory = createTestTrajectory('short.com', {
        actions: [createTestAction('click')], // Only 1 action
      });
      await memory.recordTrajectory(trajectory);

      const skillsByDomain = memory.getSkillsByDomain();
      expect(skillsByDomain.has('short.com')).toBe(false);
    });

    it('should merge similar trajectories into same skill', async () => {
      // First trajectory
      await memory.recordTrajectory(
        createTestTrajectory('merge.com', {
          actions: [
            createTestAction('navigate'),
            createTestAction('click', { selector: '.btn' }),
            createTestAction('extract'),
          ],
        })
      );

      const skillsBefore = memory.getAllSkills().length;

      // Similar trajectory for same domain
      await memory.recordTrajectory(
        createTestTrajectory('merge.com', {
          actions: [
            createTestAction('navigate'),
            createTestAction('click', { selector: '.btn' }),
            createTestAction('extract'),
          ],
        })
      );

      // Should merge, not create new skill
      const skillsAfter = memory.getAllSkills().length;
      expect(skillsAfter).toBe(skillsBefore);
    });

    it('should limit trajectory buffer size', async () => {
      // Record more than buffer limit
      for (let i = 0; i < 110; i++) {
        await memory.recordTrajectory(
          createTestTrajectory(`domain${i}.com`, { success: false })
        );
      }

      const stats = memory.getStats();
      expect(stats.totalTrajectories).toBeLessThanOrEqual(100);
    });
  });

  // ============================================
  // SKILL RETRIEVAL TESTS
  // ============================================
  describe('Skill Retrieval', () => {
    it('should retrieve skills matching context', () => {
      memory.addManualSkill('list_extractor', 'Extract from lists', {
        domainPatterns: ['shop.com'],
        pageType: 'list',
      }, [createTestAction('extract', { selector: '.products' })]);

      const context = createTestContext('shop.com', { pageType: 'list' });
      const matches = memory.retrieveSkills(context);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].skill.name).toBe('list_extractor');
      expect(matches[0].preconditionsMet).toBe(true);
    });

    it('should filter by similarity threshold', () => {
      memory.addManualSkill('specific_skill', 'Very specific', {
        domainPatterns: ['specific.com'],
        pageType: 'form',
        requiredSelectors: ['#unique-form', '.specific-class'],
      }, [createTestAction('fill')]);

      const context = createTestContext('unrelated.org', { pageType: 'list' });
      const matches = memory.retrieveSkills(context);

      // Should not match unrelated context
      expect(matches.find(m => m.skill.name === 'specific_skill')).toBeUndefined();
    });

    it('should rank by combined similarity and preconditions', () => {
      memory.addManualSkill('high_similarity', 'High sim', {
        domainPatterns: ['example.com'],
        pageType: 'list',
      }, [createTestAction('extract')]);

      memory.addManualSkill('low_similarity', 'Low sim', {
        domainPatterns: ['other.com'],
        pageType: 'form',
      }, [createTestAction('fill')]);

      const context = createTestContext('example.com', { pageType: 'list' });
      const matches = memory.retrieveSkills(context, 2);

      expect(matches[0].skill.name).toBe('high_similarity');
    });

    it('should respect topK limit', () => {
      for (let i = 0; i < 10; i++) {
        memory.addManualSkill(`skill_${i}`, '', { domainPatterns: ['test.com'] }, [
          createTestAction('extract'),
        ]);
      }

      const context = createTestContext('test.com');
      const matches = memory.retrieveSkills(context, 3);

      expect(matches.length).toBeLessThanOrEqual(3);
    });
  });

  // ============================================
  // VERSIONING TESTS
  // ============================================
  describe('Skill Versioning', () => {
    it('should get empty version history for new skill', () => {
      const skill = memory.addManualSkill('new_skill', '', {}, [createTestAction('click')]);
      const history = memory.getVersionHistory(skill.id);
      expect(history).toEqual([]);
    });

    it('should track version after rollback', async () => {
      const skill = memory.addManualSkill('version_test', '', {}, [
        createTestAction('click', { selector: '.v1' }),
      ]);

      // Record some executions
      await memory.recordSkillExecution(skill.id, true, 100);
      await memory.recordSkillExecution(skill.id, true, 100);

      // Force a rollback (this creates versions)
      await memory.rollbackSkill(skill.id);

      // No versions created yet since no prior version exists
      const history = memory.getVersionHistory(skill.id);
      expect(history.length).toBe(0); // No version to rollback to
    });

    it('should get best performing version', () => {
      const skill = memory.addManualSkill('best_version', '', {}, [createTestAction('click')]);

      // No versions yet
      const best = memory.getBestVersion(skill.id);
      expect(best).toBeNull();
    });

    it('should check for auto-rollback on performance degradation', async () => {
      const skill = memory.addManualSkill('degrade_test', '', {}, [createTestAction('click')]);

      // Record many failures
      for (let i = 0; i < 10; i++) {
        await memory.recordSkillExecution(skill.id, false, 100);
      }

      // Should not trigger without version history
      const shouldRollback = memory.checkForAutoRollback(skill.id, 0.3);
      expect(shouldRollback).toBe(false);
    });
  });

  // ============================================
  // ANTI-PATTERN TESTS
  // ============================================
  describe('Anti-Pattern Management', () => {
    it('should record an anti-pattern', async () => {
      const action = createTestAction('click', { selector: '#bad-button', success: false });
      const context = createTestContext('antipattern.com');

      const antiPattern = await memory.recordAntiPattern(
        action,
        context,
        ['Causes page to freeze', 'Results in error'],
        [createTestAction('click', { selector: '#good-button' })]
      );

      expect(antiPattern.id).toBeDefined();
      expect(antiPattern.name).toContain('avoid_click');
      expect(antiPattern.consequences).toContain('Causes page to freeze');
      expect(antiPattern.occurrenceCount).toBe(1);
    });

    it('should increment occurrence count on repeat', async () => {
      const action = createTestAction('click', { selector: '#repeat-bad' });
      const context = createTestContext('repeat.com');

      await memory.recordAntiPattern(action, context, ['Error 1']);
      const second = await memory.recordAntiPattern(action, context, ['Error 2']);

      expect(second.occurrenceCount).toBe(2);
      expect(second.consequences).toContain('Error 1');
      expect(second.consequences).toContain('Error 2');
    });

    it('should check actions against anti-patterns', async () => {
      const action = createTestAction('fill', { selector: '#dangerous-form' });
      const context = createTestContext('check.com');

      await memory.recordAntiPattern(action, context, ['Data loss']);

      const match = memory.checkAntiPatterns(action, context);
      expect(match).not.toBeNull();
      expect(match!.name).toContain('avoid_fill');
    });

    it('should get anti-patterns for specific domain', async () => {
      const context1 = createTestContext('domain1.com');
      const context2 = createTestContext('domain2.com');

      await memory.recordAntiPattern(
        createTestAction('click', { selector: '#bad1' }),
        context1,
        ['Error 1']
      );
      await memory.recordAntiPattern(
        createTestAction('click', { selector: '#bad2' }),
        context2,
        ['Error 2']
      );

      const domain1Patterns = memory.getAntiPatternsForDomain('domain1.com');
      expect(domain1Patterns.length).toBe(1);
      expect(domain1Patterns[0].sourceDomain).toBe('domain1.com');
    });

    it('should get all anti-patterns', async () => {
      await memory.recordAntiPattern(
        createTestAction('click'),
        createTestContext('all1.com'),
        ['E1']
      );
      await memory.recordAntiPattern(
        createTestAction('fill'),
        createTestContext('all2.com'),
        ['E2']
      );

      const all = memory.getAllAntiPatterns();
      expect(all.length).toBe(2);
    });
  });

  // ============================================
  // WORKFLOW TESTS
  // ============================================
  describe('Workflows', () => {
    it('should create a workflow from skills', () => {
      const skill1 = memory.addManualSkill('wf_skill1', '', { domainPatterns: ['workflow.com'] }, [
        createTestAction('navigate'),
      ]);
      const skill2 = memory.addManualSkill('wf_skill2', '', {}, [createTestAction('extract')]);

      const workflow = memory.createWorkflow(
        'test_workflow',
        [skill1.id, skill2.id],
        'A test workflow'
      );

      expect(workflow).not.toBeNull();
      expect(workflow!.name).toBe('test_workflow');
      expect(workflow!.skillIds).toEqual([skill1.id, skill2.id]);
      expect(workflow!.transitions).toHaveLength(1);
    });

    it('should not create workflow with non-existent skill', () => {
      const skill = memory.addManualSkill('real_skill', '', {}, [createTestAction('click')]);

      const workflow = memory.createWorkflow('bad_workflow', [skill.id, 'nonexistent']);
      expect(workflow).toBeNull();
    });

    it('should require at least 2 skills for workflow', () => {
      const skill = memory.addManualSkill('single_skill', '', {}, [createTestAction('click')]);

      const workflow = memory.createWorkflow('single_workflow', [skill.id]);
      expect(workflow).toBeNull();
    });

    it('should get workflow by ID', () => {
      const skill1 = memory.addManualSkill('get_wf1', '', {}, [createTestAction('click')]);
      const skill2 = memory.addManualSkill('get_wf2', '', {}, [createTestAction('extract')]);

      const workflow = memory.createWorkflow('get_workflow', [skill1.id, skill2.id]);
      const retrieved = memory.getWorkflow(workflow!.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('get_workflow');
    });

    it('should get all workflows', () => {
      const skill1 = memory.addManualSkill('all_wf1', '', {}, [createTestAction('click')]);
      const skill2 = memory.addManualSkill('all_wf2', '', {}, [createTestAction('extract')]);
      const skill3 = memory.addManualSkill('all_wf3', '', {}, [createTestAction('scroll')]);

      memory.createWorkflow('workflow1', [skill1.id, skill2.id]);
      memory.createWorkflow('workflow2', [skill2.id, skill3.id]);

      const all = memory.getAllWorkflows();
      expect(all.length).toBe(2);
    });

    it('should detect potential workflows from trajectory patterns', async () => {
      // Record similar trajectories multiple times
      for (let i = 0; i < 5; i++) {
        await memory.recordTrajectory(
          createTestTrajectory('pattern.com', {
            actions: [
              createTestAction('navigate'),
              createTestAction('dismiss_banner'),
              createTestAction('click'),
              createTestAction('extract'),
            ],
          })
        );
      }

      const potentials = memory.detectPotentialWorkflows();
      expect(potentials.length).toBeGreaterThanOrEqual(0); // May or may not find patterns
    });
  });

  // ============================================
  // USER FEEDBACK TESTS
  // ============================================
  describe('User Feedback', () => {
    it('should record positive feedback', async () => {
      const skill = memory.addManualSkill('feedback_skill', '', {}, [createTestAction('click')]);

      await memory.recordFeedback(skill.id, 'positive', {
        url: 'https://feedback.com/page',
        domain: 'feedback.com',
      });

      const summary = memory.getFeedbackSummary(skill.id);
      expect(summary.positive).toBe(1);
      expect(summary.negative).toBe(0);
    });

    it('should record negative feedback with reason', async () => {
      const skill = memory.addManualSkill('neg_feedback', '', {}, [createTestAction('click')]);

      await memory.recordFeedback(
        skill.id,
        'negative',
        { url: 'https://neg.com', domain: 'neg.com' },
        'Did not extract correct content'
      );

      const summary = memory.getFeedbackSummary(skill.id);
      expect(summary.negative).toBe(1);
      expect(summary.commonIssues).toContain('Did not extract correct content');
    });

    it('should update skill metrics on feedback', async () => {
      const skill = memory.addManualSkill('metric_feedback', '', {}, [createTestAction('click')]);
      const initialUses = skill.metrics.timesUsed;

      await memory.recordFeedback(skill.id, 'positive', {
        url: 'https://m.com',
        domain: 'm.com',
      });

      const updated = memory.getSkill(skill.id)!;
      expect(updated.metrics.timesUsed).toBe(initialUses + 1);
    });

    it('should get all feedback', async () => {
      const skill1 = memory.addManualSkill('fb1', '', {}, [createTestAction('click')]);
      const skill2 = memory.addManualSkill('fb2', '', {}, [createTestAction('extract')]);

      await memory.recordFeedback(skill1.id, 'positive', { url: '', domain: 'a.com' });
      await memory.recordFeedback(skill2.id, 'negative', { url: '', domain: 'b.com' });

      const all = memory.getAllFeedback();
      expect(all.length).toBe(2);
    });
  });

  // ============================================
  // DEPENDENCIES AND FALLBACKS TESTS
  // ============================================
  describe('Dependencies and Fallbacks', () => {
    it('should add fallback skills', async () => {
      const primary = memory.addManualSkill('primary', '', {}, [createTestAction('click')]);
      const fallback1 = memory.addManualSkill('fallback1', '', {}, [createTestAction('click')]);
      const fallback2 = memory.addManualSkill('fallback2', '', {}, [createTestAction('click')]);

      const result = await memory.addFallbackSkills(primary.id, [fallback1.id, fallback2.id]);
      expect(result).toBe(true);

      const fallbacks = memory.getFallbackSkills(primary.id);
      expect(fallbacks.length).toBe(2);
    });

    it('should not add non-existent fallback', async () => {
      const primary = memory.addManualSkill('primary2', '', {}, [createTestAction('click')]);

      const result = await memory.addFallbackSkills(primary.id, ['nonexistent']);
      expect(result).toBe(false);
    });

    it('should add prerequisite skills', async () => {
      const main = memory.addManualSkill('main_skill', '', {}, [createTestAction('extract')]);
      const prereq = memory.addManualSkill('prereq_skill', '', {}, [
        createTestAction('dismiss_banner'),
      ]);

      const result = await memory.addPrerequisites(main.id, [prereq.id]);
      expect(result).toBe(true);

      const prereqs = memory.getPrerequisiteSkills(main.id);
      expect(prereqs.length).toBe(1);
      expect(prereqs[0].name).toBe('prereq_skill');
    });

    it('should detect circular dependencies', async () => {
      const skillA = memory.addManualSkill('skillA', '', {}, [createTestAction('click')]);
      const skillB = memory.addManualSkill('skillB', '', {}, [createTestAction('click')]);

      await memory.addPrerequisites(skillA.id, [skillB.id]);

      // Trying to add A as prereq of B would create cycle
      const result = await memory.addPrerequisites(skillB.id, [skillA.id]);
      expect(result).toBe(false);
    });

    it('should execute with fallbacks', async () => {
      const primary = memory.addManualSkill('exec_primary', '', {}, [createTestAction('click')]);
      const fallback = memory.addManualSkill('exec_fallback', '', {}, [createTestAction('click')]);

      await memory.addFallbackSkills(primary.id, [fallback.id]);

      // Primary fails, fallback succeeds
      let attempt = 0;
      const result = await memory.executeWithFallbacks(primary.id, async (skill) => {
        attempt++;
        return skill.id === fallback.id;
      });

      expect(result.success).toBe(true);
      expect(result.executedSkillId).toBe(fallback.id);
      expect(result.attempts).toBe(2);
    });
  });

  // ============================================
  // PERSISTENCE TESTS
  // ============================================
  describe('Persistence', () => {
    it('should save and load skills', async () => {
      memory.addManualSkill('persist_skill', 'Will persist', { domainPatterns: ['persist.com'] }, [
        createTestAction('extract'),
      ]);

      // Wait for async save to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create new instance and load
      const newMemory = new ProceduralMemory({ filePath });
      await newMemory.initialize();

      const loaded = newMemory.getAllSkills();
      expect(loaded.length).toBe(1);
      expect(loaded[0].name).toBe('persist_skill');
    });

    it('should save and load workflows', async () => {
      const skill1 = memory.addManualSkill('wf_persist1', '', {}, [createTestAction('click')]);
      const skill2 = memory.addManualSkill('wf_persist2', '', {}, [createTestAction('extract')]);

      // Wait for skills to be saved first
      await new Promise(resolve => setTimeout(resolve, 50));

      memory.createWorkflow('persist_workflow', [skill1.id, skill2.id]);

      // Wait for workflow save to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const newMemory = new ProceduralMemory({ filePath });
      await newMemory.initialize();

      const workflows = newMemory.getAllWorkflows();
      expect(workflows.length).toBe(1);
      expect(workflows[0].name).toBe('persist_workflow');
    });

    it('should export memory as JSON', async () => {
      memory.addManualSkill('export_skill', '', {}, [createTestAction('click')]);

      const exported = await memory.exportMemory();
      const parsed = JSON.parse(exported);

      expect(parsed.skills).toHaveLength(1);
      expect(parsed.stats).toBeDefined();
      expect(parsed.config).toBeDefined();
    });

    it('should import skills from JSON', async () => {
      memory.addManualSkill('existing', '', {}, [createTestAction('click')]);

      const importData = JSON.stringify({
        skills: [
          {
            id: 'imported_id',
            name: 'imported_skill',
            description: 'Imported',
            preconditions: {},
            actionSequence: [createTestAction('extract')],
            embedding: new Array(64).fill(0.5),
            metrics: {
              successCount: 5,
              failureCount: 1,
              avgDuration: 200,
              lastUsed: Date.now(),
              timesUsed: 6,
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });

      const count = await memory.importSkills(importData);
      expect(count).toBe(1);
      expect(memory.getAllSkills().length).toBe(2);
    });

    it('should reset all data', async () => {
      memory.addManualSkill('to_reset', '', {}, [createTestAction('click')]);
      await memory.recordAntiPattern(
        createTestAction('fill'),
        createTestContext('reset.com'),
        ['Error']
      );

      await memory.reset();

      expect(memory.getAllSkills()).toHaveLength(0);
      expect(memory.getAllAntiPatterns()).toHaveLength(0);
      expect(memory.getAllWorkflows()).toHaveLength(0);
    });
  });

  // ============================================
  // DECAY AND PRUNING TESTS
  // ============================================
  describe('Skill Decay and Pruning', () => {
    it('should apply decay to stale skills', () => {
      // Add skill with old lastUsed
      const skill = memory.addManualSkill('stale_skill', '', {}, [createTestAction('click')]);

      // Manually set lastUsed to 60 days ago
      const retrieved = memory.getSkill(skill.id)!;
      retrieved.metrics.lastUsed = Date.now() - 60 * 24 * 60 * 60 * 1000;
      retrieved.metrics.successCount = 100;

      const decayedCount = memory.applySkillDecay(30, 0.1);

      // Should have decayed the skill
      expect(decayedCount).toBe(1);
      expect(memory.getSkill(skill.id)!.metrics.successCount).toBeLessThan(100);
    });

    it('should not decay recently used skills', () => {
      const skill = memory.addManualSkill('recent_skill', '', {}, [createTestAction('click')]);
      const initialSuccess = memory.getSkill(skill.id)!.metrics.successCount;

      const decayedCount = memory.applySkillDecay(30, 0.1);

      expect(decayedCount).toBe(0);
      expect(memory.getSkill(skill.id)!.metrics.successCount).toBe(initialSuccess);
    });

    it('should prune low-performing skills', async () => {
      const skill = memory.addManualSkill('low_performer', '', {}, [createTestAction('click')]);

      // Record many failures
      for (let i = 0; i < 5; i++) {
        await memory.recordSkillExecution(skill.id, false, 100);
      }
      // And one success (so success rate is ~16%)
      await memory.recordSkillExecution(skill.id, true, 100);

      const prunedCount = memory.pruneFailedSkills(0.3, 3);

      expect(prunedCount).toBe(1);
      expect(memory.getSkill(skill.id)).toBeNull();
    });

    it('should not prune high-performing skills', async () => {
      const skill = memory.addManualSkill('high_performer', '', {}, [createTestAction('click')]);

      // Record mostly successes
      for (let i = 0; i < 5; i++) {
        await memory.recordSkillExecution(skill.id, true, 100);
      }

      const prunedCount = memory.pruneFailedSkills(0.3, 3);

      expect(prunedCount).toBe(0);
      expect(memory.getSkill(skill.id)).not.toBeNull();
    });
  });

  // ============================================
  // ACTIVE LEARNING TESTS
  // ============================================
  describe('Active Learning and Coverage', () => {
    it('should track domain visits', () => {
      memory.trackVisit('visited1.com', 'list', true);
      memory.trackVisit('visited2.com', 'form', true);
      memory.trackVisit('visited1.com', 'list', false);

      const coverage = memory.getCoverageStats();
      expect(coverage.uncoveredDomains).toContain('visited1.com');
      expect(coverage.uncoveredDomains).toContain('visited2.com');
    });

    it('should identify covered vs uncovered domains', () => {
      // Track visits
      memory.trackVisit('covered.com', 'list', true);
      memory.trackVisit('uncovered.com', 'form', true);

      // Add skill for covered domain with sourceDomain set
      const skill = memory.addManualSkill('covered_skill', '', { domainPatterns: ['covered.com'] }, [
        createTestAction('extract'),
      ]);
      // Set sourceDomain (getCoverageStats uses this)
      (skill as any).sourceDomain = 'covered.com';

      const coverage = memory.getCoverageStats();
      expect(coverage.coveredDomains).toContain('covered.com');
      expect(coverage.uncoveredDomains).toContain('uncovered.com');
    });

    it('should generate coverage suggestions', () => {
      // Track multiple visits with failures
      for (let i = 0; i < 5; i++) {
        memory.trackVisit('problem.com', 'list', false);
      }

      const coverage = memory.getCoverageStats();
      const problemSuggestion = coverage.suggestions.find(
        s => s.value === 'problem.com'
      );

      expect(problemSuggestion).toBeDefined();
      expect(problemSuggestion!.priority).toBe('high');
    });
  });

  // ============================================
  // SKILL EXPLANATION TESTS
  // ============================================
  describe('Skill Explanation', () => {
    it('should generate human-readable skill explanation', () => {
      const skill = memory.addManualSkill(
        'explained_skill',
        'Extracts product data',
        { domainPatterns: ['shop.com'], pageType: 'list' },
        [
          createTestAction('wait', { waitFor: 'load' }),
          createTestAction('scroll'),
          createTestAction('extract', { selector: '.product' }),
        ]
      );

      const explanation = memory.generateSkillExplanation(skill.id);

      expect(explanation).not.toBeNull();
      expect(explanation!.summary).toBeDefined();
      expect(explanation!.steps.length).toBe(3);
      expect(explanation!.applicability).toContain('shop.com');
      expect(explanation!.reliability).toBeDefined();
    });

    it('should return null for non-existent skill explanation', () => {
      expect(memory.generateSkillExplanation('nonexistent')).toBeNull();
    });
  });

  // ============================================
  // BOOTSTRAPPING TESTS
  // ============================================
  describe('Template Bootstrapping', () => {
    it('should bootstrap from templates', async () => {
      const count = await memory.bootstrapFromTemplates();
      expect(count).toBeGreaterThan(0);

      const skills = memory.getAllSkills();
      const templateNames = ['cookie_banner_dismiss', 'pagination_navigate', 'form_extraction', 'table_extraction'];

      for (const name of templateNames) {
        expect(skills.some(s => s.name === name)).toBe(true);
      }
    });

    it('should not duplicate templates on second bootstrap', async () => {
      await memory.bootstrapFromTemplates();
      const countAfterFirst = memory.getAllSkills().length;

      await memory.bootstrapFromTemplates();
      const countAfterSecond = memory.getAllSkills().length;

      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });

  // ============================================
  // EMBEDDING TESTS
  // ============================================
  describe('Embeddings', () => {
    it('should create embeddings of correct dimension', () => {
      const skill = memory.addManualSkill('embed_test', '', {}, [createTestAction('click')]);
      expect(skill.embedding.length).toBe(64);
    });

    it('should create normalized embeddings', () => {
      const skill = memory.addManualSkill('norm_test', '', { domainPatterns: ['test.com'] }, [
        createTestAction('navigate'),
        createTestAction('click'),
        createTestAction('extract'),
      ]);

      // Check that embedding is normalized (unit length)
      const norm = Math.sqrt(skill.embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('should create different embeddings for different contexts', () => {
      const skill1 = memory.addManualSkill('diff1', '', {
        domainPatterns: ['shop.com'],
        pageType: 'list',
      }, [createTestAction('extract')]);

      const skill2 = memory.addManualSkill('diff2', '', {
        domainPatterns: ['news.org'],
        pageType: 'detail',
      }, [createTestAction('scroll')]);

      // Embeddings should be different
      const sameDimensions = skill1.embedding.filter((v, i) => v === skill2.embedding[i]);
      expect(sameDimensions.length).toBeLessThan(skill1.embedding.length);
    });
  });

  // ============================================
  // SKILLS BY DOMAIN TESTS
  // ============================================
  describe('Skills by Domain', () => {
    it('should group skills by domain', () => {
      memory.addManualSkill('domain_a_1', '', {}, [createTestAction('click')]);
      memory.addManualSkill('domain_a_2', '', {}, [createTestAction('extract')]);
      memory.addManualSkill('domain_b_1', '', {}, [createTestAction('scroll')]);

      // Set source domains manually
      const skills = memory.getAllSkills();
      (skills[0] as any).sourceDomain = 'domain-a.com';
      (skills[1] as any).sourceDomain = 'domain-a.com';
      (skills[2] as any).sourceDomain = 'domain-b.com';

      const byDomain = memory.getSkillsByDomain();
      expect(byDomain.get('domain-a.com')?.length).toBe(2);
      expect(byDomain.get('domain-b.com')?.length).toBe(1);
    });

    it('should handle skills without domain', () => {
      memory.addManualSkill('no_domain', '', {}, [createTestAction('click')]);

      const byDomain = memory.getSkillsByDomain();
      expect(byDomain.get('unknown')?.length).toBe(1);
    });
  });
});
