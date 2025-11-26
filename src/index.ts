#!/usr/bin/env node

/**
 * LLM Browser MCP Server
 *
 * An intelligent browser designed for LLM interactions with:
 * - Automatic API discovery and learning
 * - Content structure learning with selector fallbacks
 * - Cross-domain pattern transfer
 * - Response validation
 * - Pagination detection
 * - Change frequency tracking
 * - Session management
 *
 * The browser gets smarter over time, learning from every interaction.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { BrowserManager } from './core/browser-manager.js';
import { ContentExtractor } from './utils/content-extractor.js';
import { ApiAnalyzer } from './core/api-analyzer.js';
import { SessionManager } from './core/session-manager.js';
import { KnowledgeBase } from './core/knowledge-base.js';
import { SmartBrowser } from './core/smart-browser.js';
import { BrowseTool } from './tools/browse-tool.js';
import { ApiCallTool } from './tools/api-call-tool.js';

// Initialize core components
const browserManager = new BrowserManager();
const contentExtractor = new ContentExtractor();
const apiAnalyzer = new ApiAnalyzer();
const sessionManager = new SessionManager('./sessions');
const knowledgeBase = new KnowledgeBase('./knowledge-base.json');

// Initialize smart browser (unified intelligent browsing)
const smartBrowser = new SmartBrowser(
  browserManager,
  contentExtractor,
  apiAnalyzer,
  sessionManager
);

// Initialize legacy tools (for backward compatibility)
const browseTool = new BrowseTool(
  browserManager,
  contentExtractor,
  apiAnalyzer,
  sessionManager,
  knowledgeBase
);
const apiCallTool = new ApiCallTool(browserManager);

// Create MCP server
const server = new Server(
  {
    name: 'llm-browser',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ============================================
      // PRIMARY TOOL: Smart Browse (Recommended)
      // ============================================
      {
        name: 'smart_browse',
        description: `Intelligently browse a URL with automatic learning and optimization.

This is the RECOMMENDED browsing tool. It automatically:
- Uses learned selectors for reliable content extraction
- Falls back through selector chains if primary fails
- Validates responses against learned patterns
- Learns from successes and failures
- Applies cross-domain patterns (e.g., Spanish gov sites share patterns)
- Detects pagination for multi-page content
- Tracks content change frequency
- Handles cookie banners automatically
- Retries with exponential backoff

The browser gets smarter with every use. For government sites like boe.es,
extranjeria.gob.es, uscis.gov, etc., it has pre-configured patterns.

Returns: Content, tables, APIs discovered, and learning insights.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to browse',
            },
            contentType: {
              type: 'string',
              enum: ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'table'],
              description: 'Type of content to extract (helps select right selectors)',
            },
            followPagination: {
              type: 'boolean',
              description: 'Follow pagination to get all pages (default: false)',
            },
            maxPages: {
              type: 'number',
              description: 'Maximum pages to follow if pagination enabled (default: 5)',
            },
            checkForChanges: {
              type: 'boolean',
              description: 'Check if content changed since last visit (default: false)',
            },
            waitForSelector: {
              type: 'string',
              description: 'CSS selector to wait for (for SPAs)',
            },
            scrollToLoad: {
              type: 'boolean',
              description: 'Scroll to trigger lazy-loaded content (default: false)',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile for authenticated access (default: "default")',
            },
          },
          required: ['url'],
        },
      },

      // ============================================
      // DOMAIN INTELLIGENCE
      // ============================================
      {
        name: 'get_domain_intelligence',
        description: `Get intelligence summary for a domain.

Shows what the browser has learned about a domain:
- Known API patterns
- Learned content selectors
- Validation rules
- Pagination patterns
- Recent failure patterns
- Success rate
- Domain group (spanish_gov, us_gov, eu_gov)
- Recommended strategies

Use this to understand how well the browser knows a domain before browsing.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Domain to check (e.g., "boe.es", "uscis.gov")',
            },
          },
          required: ['domain'],
        },
      },

      // ============================================
      // LEARNING MANAGEMENT
      // ============================================
      {
        name: 'get_learning_stats',
        description: `Get comprehensive statistics about the browser's learning.

Shows:
- Total domains with learned patterns
- API patterns discovered (and how many can bypass rendering)
- Learned content selectors
- Validation rules
- Domain groups
- Recent learning events

Use this to understand the browser's overall intelligence level.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // LEGACY TOOLS (Backward Compatibility)
      // ============================================
      {
        name: 'browse',
        description: `[LEGACY] Basic browse - use smart_browse instead for better results.

Browses a URL with network capture but without learning features.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to browse' },
            waitFor: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
            },
            timeout: { type: 'number' },
            sessionProfile: { type: 'string' },
          },
          required: ['url'],
        },
      },
      {
        name: 'execute_api_call',
        description: `Execute a direct API call using saved session authentication.

Bypasses browser rendering for discovered API endpoints.
Use after discovering an API with smart_browse.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The API endpoint URL' },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            },
            headers: { type: 'object' },
            body: { type: 'object' },
            sessionProfile: { type: 'string' },
          },
          required: ['url'],
        },
      },
      {
        name: 'save_session',
        description: `Save browser session for authenticated access.

Captures cookies, localStorage, sessionStorage for future requests.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Domain to save session for' },
            sessionProfile: { type: 'string' },
          },
          required: ['domain'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List all saved sessions.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_knowledge_stats',
        description: '[LEGACY] Use get_learning_stats instead for more detail.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_learned_patterns',
        description: '[LEGACY] Use get_domain_intelligence instead.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
          },
          required: ['domain'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!args) {
      throw new Error('Missing arguments');
    }

    switch (name) {
      // ============================================
      // SMART BROWSE (Primary Tool)
      // ============================================
      case 'smart_browse': {
        const result = await smartBrowser.browse(args.url as string, {
          contentType: args.contentType as any,
          followPagination: args.followPagination as boolean,
          maxPages: args.maxPages as number,
          checkForChanges: args.checkForChanges as boolean,
          waitForSelector: args.waitForSelector as string,
          scrollToLoad: args.scrollToLoad as boolean,
          sessionProfile: args.sessionProfile as string,
          validateContent: true,
          enableLearning: true,
        });

        // Format result for LLM consumption
        const formattedResult = {
          url: result.url,
          title: result.title,
          content: {
            markdown: result.content.markdown,
            textLength: result.content.text.length,
          },
          tables: result.tables,
          metadata: result.metadata,
          // Learning insights (key differentiator)
          intelligence: {
            confidenceLevel: result.learning.confidenceLevel,
            domainGroup: result.learning.domainGroup,
            validationPassed: result.learning.validationResult?.valid,
            validationIssues: result.learning.validationResult?.reasons,
            contentChanged: result.learning.contentChanged,
            recommendedRefreshHours: result.learning.recommendedRefreshHours,
            paginationAvailable: !!result.learning.paginationDetected,
            selectorsSucceeded: result.learning.selectorsSucceeded.length,
            selectorsFailed: result.learning.selectorsFailed.length,
          },
          // Discovered APIs for future direct access
          discoveredApis: result.discoveredApis.map(api => ({
            endpoint: api.endpoint,
            method: api.method,
            canBypassBrowser: api.canBypass,
            confidence: api.confidence,
          })),
          // Additional pages if pagination was followed
          additionalPages: result.additionalPages?.map(page => ({
            url: page.url,
            textLength: page.content.text.length,
          })),
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedResult, null, 2),
            },
          ],
        };
      }

      // ============================================
      // DOMAIN INTELLIGENCE
      // ============================================
      case 'get_domain_intelligence': {
        const intelligence = await smartBrowser.getDomainIntelligence(args.domain as string);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                domain: args.domain,
                ...intelligence,
                recommendations: getRecommendations(intelligence),
              }, null, 2),
            },
          ],
        };
      }

      // ============================================
      // LEARNING STATS
      // ============================================
      case 'get_learning_stats': {
        const learningEngine = smartBrowser.getLearningEngine();
        const stats = learningEngine.getStats();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
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
              }, null, 2),
            },
          ],
        };
      }

      // ============================================
      // LEGACY TOOLS
      // ============================================
      case 'browse': {
        const result = await browseTool.execute(args.url as string, {
          waitFor: args.waitFor as any,
          timeout: args.timeout as number,
          sessionProfile: args.sessionProfile as string,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'execute_api_call': {
        const result = await apiCallTool.execute(args.url as string, {
          method: args.method as string,
          headers: args.headers as Record<string, string>,
          body: args.body,
          sessionProfile: args.sessionProfile as string,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'save_session': {
        const context = await browserManager.getContext((args.sessionProfile as string) || 'default');
        await sessionManager.saveSession(
          args.domain as string,
          context,
          (args.sessionProfile as string) || 'default'
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Session saved for ${args.domain}` }),
            },
          ],
        };
      }

      case 'list_sessions': {
        const sessions = sessionManager.listSessions();
        return {
          content: [{ type: 'text', text: JSON.stringify({ sessions }, null, 2) }],
        };
      }

      case 'get_knowledge_stats': {
        const stats = knowledgeBase.getStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        };
      }

      case 'get_learned_patterns': {
        const patterns = knowledgeBase.getPatterns(args.domain as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ domain: args.domain, patterns }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            tip: 'If this is a recurring error, the browser may need a session refresh or the site may be blocking requests.',
          }),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Generate recommendations based on domain intelligence
 */
function getRecommendations(intelligence: Awaited<ReturnType<typeof smartBrowser.getDomainIntelligence>>): string[] {
  const recommendations: string[] = [];

  if (intelligence.knownPatterns === 0) {
    recommendations.push('First visit to this domain - learning will begin automatically');
  }

  if (intelligence.successRate < 0.7) {
    recommendations.push('Low success rate - consider using a session or adjusting wait strategy');
  }

  if (intelligence.recentFailures > 5) {
    recommendations.push('Many recent failures - site may be rate limiting or blocking');
  }

  if (intelligence.shouldUseSession) {
    recommendations.push('This domain benefits from session persistence - use save_session after authentication');
  }

  if (intelligence.domainGroup) {
    recommendations.push(`Part of ${intelligence.domainGroup} group - shared patterns will be applied`);
  }

  if (intelligence.selectorChains > 0) {
    recommendations.push(`${intelligence.selectorChains} learned selectors available for reliable extraction`);
  }

  if (intelligence.paginationPatterns > 0) {
    recommendations.push('Pagination patterns learned - use followPagination for multi-page content');
  }

  return recommendations;
}

// Initialize and start server
async function main() {
  await sessionManager.initialize();
  await knowledgeBase.initialize();
  await smartBrowser.initialize();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('LLM Browser MCP Server v0.2.0 running');
  console.error('Primary tool: smart_browse (with automatic learning)');
  console.error('Domain groups: spanish_gov, us_gov, eu_gov');

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await browserManager.cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
