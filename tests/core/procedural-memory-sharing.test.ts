/**
 * Tests for Skill Sharing & Portability (F-012)
 *
 * These tests cover:
 * - Skill pack export with filtering (domain, vertical, performance)
 * - Skill pack import with conflict resolution
 * - Anti-pattern and workflow export/import
 * - Vertical inference from domains
 * - Domain pattern matching
 * - Pack metadata and statistics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProceduralMemory } from '../../src/core/procedural-memory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  BrowsingAction,
  BrowsingSkill,
  AntiPattern,
  SkillWorkflow,
  SkillPack,
  SkillVertical,
} from '../../src/types/index.js';

// Test fixtures
function createTestSkill(
  name: string,
  domain: string,
  options: Partial<BrowsingSkill> = {}
): BrowsingSkill {
  return {
    id: `skill_${name}_${Date.now()}`,
    name,
    description: `Test skill for ${domain}`,
    preconditions: {
      domainPatterns: [domain],
      pageType: 'list',
    },
    actionSequence: [
      { type: 'navigate', url: `https://${domain}/page`, timestamp: Date.now(), success: true },
      { type: 'click', selector: '.button', timestamp: Date.now(), success: true },
    ] as BrowsingAction[],
    embedding: new Array(64).fill(0).map(() => Math.random()),
    metrics: {
      successCount: 10,
      failureCount: 2,
      avgDuration: 1500,
      lastUsed: Date.now(),
      timesUsed: 12,
    },
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
    sourceDomain: domain,
    ...options,
  };
}

function createTestAntiPattern(
  name: string,
  domain: string,
  options: Partial<AntiPattern> = {}
): AntiPattern {
  return {
    id: `ap_${name}_${Date.now()}`,
    name,
    description: `Avoid ${name} on ${domain}`,
    preconditions: {
      domainPatterns: [domain],
    },
    avoidActions: [
      { type: 'click', selector: '.bad-button', reason: 'Causes error' },
    ],
    occurrenceCount: 5,
    consequences: ['Page crashes', 'Data lost'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceDomain: domain,
    ...options,
  };
}

function createTestWorkflow(
  name: string,
  skillIds: string[],
  options: Partial<SkillWorkflow> = {}
): SkillWorkflow {
  return {
    id: `wf_${name}_${Date.now()}`,
    name,
    description: `Test workflow: ${name}`,
    skillIds,
    preconditions: {},
    transitions: skillIds.slice(0, -1).map((id, i) => ({
      fromSkillId: id,
      toSkillId: skillIds[i + 1],
      condition: 'success' as const,
    })),
    metrics: {
      successCount: 5,
      failureCount: 1,
      avgDuration: 3000,
      lastUsed: Date.now(),
      timesUsed: 6,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...options,
  };
}

describe('ProceduralMemory Skill Sharing', () => {
  let tempDir: string;
  let memory: ProceduralMemory;

  beforeEach(async () => {
    // Create temp directory for persistence
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-sharing-test-'));
    memory = new ProceduralMemory({
      filePath: path.join(tempDir, 'procedural-memory.json'),
    });
    await memory.initialize();
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Vertical Inference', () => {
    it('should infer government vertical from .gov domain', () => {
      const skill = createTestSkill('gov_skill', 'example.gov');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      expect(pack.metadata.verticals).toContain('government');
    });

    it('should infer developer vertical from github.com', () => {
      const skill = createTestSkill('github_skill', 'github.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      expect(pack.metadata.verticals).toContain('developer');
    });

    it('should infer ecommerce vertical from shop domain', () => {
      const skill = createTestSkill('shop_skill', 'myshop.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      expect(pack.metadata.verticals).toContain('ecommerce');
    });

    it('should infer documentation vertical from docs subdomain', () => {
      const skill = createTestSkill('docs_skill', 'docs.example.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      expect(pack.metadata.verticals).toContain('documentation');
    });

    it('should default to general for unknown domains', () => {
      const skill = createTestSkill('random_skill', 'randomsite.xyz');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      expect(pack.metadata.verticals).toContain('general');
    });
  });

  describe('Export Filtering', () => {
    beforeEach(() => {
      // Add skills from different verticals
      const govSkill = createTestSkill('gov', 'agency.gov');
      const devSkill = createTestSkill('dev', 'github.com');
      const shopSkill = createTestSkill('shop', 'myshop.com');
      const docsSkill = createTestSkill('docs', 'docs.example.io');

      memory['skills'].set(govSkill.id, govSkill);
      memory['skills'].set(devSkill.id, devSkill);
      memory['skills'].set(shopSkill.id, shopSkill);
      memory['skills'].set(docsSkill.id, docsSkill);
    });

    it('should export all skills when no filters', () => {
      const pack = memory.exportSkillPack();
      expect(pack.skills.length).toBe(4);
    });

    it('should filter by domain pattern', () => {
      const pack = memory.exportSkillPack({
        domainPatterns: ['*.gov'],
      });
      expect(pack.skills.length).toBe(1);
      expect(pack.skills[0].sourceDomain).toBe('agency.gov');
    });

    it('should filter by vertical', () => {
      const pack = memory.exportSkillPack({
        verticals: ['developer'],
      });
      expect(pack.skills.length).toBe(1);
      expect(pack.skills[0].sourceDomain).toBe('github.com');
    });

    it('should filter by multiple verticals', () => {
      const pack = memory.exportSkillPack({
        verticals: ['developer', 'documentation'],
      });
      expect(pack.skills.length).toBe(2);
    });

    it('should filter by minimum success rate', () => {
      // Add a low-success skill
      const lowSuccessSkill = createTestSkill('low', 'lowsite.com', {
        metrics: {
          successCount: 1,
          failureCount: 9,
          avgDuration: 1500,
          lastUsed: Date.now(),
          timesUsed: 10,
        },
      });
      memory['skills'].set(lowSuccessSkill.id, lowSuccessSkill);

      const pack = memory.exportSkillPack({
        minSuccessRate: 0.5,
      });
      // Low success skill (10%) should be filtered out
      expect(pack.skills.every(s =>
        s.metrics.successCount / s.metrics.timesUsed >= 0.5
      )).toBe(true);
    });

    it('should filter by minimum usage count', () => {
      const pack = memory.exportSkillPack({
        minUsageCount: 10,
      });
      // All test skills have 12 uses, so all should be included
      expect(pack.skills.length).toBe(4);

      const packHighUsage = memory.exportSkillPack({
        minUsageCount: 100,
      });
      // No skills have 100 uses
      expect(packHighUsage.skills.length).toBe(0);
    });
  });

  describe('Export Metadata', () => {
    it('should include pack metadata', () => {
      const skill = createTestSkill('test', 'example.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack({
        packName: 'My Test Pack',
        packDescription: 'A test skill pack',
      });

      expect(pack.metadata.name).toBe('My Test Pack');
      expect(pack.metadata.description).toBe('A test skill pack');
      expect(pack.metadata.version).toBe('1.0.0');
      expect(pack.metadata.id).toBeTruthy();
      expect(pack.metadata.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should include statistics', () => {
      const skill = createTestSkill('test', 'example.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();

      expect(pack.metadata.stats.skillCount).toBe(1);
      expect(pack.metadata.stats.totalSuccessCount).toBe(10);
      expect(pack.metadata.stats.avgSuccessRate).toBeCloseTo(10 / 12, 2);
    });

    it('should include compatibility info', () => {
      const pack = memory.exportSkillPack();

      expect(pack.metadata.compatibility.minVersion).toBe('0.5.0');
      expect(pack.metadata.compatibility.schemaVersion).toBe('1.0');
    });

    it('should collect domains from skills', () => {
      const skill1 = createTestSkill('skill1', 'site1.com');
      const skill2 = createTestSkill('skill2', 'site2.com');
      memory['skills'].set(skill1.id, skill1);
      memory['skills'].set(skill2.id, skill2);

      const pack = memory.exportSkillPack();

      expect(pack.metadata.domains).toContain('site1.com');
      expect(pack.metadata.domains).toContain('site2.com');
    });
  });

  describe('Anti-Pattern Export', () => {
    it('should include anti-patterns by default', () => {
      const skill = createTestSkill('skill', 'example.com');
      const antiPattern = createTestAntiPattern('ap', 'example.com');
      memory['skills'].set(skill.id, skill);
      memory['antiPatterns'].set(antiPattern.id, antiPattern);

      const pack = memory.exportSkillPack();

      expect(pack.antiPatterns.length).toBe(1);
      expect(pack.metadata.stats.antiPatternCount).toBe(1);
    });

    it('should exclude anti-patterns when disabled', () => {
      const skill = createTestSkill('skill', 'example.com');
      const antiPattern = createTestAntiPattern('ap', 'example.com');
      memory['skills'].set(skill.id, skill);
      memory['antiPatterns'].set(antiPattern.id, antiPattern);

      const pack = memory.exportSkillPack({
        includeAntiPatterns: false,
      });

      expect(pack.antiPatterns.length).toBe(0);
    });

    it('should filter anti-patterns by domain', () => {
      const skill = createTestSkill('skill', 'example.com');
      const ap1 = createTestAntiPattern('ap1', 'example.com');
      const ap2 = createTestAntiPattern('ap2', 'other.com');
      memory['skills'].set(skill.id, skill);
      memory['antiPatterns'].set(ap1.id, ap1);
      memory['antiPatterns'].set(ap2.id, ap2);

      const pack = memory.exportSkillPack({
        domainPatterns: ['example.com'],
      });

      expect(pack.antiPatterns.length).toBe(1);
      expect(pack.antiPatterns[0].sourceDomain).toBe('example.com');
    });
  });

  describe('Workflow Export', () => {
    it('should include workflows when skills are included', () => {
      const skill1 = createTestSkill('skill1', 'example.com');
      const skill2 = createTestSkill('skill2', 'example.com');
      memory['skills'].set(skill1.id, skill1);
      memory['skills'].set(skill2.id, skill2);

      const workflow = createTestWorkflow('wf', [skill1.id, skill2.id]);
      memory['workflows'].set(workflow.id, workflow);

      const pack = memory.exportSkillPack();

      expect(pack.workflows.length).toBe(1);
      expect(pack.metadata.stats.workflowCount).toBe(1);
    });

    it('should exclude workflows when disabled', () => {
      const skill = createTestSkill('skill', 'example.com');
      memory['skills'].set(skill.id, skill);

      const workflow = createTestWorkflow('wf', [skill.id]);
      memory['workflows'].set(workflow.id, workflow);

      const pack = memory.exportSkillPack({
        includeWorkflows: false,
      });

      expect(pack.workflows.length).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize pack to JSON string', () => {
      const skill = createTestSkill('test', 'example.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      const json = memory.serializeSkillPack(pack);

      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should support compact serialization', () => {
      const skill = createTestSkill('test', 'example.com');
      memory['skills'].set(skill.id, skill);

      const pack = memory.exportSkillPack();
      const prettyJson = memory.serializeSkillPack(pack, true);
      const compactJson = memory.serializeSkillPack(pack, false);

      expect(prettyJson.length).toBeGreaterThan(compactJson.length);
    });
  });

  describe('Import Basic', () => {
    it('should import skills from pack', async () => {
      const skill = createTestSkill('imported', 'imported.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test-pack',
          name: 'Test Pack',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: ['general'],
          domains: ['imported.com'],
          stats: {
            skillCount: 1,
            antiPatternCount: 0,
            workflowCount: 0,
            totalSuccessCount: 10,
            avgSuccessRate: 0.83,
          },
          compatibility: {
            minVersion: '0.5.0',
            schemaVersion: '1.0',
          },
        },
        skills: [skill],
        antiPatterns: [],
        workflows: [],
      };

      const packJson = JSON.stringify(pack);
      const result = await memory.importSkillPack(packJson);

      expect(result.success).toBe(true);
      expect(result.skillsImported).toBe(1);
      expect(memory.getAllSkills().length).toBe(1);
    });

    it('should handle invalid JSON', async () => {
      const result = await memory.importSkillPack('not valid json');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate pack structure', async () => {
      const result = await memory.importSkillPack('{}');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('missing metadata or skills');
    });
  });

  describe('Import Conflict Resolution', () => {
    it('should skip conflicts by default', async () => {
      const existingSkill = createTestSkill('existing', 'example.com');
      memory['skills'].set(existingSkill.id, existingSkill);

      // Create a similar skill with same embedding
      const importSkill = { ...existingSkill, id: 'new_id' };
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [importSkill],
        antiPatterns: [],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        conflictResolution: 'skip',
      });

      expect(result.skillsSkipped).toBe(1);
      expect(result.skillsImported).toBe(0);
      expect(memory.getAllSkills().length).toBe(1);
    });

    it('should overwrite on conflict when specified', async () => {
      const existingSkill = createTestSkill('existing', 'example.com');
      memory['skills'].set(existingSkill.id, existingSkill);

      const importSkill = {
        ...existingSkill,
        id: 'new_id',
        name: 'Updated Skill',
        metrics: { ...existingSkill.metrics, successCount: 100 },
      };
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [importSkill],
        antiPatterns: [],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        conflictResolution: 'overwrite',
      });

      expect(result.skillsImported).toBe(1);
      const skills = memory.getAllSkills();
      expect(skills.length).toBe(1);
      expect(skills[0].metrics.successCount).toBe(100);
    });

    it('should merge metrics on conflict when specified', async () => {
      const existingSkill = createTestSkill('existing', 'example.com');
      memory['skills'].set(existingSkill.id, existingSkill);
      const originalSuccess = existingSkill.metrics.successCount;

      const importSkill = {
        ...existingSkill,
        id: 'new_id',
        metrics: { ...existingSkill.metrics, successCount: 50, timesUsed: 50 },
      };
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [importSkill],
        antiPatterns: [],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        conflictResolution: 'merge',
      });

      expect(result.skillsMerged).toBe(1);
      const skills = memory.getAllSkills();
      expect(skills[0].metrics.successCount).toBe(originalSuccess + 50);
    });

    it('should rename on conflict when specified', async () => {
      const existingSkill = createTestSkill('existing', 'example.com');
      memory['skills'].set(existingSkill.id, existingSkill);

      const importSkill = { ...existingSkill };
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [importSkill],
        antiPatterns: [],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        conflictResolution: 'rename',
      });

      expect(result.skillsImported).toBe(1);
      expect(memory.getAllSkills().length).toBe(2);
    });
  });

  describe('Import Filtering', () => {
    it('should filter imports by domain', async () => {
      const skill1 = createTestSkill('skill1', 'wanted.com');
      const skill2 = createTestSkill('skill2', 'unwanted.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 2, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [skill1, skill2],
        antiPatterns: [],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        domainFilter: ['wanted.com'],
      });

      expect(result.skillsImported).toBe(1);
      const skills = memory.getAllSkills();
      expect(skills[0].sourceDomain).toBe('wanted.com');
    });

    it('should filter imports by vertical', async () => {
      const govSkill = createTestSkill('gov', 'agency.gov');
      const devSkill = createTestSkill('dev', 'github.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 2, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [govSkill, devSkill],
        antiPatterns: [],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        verticalFilter: ['government'],
      });

      expect(result.skillsImported).toBe(1);
      const skills = memory.getAllSkills();
      expect(skills[0].sourceDomain).toBe('agency.gov');
    });
  });

  describe('Import Options', () => {
    it('should reset metrics when specified', async () => {
      const skill = createTestSkill('skill', 'example.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [skill],
        antiPatterns: [],
        workflows: [],
      };

      await memory.importSkillPack(JSON.stringify(pack), {
        resetMetrics: true,
      });

      const imported = memory.getAllSkills()[0];
      expect(imported.metrics.successCount).toBe(0);
      expect(imported.metrics.timesUsed).toBe(0);
    });

    it('should add name prefix when specified', async () => {
      const skill = createTestSkill('skill', 'example.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [skill],
        antiPatterns: [],
        workflows: [],
      };

      await memory.importSkillPack(JSON.stringify(pack), {
        namePrefix: '[Imported] ',
      });

      const imported = memory.getAllSkills()[0];
      expect(imported.name.startsWith('[Imported] ')).toBe(true);
    });
  });

  describe('Anti-Pattern Import', () => {
    it('should import anti-patterns', async () => {
      const ap = createTestAntiPattern('ap', 'example.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 0, antiPatternCount: 1, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [],
        antiPatterns: [ap],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack));

      expect(result.antiPatternsImported).toBe(1);
      expect(memory.getAllAntiPatterns().length).toBe(1);
    });

    it('should skip anti-patterns when disabled', async () => {
      const ap = createTestAntiPattern('ap', 'example.com');
      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 0, antiPatternCount: 1, workflowCount: 0, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [],
        antiPatterns: [ap],
        workflows: [],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack), {
        importAntiPatterns: false,
      });

      expect(result.antiPatternsImported).toBe(0);
      expect(memory.getAllAntiPatterns().length).toBe(0);
    });
  });

  describe('Workflow Import', () => {
    it('should import workflows when all skills exist', async () => {
      const skill1 = createTestSkill('skill1', 'example.com');
      const skill2 = createTestSkill('skill2', 'example.com');
      const workflow = createTestWorkflow('wf', [skill1.id, skill2.id]);

      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 2, antiPatternCount: 0, workflowCount: 1, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [skill1, skill2],
        antiPatterns: [],
        workflows: [workflow],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack));

      expect(result.workflowsImported).toBe(1);
      expect(memory.getAllWorkflows().length).toBe(1);
    });

    it('should skip workflows with missing skills', async () => {
      const skill1 = createTestSkill('skill1', 'example.com');
      const workflow = createTestWorkflow('wf', [skill1.id, 'nonexistent_skill']);

      const pack: SkillPack = {
        metadata: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          version: '1.0.0',
          createdAt: Date.now(),
          verticals: [],
          domains: [],
          stats: { skillCount: 1, antiPatternCount: 0, workflowCount: 1, totalSuccessCount: 0, avgSuccessRate: 0 },
          compatibility: { minVersion: '0.5.0', schemaVersion: '1.0' },
        },
        skills: [skill1],
        antiPatterns: [],
        workflows: [workflow],
      };

      const result = await memory.importSkillPack(JSON.stringify(pack));

      expect(result.workflowsImported).toBe(0);
      expect(result.warnings.some(w => w.includes('missing required skills'))).toBe(true);
    });
  });

  describe('Skill Pack Stats', () => {
    it('should return stats by vertical', () => {
      const govSkill = createTestSkill('gov', 'agency.gov');
      const devSkill1 = createTestSkill('dev1', 'github.com');
      const devSkill2 = createTestSkill('dev2', 'stackoverflow.com');
      memory['skills'].set(govSkill.id, govSkill);
      memory['skills'].set(devSkill1.id, devSkill1);
      memory['skills'].set(devSkill2.id, devSkill2);

      const stats = memory.getSkillPackStats();

      expect(stats.skillCount).toBe(3);
      expect(stats.byVertical.government).toBe(1);
      expect(stats.byVertical.developer).toBe(2);
    });

    it('should calculate overall success rate', () => {
      const skill = createTestSkill('test', 'example.com');
      memory['skills'].set(skill.id, skill);

      const stats = memory.getSkillPackStats();

      expect(stats.avgSuccessRate).toBeCloseTo(10 / 12, 2);
    });
  });

  describe('Round Trip', () => {
    it('should export and re-import skills successfully', async () => {
      // Add original skills
      const skill = createTestSkill('original', 'example.com');
      const antiPattern = createTestAntiPattern('ap', 'example.com');
      memory['skills'].set(skill.id, skill);
      memory['antiPatterns'].set(antiPattern.id, antiPattern);

      // Export
      const pack = memory.exportSkillPack({ packName: 'Round Trip Test' });
      const packJson = memory.serializeSkillPack(pack);

      // Create new memory instance
      const tempDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-sharing-test2-'));
      const memory2 = new ProceduralMemory({
        filePath: path.join(tempDir2, 'procedural-memory.json'),
      });
      await memory2.initialize();

      // Import
      const result = await memory2.importSkillPack(packJson);

      expect(result.success).toBe(true);
      expect(result.skillsImported).toBe(1);
      expect(result.antiPatternsImported).toBe(1);
      expect(memory2.getAllSkills()[0].name).toBe(skill.name);

      // Cleanup
      await fs.rm(tempDir2, { recursive: true, force: true });
    });
  });
});
