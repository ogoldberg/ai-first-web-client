#!/usr/bin/env node

/**
 * Dogfood Test Environment
 * Quick way to test the MCP server without full Claude Desktop setup
 *
 * Usage:
 *   node dogfood.js browse <url>
 *   node dogfood.js api-call <url>
 *   node dogfood.js stats
 *   node dogfood.js patterns <domain>
 *   node dogfood.js sessions
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

if (!command) {
  console.log(`
🐶 LLM Browser Dogfood Test Environment

Usage:
  node dogfood.js browse <url>              Browse a URL
  node dogfood.js api-call <url> [method]   Call API directly
  node dogfood.js stats                     Show knowledge base stats
  node dogfood.js patterns <domain>         Show learned patterns for domain
  node dogfood.js sessions                  List saved sessions
  node dogfood.js server                    Start test HTTP server

Examples:
  node dogfood.js browse https://example.com
  node dogfood.js browse http://localhost:3456
  node dogfood.js api-call http://localhost:3456/api/products
  node dogfood.js stats
  node dogfood.js patterns localhost
  node dogfood.js sessions
  `);
  process.exit(0);
}

console.log('🐶 Starting MCP server...\n');

const mcpServer = spawn('node', ['dist/index.js']);
let serverReady = false;
let requestId = 1;

mcpServer.stderr.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('LLM Browser MCP Server running')) {
    serverReady = true;
    console.log('✅ Server ready\n');
    executeCommand();
  }
});

let buffer = '';
mcpServer.stdout.on('data', (data) => {
  buffer += data.toString();

  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  lines.forEach(line => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        handleResponse(response);
      } catch (e) {
        // Ignore partial JSON
      }
    }
  });
});

function executeCommand() {
  let request;

  switch (command) {
    case 'browse':
      if (!arg1) {
        console.error('❌ URL required: node dogfood.js browse <url>');
        process.exit(1);
      }
      console.log(`📡 Browsing: ${arg1}\n`);
      request = {
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: {
          name: 'browse',
          arguments: {
            url: arg1,
            waitFor: 'networkidle',
            timeout: 30000
          }
        }
      };
      break;

    case 'api-call':
      if (!arg1) {
        console.error('❌ URL required: node dogfood.js api-call <url> [method]');
        process.exit(1);
      }
      const method = arg2 || 'GET';
      console.log(`⚡ Calling API: ${method} ${arg1}\n`);
      request = {
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: {
          name: 'execute_api_call',
          arguments: {
            url: arg1,
            method: method
          }
        }
      };
      break;

    case 'stats':
      console.log(`📊 Getting knowledge base stats...\n`);
      request = {
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: {
          name: 'get_knowledge_stats',
          arguments: {}
        }
      };
      break;

    case 'patterns':
      if (!arg1) {
        console.error('❌ Domain required: node dogfood.js patterns <domain>');
        process.exit(1);
      }
      console.log(`🧠 Getting learned patterns for: ${arg1}\n`);
      request = {
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: {
          name: 'get_learned_patterns',
          arguments: {
            domain: arg1
          }
        }
      };
      break;

    case 'sessions':
      console.log(`🔐 Listing saved sessions...\n`);
      request = {
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: {
          name: 'list_sessions',
          arguments: {}
        }
      };
      break;

    case 'server':
      console.log('🚀 Starting test HTTP server...\n');
      const testServer = spawn('node', ['test-server.js']);
      testServer.stdout.on('data', (data) => console.log(data.toString()));
      testServer.stderr.on('data', (data) => console.error(data.toString()));
      console.log('\nPress Ctrl+C to stop');
      process.on('SIGINT', () => {
        testServer.kill();
        mcpServer.kill();
        process.exit(0);
      });
      return; // Don't send request for server command

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "node dogfood.js" for usage');
      mcpServer.kill();
      process.exit(1);
  }

  if (request) {
    mcpServer.stdin.write(JSON.stringify(request) + '\n');
  }
}

function handleResponse(response) {
  if (response.error) {
    console.error('❌ Error:', response.error);
    mcpServer.kill();
    process.exit(1);
    return;
  }

  if (!response.result) {
    return;
  }

  try {
    const result = JSON.parse(response.result.content[0].text);

    switch (command) {
      case 'browse':
        console.log('✅ Browse Results:\n');
        console.log(`📄 Title: ${result.title}`);
        console.log(`🔗 URL: ${result.url}`);
        console.log(`📊 Network requests: ${result.network.length}`);
        console.log(`💬 Console messages: ${result.console.length}`);
        console.log(`🔍 APIs discovered: ${result.discoveredApis.length}`);

        if (result.discoveredApis.length > 0) {
          console.log(`\n🎯 Discovered APIs:`);
          result.discoveredApis.forEach((api, idx) => {
            console.log(`\n${idx + 1}. ${api.method} ${api.endpoint}`);
            console.log(`   Confidence: ${api.confidence}`);
            console.log(`   Can bypass: ${api.canBypass}`);
            console.log(`   Reason: ${api.reason || 'N/A'}`);
          });
        }

        console.log(`\n📝 Content (first 200 chars):`);
        console.log(result.content.markdown.substring(0, 200) + '...');
        break;

      case 'api-call':
        console.log('✅ API Call Results:\n');
        console.log(`Status: ${result.status || 'N/A'}`);
        console.log(`Duration: ${result.duration || 'N/A'}ms`);
        console.log(`\nResponse:`);
        console.log(JSON.stringify(result.body || result, null, 2));
        break;

      case 'stats':
        console.log('✅ Knowledge Base Stats:\n');
        console.log(`📚 Total domains: ${result.totalDomains}`);
        console.log(`🔍 Total patterns: ${result.totalPatterns}`);
        console.log(`⚡ Can bypass: ${result.bypassCapable || 'N/A'}`);
        if (result.topDomains && result.topDomains.length > 0) {
          console.log(`\n🏆 Top domains:`);
          result.topDomains.forEach(d => {
            console.log(`   ${d.domain}: ${d.patterns} patterns, ${d.usageCount} uses`);
          });
        }
        break;

      case 'patterns':
        console.log('✅ Learned Patterns:\n');
        if (result.patterns && result.patterns.length > 0) {
          result.patterns.forEach((pattern, idx) => {
            console.log(`${idx + 1}. ${pattern.method} ${pattern.endpoint}`);
            console.log(`   Confidence: ${pattern.confidence}`);
            console.log(`   Can bypass: ${pattern.canBypass}`);
            console.log(`   Auth: ${pattern.authType || 'N/A'}`);
            console.log();
          });
        } else {
          console.log('No patterns found for this domain');
        }
        break;

      case 'sessions':
        console.log('✅ Saved Sessions:\n');
        if (result.sessions && result.sessions.length > 0) {
          result.sessions.forEach(session => {
            console.log(`📁 ${session.domain}`);
            console.log(`   Profile: ${session.profile}`);
            console.log(`   Last used: ${new Date(session.lastUsed).toLocaleString()}`);
            console.log(`   Authenticated: ${session.isAuthenticated ? 'Yes' : 'No'}`);
            console.log();
          });
        } else {
          console.log('No saved sessions');
        }
        break;
    }

  } catch (e) {
    console.error('❌ Failed to parse response:', e.message);
    console.log('Raw response:', response.result?.content[0]?.text);
  }

  console.log('\n✨ Done!');
  mcpServer.kill();
  process.exit(0);
}

setTimeout(() => {
  if (!serverReady) {
    console.error('❌ Server failed to start within 5 seconds');
    mcpServer.kill();
    process.exit(1);
  }
}, 5000);

setTimeout(() => {
  console.error('❌ Command timed out after 30 seconds');
  mcpServer.kill();
  process.exit(1);
}, 30000);
