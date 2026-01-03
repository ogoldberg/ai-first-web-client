/**
 * MessageBus - Cross-origin postMessage communication
 *
 * Handles secure message passing between the SDK and
 * fetcher iframes/popups.
 */

import type { ConnectMessage } from '../types.js';

interface MessageBusConfig {
  debug?: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class MessageBus {
  private config: MessageBusConfig;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  constructor(config: MessageBusConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize the message bus
   */
  init(): void {
    if (this.messageHandler) return;

    this.messageHandler = (event: MessageEvent) => {
      // Only process messages with our signature
      if (!event.data || typeof event.data !== 'object') return;
      if (!event.data.type?.startsWith('CONNECT_')) return;

      this.handleMessage(event.data as ConnectMessage, event.origin);
    };

    window.addEventListener('message', this.messageHandler);
    this.log('Message bus initialized');
  }

  /**
   * Send a message to a target window and wait for response
   */
  async sendAndWait<T>(
    target: Window,
    type: ConnectMessage['type'],
    payload: unknown,
    timeoutMs = 30000
  ): Promise<T> {
    const id = this.generateId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Message timeout: ${type}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const message: ConnectMessage = { type, id, payload };
      target.postMessage(message, '*');

      this.log('Sent message:', type, id);
    });
  }

  /**
   * Send a message without waiting for response
   */
  send(target: Window, type: ConnectMessage['type'], payload: unknown, id?: string): void {
    const message: ConnectMessage = {
      type,
      id: id || this.generateId(),
      payload,
    };
    target.postMessage(message, '*');
    this.log('Sent message (no wait):', type);
  }

  /**
   * Subscribe to messages of a specific type
   */
  on(type: string, callback: (payload: unknown) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // Clear all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('MessageBus destroyed'));
    }
    this.pendingRequests.clear();
    this.listeners.clear();

    this.log('Message bus destroyed');
  }

  private handleMessage(message: ConnectMessage, origin: string): void {
    this.log('Received message:', message.type, message.id, 'from', origin);

    // Check if this is a response to a pending request
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);

      if (message.type === 'CONNECT_ERROR') {
        pending.reject(new Error((message.payload as { message?: string })?.message || 'Unknown error'));
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    // Notify listeners
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(message.payload);
        } catch (err) {
          this.log('Listener error:', err);
        }
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[MessageBus]', ...args);
    }
  }
}
