#!/usr/bin/env node

/**
 * Unbrowser Intelligence MCP Server
 *
 * A lightweight MCP server designed to work alongside AI browser tools
 * like Claude-in-Chrome, browser-use, and other LLM-driven browsers.
 *
 * This server provides intelligence tools that LLMs should try FIRST
 * before resorting to full browser automation:
 *
 * - unbrowser_get: Attempt to fetch content without browser automation
 * - unbrowser_check: Check what we know about a URL before browsing
 *
 * The idea: If Unbrowser can get the data via cache, API discovery, or
 * stealth fetch, the LLM saves time and the user doesn't see browser
 * windows opening and closing.
 *
 * Usage with Claude Desktop:
 * ```json
 * {
 *   "mcpServers": {
 *     "unbrowser-intelligence": {
 *       "command": "npx",
 *       "args": ["llm-browser", "--intelligence"]
 *     }
 *   }
 * }
 * ```
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  handleUnbrowserGet,
  handleUnbrowserCheck,
  type UnbrowserGetArgs,
  type UnbrowserCheckArgs,
} from './mcp/handlers/intelligence-handlers.js';
import { jsonResponse, errorResponse } from './mcp/response-formatters.js';
import { logger } from './utils/logger.js';

const VERSION = '0.1.0';

/**
 * Tool schemas for the intelligence server
 */
const INTELLIGENCE_TOOLS: Tool[] = [
  {
    name: 'unbrowser_get',
    description: `Get content from a URL WITHOUT opening a browser window.

**IMPORTANT: Try this tool FIRST before using browser automation tools.**

This tool attempts to fetch and extract content using:
1. Cached responses from previous requests
2. Discovered API endpoints (faster than scraping)
3. Stealth HTTP fetch with TLS fingerprint impersonation

If successful, you get the data immediately without any browser UI.
If it can't get the data, it returns guidance for browser automation.

Returns:
- success: true/false
- content: { title, markdown, text, structured } if successful
- fallback: { reason, suggestion } if browser automation needed
- browserHints: { selectors, stealthMode, rateLimit } for effective browsing`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch content from',
        },
        extract: {
          type: 'string',
          enum: ['auto', 'product', 'article', 'structured', 'markdown', 'text'],
          description:
            'What to extract. "auto" detects the best approach. "product" extracts e-commerce data. "article" extracts article content.',
          default: 'auto',
        },
        maxAge: {
          type: 'number',
          description: 'Accept cached data up to this many seconds old. Default: 3600 (1 hour)',
          default: 3600,
        },
        timeout: {
          type: 'number',
          description: 'Fetch timeout in milliseconds. Default: 15000',
          default: 15000,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'unbrowser_check',
    description: `Check what Unbrowser knows about a URL BEFORE browsing.

Use this to decide whether to:
1. Try unbrowser_get (if canFetchDirectly is true)
2. Go straight to browser automation (if auth required, heavy JS, etc.)

Returns:
- canFetchDirectly: boolean - whether unbrowser_get is likely to work
- reason: why or why not
- knowledge: learned patterns, template type, success rate
- quirks: rate limits, anti-bot info, auth requirements
- recommendations: suggested approach
- knownSelectors: CSS selectors that work on this site`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to check',
        },
      },
      required: ['url'],
    },
  },
];

/**
 * Create and start the intelligence MCP server
 */
async function main() {
  const server = new Server(
    {
      name: 'unbrowser-intelligence',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: INTELLIGENCE_TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    if (!args) {
      return errorResponse(new Error('Missing arguments'));
    }

    try {
      switch (name) {
        case 'unbrowser_get': {
          return await handleUnbrowserGet({
            url: args.url as string,
            extract: args.extract as UnbrowserGetArgs['extract'],
            maxAge: args.maxAge as number,
            timeout: args.timeout as number,
          });
        }

        case 'unbrowser_check': {
          return await handleUnbrowserCheck({
            url: args.url as string,
          });
        }

        default:
          return errorResponse(
            new Error(`Unknown tool: ${name}. Available: unbrowser_get, unbrowser_check`)
          );
      }
    } catch (error) {
      logger.server.error('Tool error', { name, error: String(error) });
      return errorResponse(error instanceof Error ? error : new Error(String(error)));
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.server.info('Unbrowser Intelligence Server started', {
    version: VERSION,
    tools: INTELLIGENCE_TOOLS.map(t => t.name),
    purpose: 'AI browser tools integration',
  });

  // Cleanup on exit
  process.on('SIGINT', () => {
    logger.server.info('Shutting down');
    process.exit(0);
  });
}

// Check if running with --intelligence flag or as standalone
const isIntelligenceMode =
  process.argv.includes('--intelligence') || process.argv[1]?.includes('intelligence-server');

if (isIntelligenceMode || require.main === module) {
  main().catch(error => {
    logger.server.error('Fatal error', { error: String(error) });
    process.exit(1);
  });
}

export { main as startIntelligenceServer };
