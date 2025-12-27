/**
 * Example 15: WebSocket Pattern Learning and Replay (FEAT-003)
 *
 * Demonstrates WebSocket, Socket.IO, and SSE pattern discovery and direct replay.
 * This feature enables 10-20x speedup for real-time applications by bypassing
 * browser rendering after learning WebSocket patterns.
 *
 * Use cases:
 * - Chat applications
 * - Real-time dashboards
 * - Live sports scores
 * - Stock tickers
 * - Collaborative editing
 *
 * Run: node examples/15-websocket-patterns.mjs
 */

import { createLLMBrowser } from 'llm-browser/sdk';

async function main() {
  const browser = await createLLMBrowser();

  console.log('=== WebSocket Pattern Learning Examples ===\n');

  // Example 1: Discovering WebSocket Connections
  console.log('1. Discovering WebSocket Connections\n');

  try {
    // First visit with full browser - discovers WebSocket
    console.log('First visit: Using full browser to discover WebSocket...\n');

    const result = await browser.browse('https://example-chat.com', {
      captureNetwork: true, // Enable network capture
      waitForWebSocket: true, // Wait for WebSocket connections
    });

    if (result.websocketDiscovery?.connections.length > 0) {
      console.log(`✓ Discovered ${result.websocketDiscovery.connections.length} WebSocket connection(s):\n`);

      for (const conn of result.websocketDiscovery.connections) {
        console.log(`  URL: ${conn.url}`);
        console.log(`  Protocol: ${conn.protocol}`);
        console.log(`  Messages: ${conn.messages.length}`);
        console.log(`  Duration: ${(conn.closedAt || Date.now()) - conn.connectedAt}ms`);
        console.log();
      }

      // Pattern is automatically learned
      const learningEngine = browser.getLearningEngine();
      const patterns = learningEngine?.getWebSocketPatterns?.('example-chat.com');

      if (patterns && patterns.length > 0) {
        console.log('✓ Learned WebSocket pattern:');
        console.log(`  Confidence: ${patterns[0].confidence}`);
        console.log(`  Can Replay: ${patterns[0].canReplay}`);
        console.log(`  Message Patterns: ${patterns[0].messagePatterns.length}`);
      }
    } else {
      console.log('No WebSocket connections discovered (example site may not have WebSocket)');
    }
  } catch (error) {
    console.log('Example error:', error.message);
  }

  console.log('\n---\n');

  // Example 2: Direct WebSocket Replay
  console.log('2. Direct WebSocket Replay (No Browser!)\n');

  try {
    // Second visit - uses learned pattern with direct WebSocket connection
    console.log('Second visit: Using direct WebSocket connection...\n');

    const result = await browser.browse('https://example-chat.com', {
      preferredTier: 'intelligence', // Try intelligence tier first
    });

    if (result.tier === 'intelligence' && result.websocketReplay) {
      console.log('✓ Connected via direct WebSocket!');
      console.log(`  Connected: ${result.websocketReplay.connected}`);
      console.log(`  Duration: ${result.websocketReplay.duration}ms`);
      console.log(`  Messages Received: ${result.websocketReplay.messages.length}`);
      console.log(`  Speedup: ~15-20x faster than browser rendering\n`);

      // Show some messages
      if (result.websocketReplay.messages.length > 0) {
        console.log('Sample messages:');
        result.websocketReplay.messages.slice(0, 3).forEach((msg, i) => {
          console.log(`  ${i + 1}. [${msg.direction}] ${msg.type || 'message'}`);
          console.log(`     Data: ${JSON.stringify(msg.data).substring(0, 100)}...`);
        });
      }
    } else {
      console.log('Fell back to:', result.tier);
      console.log('(Pattern may not be learned yet or not confident enough)');
    }
  } catch (error) {
    console.log('Replay error:', error.message);
  }

  console.log('\n---\n');

  // Example 3: Socket.IO Pattern Learning
  console.log('3. Socket.IO Pattern Learning\n');

  try {
    console.log('Connecting to Socket.IO application...\n');

    const result = await browser.browse('https://example-socketio.com', {
      captureNetwork: true,
      waitForWebSocket: true,
    });

    if (result.websocketDiscovery) {
      const socketIOConns = result.websocketDiscovery.connections.filter(
        c => c.protocol === 'socket.io'
      );

      if (socketIOConns.length > 0) {
        console.log('✓ Discovered Socket.IO connection:');
        const conn = socketIOConns[0];
        console.log(`  Namespace: ${conn.namespace || '/'}`);
        console.log(`  Transport: ${conn.transport || 'websocket'}`);
        console.log(`  Messages: ${conn.messages.length}\n`);

        // Show event types
        const events = new Set(conn.messages.map(m => m.event).filter(Boolean));
        console.log(`  Events discovered: ${Array.from(events).join(', ')}`);
      }
    }
  } catch (error) {
    console.log('Socket.IO example error:', error.message);
  }

  console.log('\n---\n');

  // Example 4: Server-Sent Events (SSE)
  console.log('4. Server-Sent Events (SSE) Pattern\n');

  try {
    console.log('Connecting to SSE endpoint...\n');

    const result = await browser.browse('https://example-sse.com/events', {
      captureNetwork: true,
      waitForWebSocket: true, // Also waits for SSE
    });

    if (result.websocketDiscovery) {
      const sseConns = result.websocketDiscovery.connections.filter(
        c => c.protocol === 'sse'
      );

      if (sseConns.length > 0) {
        console.log('✓ Discovered SSE connection:');
        const conn = sseConns[0];
        console.log(`  URL: ${conn.url}`);
        console.log(`  Events received: ${conn.messages.length}\n`);

        // Show event data
        conn.messages.slice(0, 3).forEach((msg, i) => {
          console.log(`  Event ${i + 1}:`);
          console.log(`    Type: ${msg.event || 'message'}`);
          console.log(`    Data: ${JSON.stringify(msg.data).substring(0, 80)}...`);
        });
      }
    }
  } catch (error) {
    console.log('SSE example error:', error.message);
  }

  console.log('\n---\n');

  // Example 5: WebSocket Pattern Health
  console.log('5. WebSocket Pattern Health Monitoring\n');

  try {
    const learningEngine = browser.getLearningEngine();
    const patterns = learningEngine?.getWebSocketPatterns?.() || [];

    console.log(`Total WebSocket patterns learned: ${patterns.length}\n`);

    for (const pattern of patterns.slice(0, 3)) {
      const health = learningEngine?.getPatternHealth?.(pattern.domain, pattern.endpoint);

      console.log(`Pattern: ${pattern.domain}${pattern.endpoint}`);
      console.log(`  Protocol: ${pattern.protocol}`);
      console.log(`  Confidence: ${pattern.confidence}`);
      console.log(`  Verifications: ${pattern.verificationCount}`);
      console.log(`  Failures: ${pattern.failureCount}`);

      if (health) {
        console.log(`  Health: ${health.status}`);
        console.log(`  Success Rate: ${(health.currentSuccessRate * 100).toFixed(1)}%`);
      }

      console.log();
    }
  } catch (error) {
    console.log('Health monitoring error:', error.message);
  }

  console.log('\n---\n');

  // Example 6: Manual WebSocket Replay with Custom Messages
  console.log('6. Manual WebSocket Replay with Custom Messages\n');

  try {
    const learningEngine = browser.getLearningEngine();
    const patterns = learningEngine?.getWebSocketPatterns?.('example-chat.com');

    if (patterns && patterns.length > 0) {
      const pattern = patterns[0];

      console.log('Replaying WebSocket with custom messages...\n');

      const result = await browser.replayWebSocket({
        pattern,
        auth: {
          token: 'your-auth-token-here',
        },
        initialMessages: [
          { type: 'subscribe', channel: 'general' },
          { type: 'message', text: 'Hello from Unbrowser!' },
        ],
        duration: 3000, // Keep connection open for 3 seconds
        captureMessages: true,
      });

      if (result.connected) {
        console.log('✓ Custom replay successful:');
        console.log(`  Connected: ${result.connected}`);
        console.log(`  Duration: ${result.duration}ms`);
        console.log(`  Messages: ${result.messages.length}`);
        console.log(`  Sent: ${result.messages.filter(m => m.direction === 'send').length}`);
        console.log(`  Received: ${result.messages.filter(m => m.direction === 'receive').length}`);
      }
    } else {
      console.log('No WebSocket patterns available for replay');
    }
  } catch (error) {
    console.log('Manual replay error:', error.message);
  }

  console.log('\n---\n');

  // Example 7: Progressive Learning Improvement
  console.log('7. Progressive Learning & Improvement\n');

  console.log('How WebSocket learning improves over time:\n');
  console.log('Visit 1: Full browser render + WebSocket capture (~2-5s)');
  console.log('         - Discovers WebSocket endpoint');
  console.log('         - Captures message patterns');
  console.log('         - Learns authentication requirements\n');

  console.log('Visit 2: Direct WebSocket connection (~100-200ms)');
  console.log('         - 10-20x faster');
  console.log('         - No browser overhead');
  console.log('         - Direct protocol connection\n');

  console.log('Visit 3+: Optimized with learned patterns (~50-100ms)');
  console.log('         - Skips handshake learning');
  console.log('         - Applies message filters');
  console.log('         - Predictive message handling\n');

  console.log('=== WebSocket Pattern Learning Complete ===\n');

  console.log('Key Takeaways:');
  console.log('  ✓ Automatic WebSocket/Socket.IO/SSE discovery');
  console.log('  ✓ Message pattern learning');
  console.log('  ✓ Direct replay without browser (10-20x faster)');
  console.log('  ✓ Health monitoring for reliability');
  console.log('  ✓ Progressive optimization over time');
  console.log('  ✓ Supports authentication and custom messages');
}

main().catch(console.error);
