/**
 * WebSocket Client (FEAT-003)
 *
 * Direct WebSocket connection for replaying learned patterns without browser.
 * Supports plain WebSocket, Socket.IO, and SSE.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type {
  WebSocketPattern,
  WebSocketReplayOptions,
  WebSocketReplayResult,
  WebSocketMessage,
  WebSocketMessageDirection,
} from '../types/websocket-patterns.js';

const log = logger.create('WebSocketClient');

/**
 * WebSocket client for direct connection replay
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messages: WebSocketMessage[] = [];
  private errors: Array<{ type: string; message: string; timestamp: number }> = [];
  private connectedAt: number = 0;
  private closedAt: number = 0;

  /**
   * Connect to WebSocket using learned pattern
   */
  async connect(
    options: WebSocketReplayOptions
  ): Promise<WebSocketReplayResult> {
    const { pattern, auth, duration = 5000 } = options;

    try {
      // Build connection URL
      const url = this.buildConnectionUrl(pattern, auth);

      // Build connection headers
      const headers = this.buildConnectionHeaders(pattern, auth);

      log.info('Connecting to WebSocket', {
        url: url.replace(/token=[^&]+/, 'token=***'),
        protocol: pattern.protocol,
      });

      this.connectedAt = Date.now();

      // Handle Socket.IO differently
      if (pattern.protocol === 'socket.io') {
        return await this.connectSocketIO(url, pattern, options);
      }

      // Plain WebSocket connection
      return await this.connectPlainWebSocket(url, headers, pattern, options);
    } catch (error) {
      log.error('WebSocket connection failed', { error, pattern: pattern.id });

      this.closedAt = Date.now();
      this.errors.push({
        type: 'connection_error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });

      return this.buildResult(false, pattern, duration);
    }
  }

  /**
   * Connect using plain WebSocket
   */
  private async connectPlainWebSocket(
    url: string,
    headers: Record<string, string>,
    pattern: WebSocketPattern,
    options: WebSocketReplayOptions
  ): Promise<WebSocketReplayResult> {
    return new Promise((resolve) => {
      const duration = options.duration || 5000;

      this.ws = new WebSocket(url, {
        headers,
        handshakeTimeout: 5000,
      });

      this.ws.on('open', () => {
        log.info('WebSocket connected', { url: pattern.urlPattern });

        // Send initial messages if provided
        if (options.initialMessages) {
          for (const message of options.initialMessages) {
            this.send(message);
          }
        } else {
          // Send handshake messages from pattern
          const handshakes = pattern.messagePatterns.filter(
            p => p.isHandshake && p.direction === 'send'
          );
          for (const handshake of handshakes) {
            if (handshake.example) {
              this.send(handshake.example);
            }
          }
        }

        // Close after duration
        setTimeout(() => {
          this.close();
          resolve(this.buildResult(true, pattern, duration));
        }, duration);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data, 'receive', options);
      });

      this.ws.on('error', (error: Error) => {
        log.error('WebSocket error', { error });
        this.errors.push({
          type: 'websocket_error',
          message: error.message,
          timestamp: Date.now(),
        });
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        log.info('WebSocket closed', { code, reason: reason.toString() });
        this.closedAt = Date.now();

        if (code !== 1000 && code !== 1001) {
          this.errors.push({
            type: 'abnormal_close',
            message: `Close code ${code}: ${reason}`,
            timestamp: Date.now(),
          });
        }

        // Resolve if not already resolved
        if (this.closedAt - this.connectedAt < (options.duration || 5000)) {
          resolve(this.buildResult(true, pattern, duration));
        }
      });

      // Timeout fallback
      setTimeout(() => {
        if (!this.closedAt) {
          this.close();
          resolve(this.buildResult(false, pattern, duration));
        }
      }, duration + 1000);
    });
  }

  /**
   * Connect using Socket.IO (using WebSocket under the hood)
   */
  private async connectSocketIO(
    url: string,
    pattern: WebSocketPattern,
    options: WebSocketReplayOptions
  ): Promise<WebSocketReplayResult> {
    // Socket.IO connection is complex and requires the socket.io-client library
    // For now, we'll use a simplified WebSocket connection to Socket.IO's WebSocket transport
    log.info('Socket.IO connection - using WebSocket transport');

    const wsUrl = this.convertSocketIOToWebSocket(url, pattern);
    const headers = this.buildConnectionHeaders(pattern, options.auth);

    return await this.connectPlainWebSocket(wsUrl, headers, pattern, options);
  }

  /**
   * Convert Socket.IO URL to WebSocket URL
   */
  private convertSocketIOToWebSocket(url: string, pattern: WebSocketPattern): string {
    const parsed = new URL(url);

    // Socket.IO WebSocket endpoint
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = pattern.socketIOConfig?.path || '/socket.io';
    const namespace = pattern.socketIOConfig?.namespace || '/';

    // Build Socket.IO WebSocket URL
    let wsUrl = `${protocol}//${parsed.host}${path}/?EIO=4&transport=websocket`;

    // Add namespace if not root
    if (namespace !== '/') {
      wsUrl += `&namespace=${encodeURIComponent(namespace)}`;
    }

    // Copy query params (except transport)
    for (const [key, value] of parsed.searchParams.entries()) {
      if (key !== 'transport' && key !== 'EIO') {
        wsUrl += `&${key}=${encodeURIComponent(value)}`;
      }
    }

    return wsUrl;
  }

  /**
   * Build connection URL with auth
   */
  private buildConnectionUrl(
    pattern: WebSocketPattern,
    auth?: WebSocketReplayOptions['auth']
  ): string {
    let url = pattern.urlPattern;

    // Add auth token to query params if needed
    if (pattern.authRequired && pattern.authMethod === 'query' && auth?.token) {
      const parsed = new URL(url);
      parsed.searchParams.set(pattern.authParam || 'token', auth.token);
      url = parsed.toString();
    }

    return url;
  }

  /**
   * Build connection headers
   */
  private buildConnectionHeaders(
    pattern: WebSocketPattern,
    auth?: WebSocketReplayOptions['auth']
  ): Record<string, string> {
    const headers: Record<string, string> = {
      ...pattern.connectionHeaders,
    };

    // Add auth headers
    if (pattern.authRequired && auth) {
      if (pattern.authMethod === 'header' && auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      }

      if (pattern.authMethod === 'cookie' && auth.cookies) {
        headers['Cookie'] = auth.cookies
          .map(c => `${c.name}=${c.value}`)
          .join('; ');
      }

      if (auth.headers) {
        Object.assign(headers, auth.headers);
      }
    }

    return headers;
  }

  /**
   * Send message through WebSocket
   */
  private send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('WebSocket not open, cannot send message');
      return;
    }

    const message: WebSocketMessage = {
      direction: 'send',
      data,
      rawData: typeof data === 'string' ? data : JSON.stringify(data),
      timestamp: Date.now(),
    };

    this.messages.push(message);
    this.ws.send(message.rawData);

    log.debug('Sent WebSocket message', { data });
  }

  /**
   * Handle received message
   */
  private handleMessage(
    data: WebSocket.Data,
    direction: WebSocketMessageDirection,
    options: WebSocketReplayOptions
  ): void {
    let rawData: string;
    let parsedData: unknown;

    // Convert buffer to string
    if (Buffer.isBuffer(data)) {
      rawData = data.toString('utf8');
    } else if (Array.isArray(data)) {
      rawData = Buffer.concat(data).toString('utf8');
    } else {
      rawData = data.toString();
    }

    // Try to parse as JSON
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      parsedData = rawData;
    }

    const message: WebSocketMessage = {
      direction,
      data: parsedData,
      rawData,
      timestamp: Date.now(),
    };

    // Extract type/event from parsed data
    if (typeof parsedData === 'object' && parsedData !== null) {
      const obj = parsedData as Record<string, unknown>;
      if (typeof obj.type === 'string') {
        message.type = obj.type;
      }
      if (typeof obj.event === 'string') {
        message.event = obj.event;
      }
    }

    // Apply message filter if provided
    if (options.messageFilter && !options.messageFilter(message)) {
      return;
    }

    this.messages.push(message);

    log.debug('Received WebSocket message', {
      type: message.type,
      event: message.event,
      size: rawData.length,
    });

    this.emit('message', message);
  }

  /**
   * Close WebSocket connection
   */
  private close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (!this.closedAt) {
      this.closedAt = Date.now();
    }
  }

  /**
   * Build replay result
   */
  private buildResult(
    connected: boolean,
    pattern: WebSocketPattern,
    duration: number
  ): WebSocketReplayResult {
    return {
      connected,
      url: pattern.urlPattern,
      protocol: pattern.protocol,
      connectedAt: this.connectedAt,
      closedAt: this.closedAt || Date.now(),
      duration: (this.closedAt || Date.now()) - this.connectedAt,
      messages: this.messages,
      errors: this.errors.length > 0 ? this.errors : undefined,
      cleanClose: this.errors.length === 0 && this.closedAt > 0,
      closeCode: connected ? 1000 : undefined,
    };
  }
}
