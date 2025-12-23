/**
 * Skill Management Tool Handlers
 *
 * Handlers for the skill_management tool (deprecated).
 * Skills are now automatically applied during smart_browse operations.
 */

import type { SmartBrowser } from '../../core/smart-browser.js';
import type { SkillVertical, SkillConflictResolution } from '../../types/index.js';
import { jsonResponse, errorResponse, type McpResponse } from '../response-formatters.js';
import { logger } from '../../utils/logger.js';

/**
 * Skill management action types
 */
export type SkillAction =
  | 'stats'
  | 'progress'
  | 'find'
  | 'details'
  | 'explain'
  | 'versions'
  | 'rollback'
  | 'rate'
  | 'anti_patterns'
  | 'dependencies'
  | 'bootstrap'
  | 'export'
  | 'import'
  | 'pack_stats'
  | 'manage';

/**
 * Handle skill_management tool call
 */
export async function handleSkillManagement(
  smartBrowser: SmartBrowser,
  action: SkillAction,
  args: Record<string, unknown>
): Promise<McpResponse> {
  // TC-003: Log deprecation warning
  logger.server.warn(
    '[DEPRECATED] skill_management tool is deprecated. ' +
      'Skills are now automatically applied during smart_browse operations. ' +
      'Use smart_browse and check skillExecutionTrace in the response.'
  );

  const proceduralMemory = smartBrowser.getProceduralMemory();

  switch (action) {
    case 'stats': {
      const proceduralStats = smartBrowser.getProceduralMemoryStats();
      return jsonResponse({
        summary: {
          totalSkills: proceduralStats.totalSkills,
          totalTrajectories: proceduralStats.totalTrajectories,
          avgSuccessRate: Math.round(proceduralStats.avgSuccessRate * 100) + '%',
        },
        skillsByDomain: proceduralStats.skillsByDomain,
        mostUsedSkills: proceduralStats.mostUsedSkills.slice(0, 5),
      });
    }

    case 'progress': {
      const learningEngine = smartBrowser.getLearningEngine();
      const progress = proceduralMemory.getLearningProgress();
      const learningStats = learningEngine.getStats();

      return jsonResponse({
        summary: {
          totalSkills: progress.skills.total,
          totalAntiPatterns: progress.antiPatterns.total,
          totalApiPatterns: learningStats.totalApiPatterns,
          coveredDomains: progress.coverage.coveredDomains,
          trajectorySuccessRate:
            progress.trajectories.total > 0
              ? Math.round((progress.trajectories.successful / progress.trajectories.total) * 100) + '%'
              : 'N/A',
        },
        skills: {
          byDomain: progress.skills.byDomain,
          avgSuccessRate: Math.round(progress.skills.avgSuccessRate * 100) + '%',
          topPerformers: progress.skills.topPerformers.map(s => ({
            name: s.name,
            successRate: Math.round(s.successRate * 100) + '%',
            uses: s.uses,
          })),
          recentlyCreated: progress.skills.recentlyCreated.map(s => ({
            name: s.name,
            domain: s.domain,
            createdAt: new Date(s.createdAt).toISOString(),
          })),
        },
        antiPatterns: {
          total: progress.antiPatterns.total,
          byDomain: progress.antiPatterns.byDomain,
        },
        patterns: {
          totalApiPatterns: learningStats.totalApiPatterns,
          bypassablePatterns: learningStats.bypassablePatterns,
          totalSelectors: learningStats.totalSelectors,
          totalValidators: learningStats.totalValidators,
        },
        coverage: {
          coveredDomains: progress.coverage.coveredDomains,
          uncoveredDomains: progress.coverage.uncoveredDomains,
          suggestions: progress.coverage.suggestions,
        },
        trajectories: {
          total: progress.trajectories.total,
          successful: progress.trajectories.successful,
          failed: progress.trajectories.failed,
        },
      });
    }

    case 'find': {
      if (!args.url) {
        return errorResponse('URL is required for find action');
      }
      const skills = smartBrowser.findApplicableSkills(args.url as string, (args.topK as number) || 3);

      return jsonResponse({
        url: args.url,
        matchedSkills: skills.map(match => ({
          skillId: match.skill.id,
          name: match.skill.name,
          description: match.skill.description,
          similarity: Math.round(match.similarity * 100) + '%',
          preconditionsMet: match.preconditionsMet,
          reason: match.reason,
          timesUsed: match.skill.metrics.timesUsed,
          successRate:
            match.skill.metrics.successCount > 0
              ? Math.round((match.skill.metrics.successCount / match.skill.metrics.timesUsed) * 100) + '%'
              : 'N/A',
        })),
      });
    }

    case 'details': {
      if (!args.skillId) {
        return errorResponse('skillId is required for details action');
      }
      const skill = proceduralMemory.getSkill(args.skillId as string);
      if (!skill) {
        return errorResponse(`Skill not found: ${args.skillId}`);
      }

      return jsonResponse({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        preconditions: skill.preconditions,
        actionSequence: skill.actionSequence.map(a => ({
          type: a.type,
          selector: a.selector,
          success: a.success,
        })),
        metrics: {
          successCount: skill.metrics.successCount,
          failureCount: skill.metrics.failureCount,
          successRate:
            skill.metrics.timesUsed > 0
              ? Math.round((skill.metrics.successCount / skill.metrics.timesUsed) * 100) + '%'
              : 'N/A',
          avgDuration: Math.round(skill.metrics.avgDuration) + 'ms',
          timesUsed: skill.metrics.timesUsed,
          lastUsed: new Date(skill.metrics.lastUsed).toISOString(),
        },
        sourceDomain: skill.sourceDomain,
        createdAt: new Date(skill.createdAt).toISOString(),
      });
    }

    case 'explain': {
      if (!args.skillId) {
        return errorResponse('skillId is required for explain action');
      }
      const explanation = proceduralMemory.generateSkillExplanation(args.skillId as string);
      if (!explanation) {
        return errorResponse(`Skill not found: ${args.skillId}`);
      }
      return jsonResponse(explanation);
    }

    case 'versions': {
      if (!args.skillId) {
        return errorResponse('skillId is required for versions action');
      }
      const skillId = args.skillId as string;
      const skill = proceduralMemory.getSkill(skillId);
      if (!skill) {
        return errorResponse(`Skill not found: ${skillId}`);
      }

      const versions = proceduralMemory.getVersionHistory(skillId);
      const bestVersion = proceduralMemory.getBestVersion(skillId);

      return jsonResponse({
        skillId,
        skillName: skill.name,
        totalVersions: versions.length,
        versions: versions.map(v => ({
          version: v.version,
          createdAt: new Date(v.createdAt).toISOString(),
          changeReason: v.changeReason,
          changeDescription: v.changeDescription,
          successRate: Math.round(v.metricsSnapshot.successRate * 100) + '%',
          timesUsed: v.metricsSnapshot.timesUsed,
        })),
        bestVersion: bestVersion
          ? {
              version: bestVersion.version,
              successRate: Math.round(bestVersion.metricsSnapshot.successRate * 100) + '%',
            }
          : null,
      });
    }

    case 'rollback': {
      if (!args.skillId) {
        return errorResponse('skillId is required for rollback action');
      }
      const skillId = args.skillId as string;
      const targetVersion = args.targetVersion as number | undefined;

      const success = await proceduralMemory.rollbackSkill(skillId, targetVersion);
      if (!success) {
        return errorResponse('Rollback failed - check skill ID and version history');
      }

      const skill = proceduralMemory.getSkill(skillId);
      return jsonResponse({
        message: `Successfully rolled back skill ${skill?.name}`,
        newSuccessRate: skill
          ? Math.round((skill.metrics.successCount / Math.max(skill.metrics.timesUsed, 1)) * 100) + '%'
          : 'N/A',
      });
    }

    case 'rate': {
      if (!args.skillId || !args.rating || !args.url) {
        return errorResponse('skillId, rating, and url are required for rate action');
      }
      const skillId = args.skillId as string;
      const rating = args.rating as 'positive' | 'negative';
      const url = args.url as string;
      const reason = args.reason as string | undefined;

      const domain = new URL(url).hostname;
      await proceduralMemory.recordFeedback(skillId, rating, { url, domain }, reason);

      const feedbackSummary = proceduralMemory.getFeedbackSummary(skillId);
      const skill = proceduralMemory.getSkill(skillId);

      return jsonResponse({
        message: `Recorded ${rating} feedback for skill ${skill?.name || skillId}`,
        feedbackSummary: {
          positive: feedbackSummary.positive,
          negative: feedbackSummary.negative,
          commonIssues: feedbackSummary.commonIssues,
        },
        currentSuccessRate: skill
          ? Math.round((skill.metrics.successCount / Math.max(skill.metrics.timesUsed, 1)) * 100) + '%'
          : 'N/A',
      });
    }

    case 'anti_patterns': {
      const domain = args.domain as string | undefined;
      const antiPatterns = domain
        ? proceduralMemory.getAntiPatternsForDomain(domain)
        : proceduralMemory.getAllAntiPatterns();

      return jsonResponse({
        totalAntiPatterns: antiPatterns.length,
        antiPatterns: antiPatterns.map(ap => ({
          id: ap.id,
          name: ap.name,
          description: ap.description,
          domain: ap.sourceDomain,
          avoidActions: ap.avoidActions,
          occurrenceCount: ap.occurrenceCount,
          consequences: ap.consequences,
          lastUpdated: new Date(ap.updatedAt).toISOString(),
        })),
      });
    }

    case 'dependencies': {
      if (!args.skillId || !args.dependencyAction) {
        return errorResponse('skillId and dependencyAction are required for dependencies action');
      }
      const skillId = args.skillId as string;
      const depAction = args.dependencyAction as string;
      const relatedSkillIds = args.relatedSkillIds as string[] | undefined;

      switch (depAction) {
        case 'add_fallbacks': {
          if (!relatedSkillIds || relatedSkillIds.length === 0) {
            return errorResponse('No fallback skill IDs provided');
          }
          const success = await proceduralMemory.addFallbackSkills(skillId, relatedSkillIds);
          return jsonResponse({
            success,
            message: success ? `Added ${relatedSkillIds.length} fallback skills` : 'Failed to add fallbacks',
          });
        }

        case 'add_prerequisites': {
          if (!relatedSkillIds || relatedSkillIds.length === 0) {
            return errorResponse('No prerequisite skill IDs provided');
          }
          const success = await proceduralMemory.addPrerequisites(skillId, relatedSkillIds);
          return jsonResponse({
            success,
            message: success
              ? `Added ${relatedSkillIds.length} prerequisite skills`
              : 'Failed to add prerequisites (check for circular dependencies)',
          });
        }

        case 'get_chain': {
          const skill = proceduralMemory.getSkill(skillId);
          if (!skill) {
            return errorResponse(`Skill not found: ${skillId}`);
          }

          const prerequisites = proceduralMemory.getPrerequisiteSkills(skillId);
          const fallbacks = proceduralMemory.getFallbackSkills(skillId);

          return jsonResponse({
            skill: { id: skill.id, name: skill.name },
            prerequisites: prerequisites.map(s => ({ id: s.id, name: s.name })),
            fallbacks: fallbacks.map(s => ({ id: s.id, name: s.name })),
            executionOrder: [
              ...prerequisites.map(s => `[prereq] ${s.name}`),
              `[main] ${skill.name}`,
              ...fallbacks.map(s => `[fallback] ${s.name}`),
            ],
          });
        }

        default:
          return errorResponse(`Unknown dependency action: ${depAction}`);
      }
    }

    case 'bootstrap': {
      const bootstrapped = await proceduralMemory.bootstrapFromTemplates();
      return jsonResponse({
        message: `Bootstrapped ${bootstrapped} skills from templates`,
        totalSkills: proceduralMemory.getStats().totalSkills,
        templates: ['cookie_banner_dismiss', 'pagination_navigate', 'form_extraction', 'table_extraction'],
      });
    }

    case 'export': {
      const pack = proceduralMemory.exportSkillPack({
        domainPatterns: args.domainPatterns as string[] | undefined,
        verticals: args.verticals as SkillVertical[] | undefined,
        includeAntiPatterns: args.includeAntiPatterns as boolean | undefined,
        includeWorkflows: args.includeWorkflows as boolean | undefined,
        minSuccessRate: args.minSuccessRate as number | undefined,
        minUsageCount: args.minUsageCount as number | undefined,
        packName: args.packName as string | undefined,
        packDescription: args.packDescription as string | undefined,
      });

      return jsonResponse({
        skillPack: pack,
        serialized: proceduralMemory.serializeSkillPack(pack),
      });
    }

    case 'import': {
      if (!args.skillPackJson) {
        return errorResponse('skillPackJson is required for import action');
      }
      const result = await proceduralMemory.importSkillPack(args.skillPackJson as string, {
        conflictResolution: args.conflictResolution as SkillConflictResolution | undefined,
        domainFilter: args.domainFilter as string[] | undefined,
        verticalFilter: args.verticals as SkillVertical[] | undefined,
        importAntiPatterns: args.importAntiPatterns as boolean | undefined,
        importWorkflows: args.importWorkflows as boolean | undefined,
        resetMetrics: args.resetMetrics as boolean | undefined,
        namePrefix: args.namePrefix as string | undefined,
      });

      if (!result.success) {
        return errorResponse(result.errors.join('; '));
      }

      return jsonResponse({
        ...result,
        message: `Imported ${result.skillsImported} skills, ${result.antiPatternsImported} anti-patterns, ${result.workflowsImported} workflows`,
      });
    }

    case 'pack_stats': {
      const stats = proceduralMemory.getSkillPackStats();
      return jsonResponse({
        ...stats,
        verticalBreakdown: Object.entries(stats.byVertical)
          .filter(([, count]) => count > 0)
          .map(([vertical, count]) => ({ vertical, count })),
      });
    }

    case 'manage': {
      const manageAction = args.manageAction as string;
      if (!manageAction) {
        return errorResponse('manageAction is required for manage action');
      }

      switch (manageAction) {
        case 'export': {
          const exported = await proceduralMemory.exportMemory();
          return jsonResponse({
            message: 'Skills exported successfully',
            data: JSON.parse(exported),
          });
        }

        case 'import': {
          if (!args.data) {
            return errorResponse('No data provided for import');
          }
          const imported = await proceduralMemory.importSkills(args.data as string);
          return jsonResponse({
            message: `Imported ${imported} skills`,
            totalSkills: proceduralMemory.getStats().totalSkills,
          });
        }

        case 'prune': {
          const minRate = (args.minSuccessRate as number) || 0.3;
          const pruned = proceduralMemory.pruneFailedSkills(minRate);
          return jsonResponse({
            message: `Pruned ${pruned} low-performing skills`,
            remainingSkills: proceduralMemory.getStats().totalSkills,
          });
        }

        case 'reset': {
          await proceduralMemory.reset();
          return jsonResponse({ message: 'All skills have been reset' });
        }

        case 'coverage': {
          const coverage = proceduralMemory.getCoverageStats();
          return jsonResponse({
            coverage: {
              coveredDomains: coverage.coveredDomains.length,
              coveredPageTypes: coverage.coveredPageTypes,
              uncoveredDomains: coverage.uncoveredDomains.slice(0, 10),
              uncoveredPageTypes: coverage.uncoveredPageTypes,
            },
            suggestions: coverage.suggestions,
          });
        }

        case 'workflows': {
          const potentialWorkflows = proceduralMemory.detectPotentialWorkflows();
          const existingWorkflows = proceduralMemory.getAllWorkflows();
          return jsonResponse({
            existingWorkflows: existingWorkflows.map(w => ({
              id: w.id,
              name: w.name,
              skills: w.skillIds.length,
              timesUsed: w.metrics.timesUsed,
            })),
            potentialWorkflows: potentialWorkflows.slice(0, 5),
          });
        }

        default:
          return errorResponse(`Unknown manage action: ${manageAction}`);
      }
    }

    default:
      return errorResponse(`Unknown skill_management action: ${action}`);
  }
}
