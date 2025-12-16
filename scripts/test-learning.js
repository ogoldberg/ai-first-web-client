#!/usr/bin/env node

/**
 * Test script to verify the learning component works end-to-end
 *
 * This test will:
 * 1. Start the test HTTP server
 * 2. Use the MCP server to browse the page
 * 3. Verify API patterns are discovered
 * 4. Verify patterns are stored in knowledge base
 * 5. Test retrieving learned patterns
 * 6. Test direct API execution using learned patterns
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';

const TEST_SERVER_PORT = 3456;
const TEST_URL = `http://localhost:${TEST_SERVER_PORT}`;

console.log('🧪 Testing Learning Component End-to-End\n');

// Clean up any existing knowledge base to start fresh
if (existsSync('./knowledge-base.json')) {
  console.log('🧹 Cleaning up old knowledge base...');
  unlinkSync('./knowledge-base.json');
}

// Step 1: Start test HTTP server
console.log('📡 Step 1: Starting test HTTP server...');
const testServer = spawn('node', ['test-server.js']);

testServer.stdout.on('data', (data) => {
  console.log(`   [Test Server] ${data.toString().trim()}`);
});

testServer.stderr.on('data', (data) => {
  console.error(`   [Test Server Error] ${data.toString().trim()}`);
});

// Step 2: Start MCP server
let mcpServer;
let mcpReady = false;

setTimeout(() => {
  console.log('\n🤖 Step 2: Starting MCP server...');
  mcpServer = spawn('node', ['dist/index.js']);

  mcpServer.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('LLM Browser MCP Server running')) {
      mcpReady = true;
      console.log('   ✅ MCP server ready\n');
      runTests();
    }
  });

  mcpServer.stdout.on('data', (data) => {
    // Collect responses
    try {
      const response = JSON.parse(data.toString());
      handleMcpResponse(response);
    } catch (e) {
      // Might be partial JSON, ignore
    }
  });
}, 1000);

let currentTest = 0;
const responses = {};

function runTests() {
  console.log('🔬 Step 3: Running Learning Tests\n');

  // Test 1: Browse the page (should discover APIs)
  console.log('Test 1: Browse test page and discover APIs');
  sendMcpRequest('browse-test', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'browse',
      arguments: {
        url: TEST_URL,
        waitFor: 'networkidle',
        timeout: 10000
      }
    }
  });
}

function sendMcpRequest(testId, request) {
  responses[testId] = null;
  mcpServer.stdin.write(JSON.stringify(request) + '\n');
}

function handleMcpResponse(response) {
  console.log('\n📥 Received MCP Response');

  // Test 1 response: Browse result
  if (response.id === 1) {
    console.log('✅ Test 1 Complete: Browsing succeeded');

    if (response.result && response.result.content) {
      try {
        const result = JSON.parse(response.result.content[0].text);

        console.log(`\n📊 Browse Results:`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Title: ${result.title}`);
        console.log(`   Network requests captured: ${result.network.length}`);
        console.log(`   Console messages: ${result.console.length}`);
        console.log(`   APIs discovered: ${result.discoveredApis.length}`);

        console.log(`\n🔍 Discovered API Patterns:`);
        result.discoveredApis.forEach((api, idx) => {
          console.log(`   ${idx + 1}. ${api.method} ${api.endpoint}`);
          console.log(`      Confidence: ${api.confidence}`);
          console.log(`      Can bypass: ${api.canBypass}`);
          console.log(`      Reason: ${api.reason || 'N/A'}`);
        });

        responses.browse = result;

        // Test 2: Check knowledge base stats
        setTimeout(() => {
          console.log('\n\nTest 2: Check knowledge base stats');
          sendMcpRequest('stats-test', {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'get_knowledge_stats',
              arguments: {}
            }
          });
        }, 500);

      } catch (e) {
        console.error('❌ Failed to parse browse result:', e.message);
      }
    }
  }

  // Test 2 response: Knowledge stats
  if (response.id === 2) {
    console.log('✅ Test 2 Complete: Knowledge stats retrieved');

    try {
      const stats = JSON.parse(response.result.content[0].text);

      console.log(`\n📚 Knowledge Base Stats:`);
      console.log(`   Total domains: ${stats.totalDomains}`);
      console.log(`   Total patterns: ${stats.totalPatterns}`);
      console.log(`   Can bypass rendering: ${stats.bypassCapable}`);
      console.log(`   Top domains: ${JSON.stringify(stats.topDomains)}`);

      responses.stats = stats;

      // Test 3: Get learned patterns for localhost
      setTimeout(() => {
        console.log('\n\nTest 3: Get learned patterns for localhost');
        sendMcpRequest('patterns-test', {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'get_learned_patterns',
            arguments: {
              domain: 'localhost'
            }
          }
        });
      }, 500);

    } catch (e) {
      console.error('❌ Failed to parse stats:', e.message);
    }
  }

  // Test 3 response: Learned patterns
  if (response.id === 3) {
    console.log('✅ Test 3 Complete: Learned patterns retrieved');

    try {
      const data = JSON.parse(response.result.content[0].text);

      console.log(`\n🧠 Learned Patterns for ${data.domain}:`);
      if (data.patterns && data.patterns.length > 0) {
        data.patterns.forEach((pattern, idx) => {
          console.log(`   ${idx + 1}. ${pattern.method} ${pattern.endpoint}`);
          console.log(`      Confidence: ${pattern.confidence}`);
          console.log(`      Can bypass: ${pattern.canBypass}`);
        });
      } else {
        console.log('   No patterns found for this domain');
      }

      responses.patterns = data;

      // Test 4: Try direct API call
      if (data.patterns && data.patterns.length > 0) {
        const apiPattern = data.patterns.find(p => p.endpoint.includes('/api/products') && !p.endpoint.includes('{'));

        if (apiPattern) {
          setTimeout(() => {
            console.log('\n\nTest 4: Execute direct API call (bypass browser)');
            console.log(`   Using discovered endpoint: ${apiPattern.endpoint}`);

            sendMcpRequest('api-call-test', {
              jsonrpc: '2.0',
              id: 4,
              method: 'tools/call',
              params: {
                name: 'execute_api_call',
                arguments: {
                  url: `${TEST_URL}${apiPattern.endpoint}`,
                  method: 'GET'
                }
              }
            });
          }, 500);
        } else {
          console.log('\n⚠️  No suitable API pattern found for direct call test');
          finishTests();
        }
      } else {
        finishTests();
      }

    } catch (e) {
      console.error('❌ Failed to parse patterns:', e.message);
      finishTests();
    }
  }

  // Test 4 response: Direct API call
  if (response.id === 4) {
    console.log('✅ Test 4 Complete: Direct API call executed');

    try {
      const result = JSON.parse(response.result.content[0].text);

      console.log(`\n⚡ Direct API Call Results:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Response: ${JSON.stringify(result.body, null, 2)}`);

      responses.apiCall = result;

    } catch (e) {
      console.error('❌ Failed to parse API call result:', e.message);
    }

    finishTests();
  }
}

function finishTests() {
  setTimeout(() => {
    console.log('\n\n' + '='.repeat(60));
    console.log('🎯 TEST SUMMARY');
    console.log('='.repeat(60));

    console.log('\n✅ Learning Component Tests:');
    console.log(`   ${responses.browse ? '✅' : '❌'} Browse page and capture network traffic`);
    console.log(`   ${responses.browse?.discoveredApis?.length > 0 ? '✅' : '❌'} Discover API patterns`);
    console.log(`   ${responses.stats ? '✅' : '❌'} Store patterns in knowledge base`);
    console.log(`   ${responses.patterns ? '✅' : '❌'} Retrieve learned patterns`);
    console.log(`   ${responses.apiCall ? '✅' : '❌'} Execute direct API calls`);

    if (responses.browse?.discoveredApis?.length > 0) {
      console.log(`\n📈 Learning Metrics:`);
      console.log(`   APIs discovered: ${responses.browse.discoveredApis.length}`);
      console.log(`   High confidence: ${responses.browse.discoveredApis.filter(a => a.confidence === 'high').length}`);
      console.log(`   Can bypass browser: ${responses.browse.discoveredApis.filter(a => a.canBypass).length}`);
    }

    console.log('\n💾 Persistence Check:');
    if (existsSync('./knowledge-base.json')) {
      const kb = JSON.parse(readFileSync('./knowledge-base.json', 'utf8'));
      console.log(`   ✅ Knowledge base file created`);
      console.log(`   ✅ Contains ${Object.keys(kb).length} domain(s)`);
      console.log(`   ✅ File size: ${JSON.stringify(kb).length} bytes`);
    } else {
      console.log(`   ❌ Knowledge base file not found`);
    }

    const allTestsPassed =
      responses.browse &&
      responses.browse.discoveredApis?.length > 0 &&
      responses.stats &&
      responses.patterns;

    console.log('\n' + '='.repeat(60));
    if (allTestsPassed) {
      console.log('🎉 ALL TESTS PASSED! Learning component is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Review the output above.');
    }
    console.log('='.repeat(60) + '\n');

    // Cleanup
    mcpServer.kill();
    testServer.kill();
    process.exit(allTestsPassed ? 0 : 1);
  }, 1000);
}

// Timeout safety
setTimeout(() => {
  console.error('\n❌ Tests timed out after 30 seconds');
  mcpServer?.kill();
  testServer?.kill();
  process.exit(1);
}, 30000);
