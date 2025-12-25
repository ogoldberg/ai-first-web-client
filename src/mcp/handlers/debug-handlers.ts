/**
 * Debug Tool Handlers
 *
 * Handlers for debug and diagnostic tools:
 * - capture_screenshot
 * - export_har
 * - get_learning_stats (deprecated)
 * - get_learning_effectiveness (deprecated)
 * - debug_traces (with visualization support - F-009)
 */

import type { SmartBrowser } from '../../core/smart-browser.js';
import { jsonResponse, errorResponse, type McpResponse } from '../response-formatters.js';
import { addSchemaVersion } from '../../types/schema-version.js';
import { computeLearningEffectiveness } from '../../core/learning-effectiveness.js';
import {
  visualizeTrace,
  createTraceSummaryCard,
  compareTraces,
  type VisualizationFormat,
  type VisualizationOptions,
} from '../../utils/trace-visualizer.js';

/**
 * Handle capture_screenshot tool call
 */
export async function handleCaptureScreenshot(
  smartBrowser: SmartBrowser,
  args: {
    url: string;
    fullPage?: boolean;
    element?: string;
    waitForSelector?: string;
    sessionProfile?: string;
    width?: number;
    height?: number;
  }
): Promise<McpResponse> {
  const result = await smartBrowser.captureScreenshot(args.url, {
    fullPage: args.fullPage,
    element: args.element,
    waitForSelector: args.waitForSelector,
    sessionProfile: args.sessionProfile,
    width: args.width,
    height: args.height,
  });

  if (!result.success) {
    return errorResponse(result.error || 'Screenshot capture failed');
  }

  return jsonResponse({
    url: result.url,
    finalUrl: result.finalUrl,
    title: result.title,
    image: result.image,
    mimeType: result.mimeType,
    viewport: result.viewport,
    timestamp: result.timestamp,
    durationMs: result.durationMs,
  });
}

/**
 * Handle export_har tool call
 */
export async function handleExportHar(
  smartBrowser: SmartBrowser,
  args: {
    url: string;
    includeResponseBodies?: boolean;
    maxBodySize?: number;
    pageTitle?: string;
    waitForSelector?: string;
    sessionProfile?: string;
  }
): Promise<McpResponse> {
  const result = await smartBrowser.exportHar(args.url, {
    includeResponseBodies: args.includeResponseBodies,
    maxBodySize: args.maxBodySize,
    pageTitle: args.pageTitle,
    waitForSelector: args.waitForSelector,
    sessionProfile: args.sessionProfile,
  });

  if (!result.success) {
    return errorResponse(result.error || 'HAR export failed');
  }

  return jsonResponse({
    url: result.url,
    finalUrl: result.finalUrl,
    title: result.title,
    har: result.har,
    entriesCount: result.entriesCount,
    timestamp: result.timestamp,
    durationMs: result.durationMs,
  });
}

/**
 * Handle get_learning_stats tool call (deprecated)
 */
export function handleGetLearningStats(smartBrowser: SmartBrowser): McpResponse {
  const learningEngine = smartBrowser.getLearningEngine();
  const stats = learningEngine.getStats();

  return jsonResponse({
    summary: {
      totalDomains: stats.totalDomains,
      totalApiPatterns: stats.totalApiPatterns,
      bypassablePatterns: stats.bypassablePatterns,
      totalSelectors: stats.totalSelectors,
      totalValidators: stats.totalValidators,
      domainGroups: stats.domainGroups,
    },
    recentLearning: stats.recentLearningEvents.slice(-5).map(e => ({
      type: e.type,
      domain: e.domain,
      timestamp: new Date(e.timestamp).toISOString(),
    })),
    deprecation_notice:
      'This tool is deprecated. Domain-specific insights are now included in smart_browse responses. This global stats tool will be moved to a debug/admin interface.',
  });
}

/**
 * Handle get_learning_effectiveness tool call (deprecated)
 */
export async function handleGetLearningEffectiveness(
  smartBrowser: SmartBrowser
): Promise<McpResponse> {
  const learningEngine = smartBrowser.getLearningEngine();
  const tieredFetcher = smartBrowser.getTieredFetcher();
  const proceduralMemory = smartBrowser.getProceduralMemory();

  const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;
  const formatPercentDecimal = (value: number): string => `${(value * 100).toFixed(1)}%`;

  const report = await computeLearningEffectiveness(
    learningEngine,
    tieredFetcher,
    proceduralMemory
  );

  return jsonResponse({
    generatedAt: new Date(report.generatedAt).toISOString(),
    healthScore: report.healthScore,
    patterns: {
      totalDiscovered: report.patterns.totalDiscovered,
      patternsUsed: report.patterns.patternsUsed,
      hitRate: formatPercent(report.patterns.hitRate),
      bypassablePatterns: report.patterns.bypassablePatterns,
      recentlyFailedPatterns: report.patterns.recentlyFailedPatterns,
      byConfidence: {
        high: {
          count: report.patterns.byConfidence.high.count,
          successRate: formatPercent(report.patterns.byConfidence.high.successRate),
        },
        medium: {
          count: report.patterns.byConfidence.medium.count,
          successRate: formatPercent(report.patterns.byConfidence.medium.successRate),
        },
        low: {
          count: report.patterns.byConfidence.low.count,
          successRate: formatPercent(report.patterns.byConfidence.low.successRate),
        },
      },
    },
    confidence: {
      overallAccuracy: formatPercent(report.confidence.overallAccuracy),
      highConfidenceAccuracy: formatPercent(report.confidence.highConfidenceAccuracy),
      mediumConfidenceAccuracy: formatPercent(report.confidence.mediumConfidenceAccuracy),
      lowConfidenceAccuracy: formatPercent(report.confidence.lowConfidenceAccuracy),
      confidenceGap: formatPercentDecimal(report.confidence.confidenceGap),
      overConfidentPatterns: report.confidence.overConfidentPatterns,
      underConfidentPatterns: report.confidence.underConfidentPatterns,
    },
    tiers: {
      firstTierSuccessRate: formatPercent(report.tiers.firstTierSuccessRate),
      timeSavedMs: Math.round(report.tiers.timeSavedMs),
      optimizationRatio: formatPercent(report.tiers.optimizationRatio),
      tierDistribution: {
        intelligence: report.tiers.tierDistribution.intelligence.count,
        lightweight: report.tiers.tierDistribution.lightweight.count,
        playwright: report.tiers.tierDistribution.playwright.count,
      },
    },
    skills: {
      totalSkills: report.skills.totalSkills,
      reusedSkills: report.skills.reusedSkills,
      reuseRate: formatPercent(report.skills.reuseRate),
      avgSuccessRate: formatPercent(report.skills.avgSuccessRate),
      highPerformingSkills: report.skills.highPerformingSkills,
      antiPatterns: report.skills.antiPatterns,
    },
    selectors: {
      totalSelectors: report.selectors.totalSelectors,
      highPrioritySelectors: report.selectors.highPrioritySelectors,
      avgSuccessRate: formatPercent(report.selectors.avgSuccessRate),
      avgFallbackChainLength: report.selectors.avgFallbackChainLength.toFixed(1),
    },
    domains: {
      totalDomains: report.domains.totalDomains,
      domainsWithPatterns: report.domains.domainsWithPatterns,
      domainsWithSelectors: report.domains.domainsWithSelectors,
      highSuccessDomains: report.domains.highSuccessDomains,
      avgDomainSuccessRate: formatPercent(report.domains.avgDomainSuccessRate),
      crossDomainBeneficiaries: report.domains.crossDomainBeneficiaries,
    },
    trend24h: {
      recentEvents: report.trend24h.recentEvents,
      newPatterns: report.trend24h.newPatterns,
      verifications: report.trend24h.verifications,
      failures: report.trend24h.failures,
      eventsPerHour: report.trend24h.eventsPerHour.toFixed(1),
    },
    insights: report.insights,
    deprecation_notice:
      'This tool is deprecated. Domain-specific insights are now included in smart_browse responses. This comprehensive metrics tool will be moved to a debug/admin interface.',
  });
}

/**
 * Debug traces action types
 */
export type DebugTracesAction =
  | 'list'
  | 'get'
  | 'stats'
  | 'configure'
  | 'export'
  | 'delete'
  | 'clear'
  | 'visualize'
  | 'compare';

/**
 * Handle debug_traces tool call
 */
export async function handleDebugTraces(
  smartBrowser: SmartBrowser,
  action: DebugTracesAction,
  args: Record<string, unknown>
): Promise<McpResponse> {
  const debugRecorder = smartBrowser.getDebugRecorder();

  switch (action) {
    case 'list': {
      const traces = await debugRecorder.query({
        domain: args.domain as string | undefined,
        urlPattern: args.urlPattern as string | undefined,
        success: args.success as boolean | undefined,
        errorType: args.errorType as
          | 'timeout'
          | 'network'
          | 'selector'
          | 'validation'
          | 'bot_challenge'
          | 'rate_limit'
          | 'auth'
          | 'unknown'
          | undefined,
        tier: args.tier as 'intelligence' | 'lightweight' | 'playwright' | undefined,
        limit: (args.limit as number) ?? 20,
        offset: args.offset as number | undefined,
      });

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        count: traces.length,
        traces: traces.map(t => ({
          id: t.id,
          timestamp: new Date(t.timestamp).toISOString(),
          url: t.url,
          domain: t.domain,
          success: t.success,
          durationMs: t.durationMs,
          tier: t.tiers.finalTier,
          fellBack: t.tiers.fellBack,
          errorCount: t.errors.length,
          contentLength: t.content.textLength,
        })),
      });
    }

    case 'get': {
      if (!args.id) {
        return errorResponse('id is required for get action');
      }
      const trace = await debugRecorder.getTrace(args.id as string);

      if (!trace) {
        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          error: `Trace not found: ${args.id}`,
        });
      }

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        trace,
      });
    }

    case 'stats': {
      const stats = await debugRecorder.getStats();

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        ...stats,
        oldestTrace: stats.oldestTrace ? new Date(stats.oldestTrace).toISOString() : null,
        newestTrace: stats.newestTrace ? new Date(stats.newestTrace).toISOString() : null,
        storageSizeMB: Math.round((stats.storageSizeBytes / 1024 / 1024) * 100) / 100,
      });
    }

    case 'configure': {
      if (args.enabled !== undefined) {
        if (args.enabled) {
          debugRecorder.enable();
        } else {
          debugRecorder.disable();
        }
      }

      if (args.alwaysRecordDomain) {
        debugRecorder.alwaysRecord(args.alwaysRecordDomain as string);
      }

      if (args.neverRecordDomain) {
        debugRecorder.neverRecord(args.neverRecordDomain as string);
      }

      if (
        args.onlyRecordFailures !== undefined ||
        args.maxTraces !== undefined ||
        args.maxAgeHours !== undefined
      ) {
        debugRecorder.updateConfig({
          onlyRecordFailures: args.onlyRecordFailures as boolean | undefined,
          maxTraces: args.maxTraces as number | undefined,
          maxAgeHours: args.maxAgeHours as number | undefined,
        });
      }

      const config = debugRecorder.getConfig();
      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        message: 'Configuration updated',
        config: {
          enabled: config.enabled,
          onlyRecordFailures: config.onlyRecordFailures,
          alwaysRecordDomains: config.alwaysRecordDomains,
          neverRecordDomains: config.neverRecordDomains,
          maxTraces: config.maxTraces,
          maxAgeHours: config.maxAgeHours,
        },
      });
    }

    case 'export': {
      if (!args.ids || (args.ids as string[]).length === 0) {
        return errorResponse('ids are required for export action');
      }
      const ids = args.ids as string[];
      const exportData = await debugRecorder.exportTraces(ids);

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        exportedAt: new Date(exportData.exportedAt).toISOString(),
        traceCount: exportData.traces.length,
        traces: exportData.traces,
      });
    }

    case 'delete': {
      if (!args.id) {
        return errorResponse('id is required for delete action');
      }
      const deleted = await debugRecorder.deleteTrace(args.id as string);

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        success: deleted,
        id: args.id,
        message: deleted ? 'Trace deleted' : 'Trace not found',
      });
    }

    case 'clear': {
      const count = await debugRecorder.clearAll();

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        success: true,
        deletedCount: count,
        message: `Deleted ${count} traces`,
      });
    }

    case 'visualize': {
      // Visualize a trace in various formats (F-009)
      if (!args.id) {
        return errorResponse('id is required for visualize action');
      }

      const trace = await debugRecorder.getTrace(args.id as string);
      if (!trace) {
        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          error: `Trace not found: ${args.id}`,
        });
      }

      const format = (args.format as VisualizationFormat) || 'ascii';
      const options: VisualizationOptions = {
        format,
        includeNetwork: args.includeNetwork as boolean ?? true,
        includeSelectors: args.includeSelectors as boolean ?? true,
        includeTitle: args.includeTitle as boolean ?? false,
        includeErrors: args.includeErrors as boolean ?? true,
        includeSkills: args.includeSkills as boolean ?? true,
        maxWidth: args.maxWidth as number ?? 80,
        useColor: args.useColor as boolean ?? (format !== 'html'),
      };

      const visualization = visualizeTrace(trace, options);

      // For HTML format, return the full HTML document
      if (format === 'html') {
        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          id: trace.id,
          format: 'html',
          contentType: 'text/html',
          visualization,
        });
      }

      // For text formats, return the visualization string
      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        id: trace.id,
        format,
        visualization,
        // Also include a compact summary for quick reference
        summary: createTraceSummaryCard(trace),
      });
    }

    case 'compare': {
      // Compare two traces side by side (F-009)
      const id1 = args.id1 as string;
      const id2 = args.id2 as string;

      if (!id1 || !id2) {
        return errorResponse('id1 and id2 are required for compare action');
      }

      const [trace1, trace2] = await Promise.all([
        debugRecorder.getTrace(id1),
        debugRecorder.getTrace(id2),
      ]);

      const notFoundErrors: string[] = [];
      if (!trace1) {
        notFoundErrors.push(`Trace not found: ${id1}`);
      }
      if (!trace2) {
        notFoundErrors.push(`Trace not found: ${id2}`);
      }

      if (notFoundErrors.length > 0) {
        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          error: notFoundErrors.join('; '),
        });
      }

      // TypeScript needs help knowing these are non-null after the check above
      const t1 = trace1!;
      const t2 = trace2!;

      const useColor = args.useColor as boolean ?? true;
      const comparison = compareTraces(t1, t2, useColor);

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        trace1Id: id1,
        trace2Id: id2,
        comparison,
        differences: {
          success: t1.success !== t2.success,
          tier: t1.tiers.finalTier !== t2.tiers.finalTier,
          duration: Math.abs(t1.durationMs - t2.durationMs),
          contentLength: Math.abs(t1.content.textLength - t2.content.textLength),
          errorCount: Math.abs(t1.errors.length - t2.errors.length),
        },
      });
    }

    default:
      return errorResponse(`Unknown debug_traces action: ${action}`);
  }
}
