/**
 * WebSocket Pattern Learner (FEAT-003)
 *
 * Learns WebSocket, Socket.IO, and SSE patterns from captured connections.
 * Extracts reusable patterns for direct WebSocket replay without browser rendering.
 */

import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import type {
  WebSocketConnection,
  WebSocketPattern,
  WebSocketMessagePattern,
  WebSocketMessage,
  WebSocketProtocol,
} from '../types/websocket-patterns.js';
import { createProvenance } from '../types/provenance.js';

const log = logger.create('WebSocketPatternLearner');

/**
 * Learn WebSocket patterns from captured connections
 */
export class WebSocketPatternLearner {
  /**
   * Learn patterns from a captured WebSocket connection
   */
  learnFromConnection(
    connection: WebSocketConnection,
    domain: string
  ): WebSocketPattern | null {
    try {
      // Extract endpoint from URL
      const url = new URL(connection.url);
      const endpoint = url.pathname + (url.search || '');

      // Detect protocol
      const protocol = this.detectProtocol(connection);

      // Learn message patterns
      const messagePatterns = this.learnMessagePatterns(connection.messages);

      // Determine confidence based on message count and success
      const confidence = this.determineConfidence(connection);

      // Detect authentication requirements
      const authInfo = this.detectAuthRequirements(connection);

      // Create pattern
      const pattern: WebSocketPattern = {
        id: this.generatePatternId(domain, endpoint, protocol),
        domain,
        endpoint,
        urlPattern: this.createUrlPattern(connection.url),
        protocol,
        confidence,
        canReplay: this.canReplay(connection, messagePatterns),
        connectionHeaders: this.extractRelevantHeaders(connection.headers),
        socketIOConfig: this.extractSocketIOConfig(connection),
        messagePatterns,
        authRequired: authInfo.required,
        authMethod: authInfo.method,
        authParam: authInfo.param,
        createdAt: Date.now(),
        lastVerified: Date.now(),
        verificationCount: 1,
        failureCount: 0,
        provenance: createProvenance('api_extraction', {
          sourceUrl: connection.url,
          sourceDomain: domain,
        }),
      };

      log.info('Learned WebSocket pattern', {
        domain,
        endpoint,
        protocol,
        confidence,
        messageCount: messagePatterns.length,
      });

      return pattern;
    } catch (error) {
      log.error('Failed to learn WebSocket pattern', { error, domain });
      return null;
    }
  }

  /**
   * Detect WebSocket protocol type
   */
  private detectProtocol(connection: WebSocketConnection): WebSocketProtocol {
    // Already detected during capture
    if (connection.protocol) {
      return connection.protocol;
    }

    // Fallback detection from URL
    const url = connection.url.toLowerCase();

    if (url.includes('socket.io') || connection.namespace !== undefined) {
      return 'socket.io';
    }

    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return 'websocket';
    }

    // Check for SSE-like patterns
    if (connection.messages.some(m => m.type === 'event')) {
      return 'sse';
    }

    return 'websocket'; // Default
  }

  /**
   * Learn message patterns from captured messages
   */
  private learnMessagePatterns(messages: WebSocketMessage[]): WebSocketMessagePattern[] {
    const patterns: Map<string, WebSocketMessagePattern> = new Map();

    // Group messages by type/event
    for (const message of messages) {
      const key = this.getMessageKey(message);

      let pattern = patterns.get(key);
      if (!pattern) {
        pattern = {
          direction: message.direction,
          type: message.type,
          event: message.event,
          schema: this.extractSchema(message.data),
          example: message.data,
          frequency: 0,
          isHandshake: this.isHandshakeMessage(message),
          isHeartbeat: this.isHeartbeatMessage(message),
        };
        patterns.set(key, pattern);
      }

      pattern.frequency++;
    }

    // Calculate average intervals
    const messagesByKey = new Map<string, WebSocketMessage[]>();
    for (const message of messages) {
      const key = this.getMessageKey(message);
      if (!messagesByKey.has(key)) {
        messagesByKey.set(key, []);
      }
      messagesByKey.get(key)!.push(message);
    }

    for (const [key, pattern] of patterns.entries()) {
      const msgs = messagesByKey.get(key) || [];
      if (msgs.length > 1) {
        const intervals: number[] = [];
        for (let i = 1; i < msgs.length; i++) {
          intervals.push(msgs[i].timestamp - msgs[i - 1].timestamp);
        }
        pattern.averageInterval =
          intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      }
    }

    return Array.from(patterns.values());
  }

  /**
   * Get unique key for message grouping
   */
  private getMessageKey(message: WebSocketMessage): string {
    const parts = [
      message.direction,
      message.type || 'unknown',
      message.event || '',
    ];
    return parts.join(':');
  }

  /**
   * Extract JSON schema from message data
   */
  private extractSchema(data: unknown): Record<string, unknown> | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {},
    };

    const properties: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null) {
        properties[key] = { type: 'null' };
      } else if (Array.isArray(value)) {
        properties[key] = {
          type: 'array',
          items: value.length > 0 ? this.extractSchema(value[0]) : {},
        };
      } else if (typeof value === 'object') {
        properties[key] = this.extractSchema(value);
      } else {
        properties[key] = { type: typeof value };
      }
    }

    schema.properties = properties;
    return schema;
  }

  /**
   * Check if message is likely a handshake
   */
  private isHandshakeMessage(message: WebSocketMessage): boolean {
    if (message.type === 'open' || message.type === 'connect') {
      return true;
    }

    if (message.event === 'connect' || message.event === 'connected') {
      return true;
    }

    // Check for common handshake patterns in data
    if (typeof message.data === 'object' && message.data !== null) {
      const data = message.data as Record<string, unknown>;
      if (data.type === 'handshake' || data.event === 'connect') {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if message is likely a heartbeat/ping
   */
  private isHeartbeatMessage(message: WebSocketMessage): boolean {
    if (message.type === 'ping' || message.type === 'pong') {
      return true;
    }

    if (message.event === 'ping' || message.event === 'pong' || message.event === 'heartbeat') {
      return true;
    }

    // Check for common heartbeat patterns
    if (typeof message.data === 'string') {
      const lower = message.data.toLowerCase();
      if (lower === 'ping' || lower === 'pong' || lower === 'heartbeat') {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine confidence level for pattern
   */
  private determineConfidence(connection: WebSocketConnection): 'low' | 'medium' | 'high' {
    const messageCount = connection.messages.length;
    const duration = connection.closedAt
      ? connection.closedAt - connection.connectedAt
      : Date.now() - connection.connectedAt;

    // High confidence: many messages, stable connection
    if (messageCount >= 10 && duration > 5000) {
      return 'high';
    }

    // Medium confidence: some messages
    if (messageCount >= 3) {
      return 'medium';
    }

    // Low confidence: few messages or very short connection
    return 'low';
  }

  /**
   * Check if pattern can be replayed directly
   */
  private canReplay(
    connection: WebSocketConnection,
    messagePatterns: WebSocketMessagePattern[]
  ): boolean {
    // Need at least some messages to replay
    if (messagePatterns.length === 0) {
      return false;
    }

    // Need stable connection (lasted more than 1 second)
    const duration = connection.closedAt
      ? connection.closedAt - connection.connectedAt
      : 1000;
    if (duration < 1000) {
      return false;
    }

    // Socket.IO is generally replayable
    if (connection.protocol === 'socket.io') {
      return true;
    }

    // Plain WebSocket with clear message patterns is replayable
    if (connection.protocol === 'websocket' && messagePatterns.length > 0) {
      return true;
    }

    // SSE is always replayable (it's just listening)
    if (connection.protocol === 'sse') {
      return true;
    }

    return false;
  }

  /**
   * Extract relevant headers for replay
   */
  private extractRelevantHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) {
      return undefined;
    }

    const relevant: Record<string, string> = {};
    const relevantKeys = [
      'sec-websocket-protocol',
      'sec-websocket-extensions',
      'origin',
      'user-agent',
    ];

    for (const key of relevantKeys) {
      const lowerKey = key.toLowerCase();
      for (const [headerKey, headerValue] of Object.entries(headers)) {
        if (headerKey.toLowerCase() === lowerKey) {
          relevant[key] = headerValue;
        }
      }
    }

    return Object.keys(relevant).length > 0 ? relevant : undefined;
  }

  /**
   * Extract Socket.IO configuration
   */
  private extractSocketIOConfig(connection: WebSocketConnection): WebSocketPattern['socketIOConfig'] {
    if (connection.protocol !== 'socket.io') {
      return undefined;
    }

    const url = new URL(connection.url);

    return {
      namespace: connection.namespace || '/',
      path: url.pathname.includes('/socket.io') ? url.pathname.split('/socket.io')[0] + '/socket.io' : '/socket.io',
      transports: connection.transport ? [connection.transport] : ['websocket', 'polling'],
    };
  }

  /**
   * Detect authentication requirements
   */
  private detectAuthRequirements(connection: WebSocketConnection): {
    required: boolean;
    method?: 'cookie' | 'token' | 'query' | 'header';
    param?: string;
  } {
    const url = new URL(connection.url);
    const headers = connection.headers || {};

    // Check for token in query params
    if (url.searchParams.has('token') || url.searchParams.has('auth')) {
      return {
        required: true,
        method: 'query',
        param: url.searchParams.has('token') ? 'token' : 'auth',
      };
    }

    // Check for authorization header
    if (headers['authorization'] || headers['Authorization']) {
      return {
        required: true,
        method: 'header',
        param: 'authorization',
      };
    }

    // Check for cookie header
    if (headers['cookie'] || headers['Cookie']) {
      return {
        required: true,
        method: 'cookie',
      };
    }

    // Check messages for auth patterns
    const hasAuthMessage = connection.messages.some(msg => {
      if (typeof msg.data === 'object' && msg.data !== null) {
        const data = msg.data as Record<string, unknown>;
        return data.token !== undefined || data.auth !== undefined || data.authorization !== undefined;
      }
      return false;
    });

    if (hasAuthMessage) {
      return {
        required: true,
        method: 'token',
        param: 'token',
      };
    }

    return { required: false };
  }

  /**
   * Create URL pattern from concrete URL
   */
  private createUrlPattern(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove auth tokens from query params for pattern
      const cleanParams = new URLSearchParams();
      for (const [key, value] of parsed.searchParams.entries()) {
        if (!this.isAuthParam(key)) {
          cleanParams.set(key, value);
        }
      }

      let pattern = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      const params = cleanParams.toString();
      if (params) {
        pattern += `?${params}`;
      }

      return pattern;
    } catch {
      return url;
    }
  }

  /**
   * Check if query param is likely auth-related
   */
  private isAuthParam(key: string): boolean {
    const authParams = ['token', 'auth', 'authorization', 'access_token', 'api_key', 'apikey'];
    return authParams.includes(key.toLowerCase());
  }

  /**
   * Generate unique pattern ID
   */
  private generatePatternId(domain: string, endpoint: string, protocol: WebSocketProtocol): string {
    const data = `${domain}:${endpoint}:${protocol}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}
