/**
 * WebSocket Integration Tests (FEAT-003)
 *
 * Tests the integration of WebSocket pattern learning, capture, and replay.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartBrowser } from '../../src/core/smart-browser.js';
import { LearningEngine } from '../../src/core/learning-engine.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import { SessionManager } from '../../src/core/session-manager.js';
import type { WebSocketConnection, WebSocketPattern, WebSocketReplayOptions } from '../../src/types/websocket-patterns.js';

describe('FEAT-003: WebSocket Integration', () => {
  let smartBrowser: SmartBrowser;
  let learningEngine: LearningEngine;

  beforeEach(async () => {
    const browserManager = new BrowserManager();
    const contentExtractor = new ContentExtractor();
    const apiAnalyzer = new ApiAnalyzer();
    const sessionManager = new SessionManager();
    learningEngine = new LearningEngine();

    smartBrowser = new SmartBrowser(
      browserManager,
      contentExtractor,
      apiAnalyzer,
      sessionManager,
      learningEngine
    );

    await smartBrowser.initialize();
  });

  describe('WebSocket Pattern Learning', () => {
    it('should learn WebSocket patterns from captured connections', () => {
      const domain = 'chat.example.com';
      const connection: WebSocketConnection = {
        url: 'wss://chat.example.com/socket',
        protocol: 'websocket',
        connectedAt: Date.now() - 5000,
        closedAt: Date.now(),
        headers: {},
        messages: [
          {
            direction: 'send',
            data: { type: 'subscribe', channel: 'general' },
            rawData: JSON.stringify({ type: 'subscribe', channel: 'general' }),
            timestamp: Date.now() - 4000,
            type: 'json',
          },
          {
            direction: 'receive',
            data: { type: 'message', content: 'Hello' },
            rawData: JSON.stringify({ type: 'message', content: 'Hello' }),
            timestamp: Date.now() - 3000,
            type: 'json',
          },
        ],
      };

      learningEngine.learnWebSocketPattern(connection, domain);

      const patterns = learningEngine.getWebSocketPatterns(domain);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].domain).toBe(domain);
      expect(patterns[0].protocol).toBe('websocket');
    });

    it('should learn Socket.IO patterns', () => {
      const domain = 'realtime.example.com';
      const connection: WebSocketConnection = {
        url: 'wss://realtime.example.com/socket.io/?transport=websocket',
        protocol: 'socket.io',
        connectedAt: Date.now() - 5000,
        closedAt: Date.now(),
        headers: {},
        namespace: '/chat',
        transport: 'websocket',
        messages: [
          {
            direction: 'send',
            data: '40/chat,',
            rawData: '40/chat,',
            timestamp: Date.now() - 4000,
            type: 'text',
          },
        ],
      };

      learningEngine.learnWebSocketPattern(connection, domain);

      const patterns = learningEngine.getWebSocketPatterns(domain);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].protocol).toBe('socket.io');
    });

    it('should calculate pattern confidence correctly', () => {
      const domain = 'api.example.com';

      // Low confidence: few messages, short connection
      const lowConfConnection: WebSocketConnection = {
        url: 'wss://api.example.com/ws',
        protocol: 'websocket',
        connectedAt: Date.now() - 1000,
        closedAt: Date.now(),
        headers: {},
        messages: [{
          direction: 'receive',
          data: 'pong',
          rawData: 'pong',
          timestamp: Date.now(),
          type: 'text',
        }],
      };

      learningEngine.learnWebSocketPattern(lowConfConnection, domain);
      const patterns = learningEngine.getWebSocketPatterns(domain);
      expect(patterns[0].confidence).toBe('low');
    });
  });

  describe('WebSocket Pattern Replay', () => {
    it('should handle replay of unavailable patterns gracefully', async () => {
      const mockPattern: WebSocketPattern = {
        id: 'test-pattern',
        domain: 'test.example.com',
        endpoint: '/socket',
        urlPattern: 'wss://test.example.com/socket',
        protocol: 'websocket',
        confidence: 'low',
        canReplay: false, // Cannot replay
        connectionHeaders: {},
        messagePatterns: [],
        createdAt: Date.now(),
        lastVerified: Date.now(),
        verificationCount: 0,
        failureCount: 0,
        provenance: {
          source: 'api_extraction',
          learnedAt: Date.now(),
          verificationCount: 0,
        },
      };

      const options: WebSocketReplayOptions = {
        pattern: mockPattern,
        auth: {},
        duration: 1000,
        captureMessages: true,
      };

      const result = await smartBrowser.replayWebSocket(options);

      expect(result.connected).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0].type).toBe('pattern_not_replayable');
    });
  });

  describe('Pattern Health Tracking', () => {
    it('should track WebSocket pattern verification', () => {
      const domain = 'tracking.example.com';
      const endpoint = '/ws';
      const protocol = 'websocket';

      // First, learn a pattern
      const connection: WebSocketConnection = {
        url: `wss://${domain}${endpoint}`,
        protocol: 'websocket',
        connectedAt: Date.now() - 10000,
        closedAt: Date.now(),
        headers: {},
        messages: Array(15).fill(null).map((_, i) => ({
          direction: i % 2 === 0 ? 'send' : 'receive',
          data: { seq: i },
          rawData: JSON.stringify({ seq: i }),
          timestamp: Date.now() - (10000 - i * 100),
          type: 'json' as const,
        })),
      };

      learningEngine.learnWebSocketPattern(connection, domain);

      // Verify the pattern
      learningEngine.verifyWebSocketPattern(domain, endpoint, protocol);

      const patterns = learningEngine.getWebSocketPatterns(domain);
      expect(patterns[0].verificationCount).toBeGreaterThan(1);
    });

    it('should record WebSocket pattern failures', () => {
      const domain = 'failing.example.com';
      const endpoint = '/ws';
      const protocol = 'websocket';

      // First, learn a pattern
      const connection: WebSocketConnection = {
        url: `wss://${domain}${endpoint}`,
        protocol: 'websocket',
        connectedAt: Date.now() - 10000,
        closedAt: Date.now(),
        headers: {},
        messages: Array(15).fill(null).map((_, i) => ({
          direction: 'receive',
          data: { i },
          rawData: JSON.stringify({ i }),
          timestamp: Date.now() - (10000 - i * 100),
          type: 'json' as const,
        })),
      };

      learningEngine.learnWebSocketPattern(connection, domain);

      // Record a failure
      learningEngine.recordWebSocketPatternFailure(domain, endpoint, protocol, {
        type: 'server_error',
        errorMessage: 'Connection refused',
        recoveryAttempted: false,
      });

      const patterns = learningEngine.getWebSocketPatterns(domain);
      expect(patterns[0].failureCount).toBeGreaterThan(0);
    });
  });

  describe('Intelligence Tier WebSocket Detection', () => {
    it('should detect available WebSocket patterns', () => {
      const domain = 'intelligent.example.com';

      // Learn a pattern
      const connection: WebSocketConnection = {
        url: `wss://${domain}/live`,
        protocol: 'websocket',
        connectedAt: Date.now() - 10000,
        closedAt: Date.now(),
        headers: {},
        messages: Array(20).fill(null).map((_, i) => ({
          direction: i % 2 === 0 ? 'send' : 'receive',
          data: { tick: i },
          rawData: JSON.stringify({ tick: i }),
          timestamp: Date.now() - (10000 - i * 100),
          type: 'json' as const,
        })),
      };

      learningEngine.learnWebSocketPattern(connection, domain);

      const patterns = learningEngine.getWebSocketPatterns(domain);
      expect(patterns.length).toBeGreaterThan(0);

      const replayablePatterns = patterns.filter(p => p.canReplay);
      expect(replayablePatterns.length).toBeGreaterThan(0);
    });
  });
});
