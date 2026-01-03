/**
 * Dynamic Handlers Handler
 *
 * MCP tool handler for viewing and managing learned site patterns
 * and quirks (yt-dlp inspired pattern learning system).
 */

import { jsonResponse, type McpResponse } from '../response-formatters.js';
import { unknownActionError, missingArgumentsError } from '../../utils/error-messages.js';
import {
  dynamicHandlerIntegration,
  type ExtractionContext,
} from '../../core/dynamic-handlers/integration.js';
import { PATTERN_TEMPLATES, detectTemplate } from '../../core/dynamic-handlers/pattern-templates.js';
import type { HandlerTemplate } from '../../core/dynamic-handlers/types.js';

export type DynamicHandlerStatsAction =
  | 'stats'
  | 'domains'
  | 'quirks'
  | 'templates'
  | 'recommendation'
  | 'export';

export interface DynamicHandlerStatsArgs {
  action: DynamicHandlerStatsAction;
  domain?: string;
  url?: string;
  html?: string;
  limit?: number;
  hasQuirks?: boolean;
}

/**
 * Handle dynamic handler stats requests
 */
export function handleDynamicHandlerStats(args: DynamicHandlerStatsArgs): McpResponse {
  const { action, domain, url, html, limit = 50, hasQuirks } = args;

  switch (action) {
    case 'stats': {
      const stats = dynamicHandlerIntegration.getStats();
      return jsonResponse({
        action: 'stats',
        summary: {
          totalHandlers: stats.totalHandlers,
          totalQuirks: stats.totalQuirks,
          totalObservations: stats.totalObservations,
          templateCount: Object.keys(PATTERN_TEMPLATES).length,
        },
        topDomains: stats.topDomains.slice(0, 10),
        message: stats.totalObservations > 0
          ? `Learned from ${stats.totalObservations} extractions across ${stats.topDomains.length} domains`
          : 'No patterns learned yet. Browse some sites to start learning!',
      });
    }

    case 'domains': {
      const stats = dynamicHandlerIntegration.getStats();
      const registry = dynamicHandlerIntegration.getRegistry();

      // Get all domains with data
      let domains = stats.topDomains.map(d => {
        const quirks = registry.getQuirks(d.domain);
        return {
          domain: d.domain,
          observations: d.observations,
          hasQuirks: !!quirks,
          quirks: quirks ? {
            needsStealth: quirks.stealth?.required || false,
            hasRateLimit: !!quirks.rateLimit,
            hasAntiBot: !!quirks.antiBot,
            requiredHeadersCount: quirks.requiredHeaders
              ? Object.keys(quirks.requiredHeaders).length
              : 0,
          } : undefined,
        };
      });

      // Apply filter
      if (hasQuirks) {
        domains = domains.filter(d => d.hasQuirks);
      }

      // Apply limit
      domains = domains.slice(0, limit);

      return jsonResponse({
        action: 'domains',
        count: domains.length,
        totalDomains: stats.topDomains.length,
        domains,
      });
    }

    case 'quirks': {
      if (!domain) {
        throw new Error(missingArgumentsError('dynamic_handler_stats:quirks', ['domain']));
      }

      const quirks = dynamicHandlerIntegration.getQuirks(domain);
      const hasLearned = dynamicHandlerIntegration.hasLearnedDomain(domain);

      if (!quirks) {
        return jsonResponse({
          action: 'quirks',
          domain,
          hasLearned,
          quirks: null,
          message: hasLearned
            ? 'Domain has been seen but no quirks learned yet'
            : 'Domain has not been browsed yet',
        });
      }

      return jsonResponse({
        action: 'quirks',
        domain,
        hasLearned: true,
        quirks: {
          stealth: quirks.stealth,
          rateLimit: quirks.rateLimit,
          antiBot: quirks.antiBot,
          requiredHeaders: quirks.requiredHeaders,
          timing: quirks.timing,
          selectorOverrides: quirks.selectorOverrides,
          confidence: quirks.confidence,
          learnedAt: new Date(quirks.learnedAt).toISOString(),
          lastVerified: new Date(quirks.lastVerified).toISOString(),
        },
      });
    }

    case 'templates': {
      const templates = Object.entries(PATTERN_TEMPLATES).map(([id, template]) => ({
        id,
        name: template.name,
        signalCount: template.signals.length,
        extractionType: template.extraction.primary.type,
        fallbackCount: template.extraction.fallbacks.length,
        signals: template.signals.map(s => ({
          type: s.type,
          weight: s.weight,
        })),
      }));

      return jsonResponse({
        action: 'templates',
        count: templates.length,
        templates,
        usage: 'Templates are automatically detected from HTML content. Use the "recommendation" action with HTML to see which template matches.',
      });
    }

    case 'recommendation': {
      if (!url) {
        throw new Error(missingArgumentsError('dynamic_handler_stats:recommendation', ['url']));
      }

      let parsedDomain: string;
      try {
        parsedDomain = new URL(url).hostname;
      } catch {
        parsedDomain = url;
      }

      const context: ExtractionContext = {
        url,
        domain: parsedDomain,
        html,
      };

      const recommendation = dynamicHandlerIntegration.getRecommendation(context);

      // Also run template detection if HTML provided
      let templateDetection: { template: HandlerTemplate; confidence: number; signals: string[] } | null = null;
      if (html) {
        templateDetection = detectTemplate(html, url);
      }

      return jsonResponse({
        action: 'recommendation',
        url,
        domain: parsedDomain,
        recommendation: {
          template: recommendation.template,
          confidence: Math.round(recommendation.confidence * 100) / 100,
          needsStealth: recommendation.needsStealth,
          rateLimit: recommendation.rateLimit,
          apiCount: recommendation.apis.length,
          ruleCount: recommendation.rules.length,
          hasQuirks: !!recommendation.quirks,
        },
        templateDetection: templateDetection ? {
          template: templateDetection.template,
          confidence: Math.round(templateDetection.confidence * 100) / 100,
          signalsMatched: templateDetection.signals.length,
          // signals are strings in format "type:pattern"
          signals: templateDetection.signals.slice(0, 5).map(s => {
            const [type, pattern] = s.split(':', 2);
            return { type, pattern };
          }),
        } : null,
        advice: recommendation.needsStealth
          ? 'This site requires stealth mode. The system will automatically apply anti-bot evasion.'
          : recommendation.rateLimit
            ? `Rate limited to ${recommendation.rateLimit} req/s`
            : 'No special requirements detected',
      });
    }

    case 'export': {
      const registry = dynamicHandlerIntegration.getRegistry();
      const serialized = registry.serialize();

      return jsonResponse({
        action: 'export',
        data: serialized,
        note: 'This JSON can be saved and loaded into another instance using loadRegistry()',
      });
    }

    default:
      throw new Error(
        unknownActionError(action, 'dynamic_handler_stats', [
          'stats',
          'domains',
          'quirks',
          'templates',
          'recommendation',
          'export',
        ])
      );
  }
}
