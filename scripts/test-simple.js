#!/usr/bin/env node

/**
 * Simplified test to see actual MCP responses
 */

import { spawn } from 'child_process';

console.log('🧪 Simple MCP Test\n');

// Start test server
console.log('Starting test server on port 3456...');
const testServer = spawn('node', ['test-server.js']);

testServer.stdout.on('data', (data) => {
  console.log('[Server]', data.toString().trim());
});

setTimeout(() => {
  console.log('\nStarting MCP server...');
  const mcpServer = spawn('node', ['dist/index.js']);

  mcpServer.stderr.on('data', (data) => {
    console.log('[MCP]', data.toString().trim());
    if (data.toString().includes('running')) {
      setTimeout(() => {
        console.log('\n=== Sending browse request ===\n');
        mcpServer.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'browse',
            arguments: {
              url: 'http://localhost:3456',
              waitFor: 'networkidle',
              timeout: 10000
            }
          }
        }) + '\n');
      }, 1000);
    }
  });

  let buffer = '';
  mcpServer.stdout.on('data', (data) => {
    buffer += data.toString();

    // Try to find complete JSON objects
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line

    lines.forEach(line => {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('\n=== MCP Response ===');
          console.log(JSON.stringify(response, null, 2));

          // Kill everything after response
          setTimeout(() => {
            mcpServer.kill();
            testServer.kill();
            process.exit(0);
          }, 1000);
        } catch (e) {
          console.log('Raw output:', line);
        }
      }
    });
  });

  setTimeout(() => {
    console.log('\n⏱️ Timeout reached');
    mcpServer.kill();
    testServer.kill();
    process.exit(1);
  }, 20000);

}, 1000);
