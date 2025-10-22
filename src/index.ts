#!/usr/bin/env node

/**
 * LLM Browser MCP Server
 * An intelligent browser designed for LLM interactions with API discovery and session management
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
import { BrowseTool } from './tools/browse-tool.js';
import { ApiCallTool } from './tools/api-call-tool.js';

// Initialize core components
const browserManager = new BrowserManager();
const contentExtractor = new ContentExtractor();
const apiAnalyzer = new ApiAnalyzer();
const sessionManager = new SessionManager('./sessions');
const knowledgeBase = new KnowledgeBase('./knowledge-base.json');

// Initialize tools
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
    version: '0.1.0',
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
      {
        name: 'browse',
        description: `Browse a URL and extract content with full network and console capture.

This tool automatically:
- Captures all network requests and API calls
- Records console logs and errors
- Discovers API patterns for future optimization
- Extracts clean markdown content
- Uses saved sessions when available

Returns: Page content (markdown, HTML, text), network requests, console logs, and discovered API patterns.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to browse',
            },
            waitFor: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
              description: 'Wait strategy (default: networkidle)',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (default: 30000)',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile name to use (default: "default")',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'execute_api_call',
        description: `Execute a direct API call using saved session authentication.

This bypasses the browser rendering entirely and makes a direct HTTP request,
inheriting cookies and authentication from the saved session.

Use this when you've discovered an API endpoint and want to access it directly
without loading the full page.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The API endpoint URL',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              description: 'HTTP method (default: GET)',
            },
            headers: {
              type: 'object',
              description: 'Additional headers to send',
            },
            body: {
              type: 'object',
              description: 'Request body (for POST/PUT/PATCH)',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile name to use (default: "default")',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'save_session',
        description: `Save the current browser session for a domain.

This captures cookies, localStorage, and sessionStorage so future requests
can automatically use the authenticated session.

Use this after browsing a page where you're logged in or have established a session.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to save the session for (e.g., "github.com")',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile name (default: "default")',
            },
          },
          required: ['domain'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List all saved sessions with their domains and last used timestamps.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_knowledge_stats',
        description: `Get statistics about learned API patterns.

Shows:
- Total domains with learned patterns
- Total API patterns discovered
- Patterns that can bypass browser rendering
- Most frequently accessed domains`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_learned_patterns',
        description: 'Get all learned API patterns for a specific domain.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to get patterns for (e.g., "api.github.com")',
            },
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
      case 'browse': {
        const result = await browseTool.execute(args.url as string, {
          waitFor: args.waitFor as any,
          timeout: args.timeout as number,
          sessionProfile: args.sessionProfile as string,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
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
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'save_session': {
        const context = await browserManager.getContext((args.sessionProfile as string) || 'default');
        await sessionManager.saveSession(args.domain as string, context, (args.sessionProfile as string) || 'default');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Session saved for ${args.domain}`,
              }),
            },
          ],
        };
      }

      case 'list_sessions': {
        const sessions = sessionManager.listSessions();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ sessions }, null, 2),
            },
          ],
        };
      }

      case 'get_knowledge_stats': {
        const stats = knowledgeBase.getStats();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
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
          }),
        },
      ],
      isError: true,
    };
  }
});

// Initialize and start server
async function main() {
  await sessionManager.initialize();
  await knowledgeBase.initialize();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('LLM Browser MCP Server running');
  console.error('Capabilities: browse, execute_api_call, session management, API learning');

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
