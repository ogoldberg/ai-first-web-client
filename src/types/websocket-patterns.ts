/**
 * WebSocket Pattern Types (FEAT-003)
 *
 * Types for WebSocket, Socket.IO, and SSE pattern learning and replay.
 */

import type { ProvenanceMetadata } from './provenance.js';

/**
 * WebSocket protocol type
 */
export type WebSocketProtocol = 'websocket' | 'socket.io' | 'sse';

/**
 * WebSocket message direction
 */
export type WebSocketMessageDirection = 'send' | 'receive';

/**
 * WebSocket message captured during browsing
 */
export interface WebSocketMessage {
  /** Message direction */
  direction: WebSocketMessageDirection;
  /** Message data (parsed if JSON) */
  data: unknown;
  /** Raw message data */
  rawData: string;
  /** Timestamp when message was sent/received */
  timestamp: number;
  /** Message type (if Socket.IO or structured message) */
  type?: string;
  /** Event name (if Socket.IO) */
  event?: string;
}

/**
 * WebSocket connection captured during browsing
 */
export interface WebSocketConnection {
  /** WebSocket URL */
  url: string;
  /** Protocol detected (websocket, socket.io, sse) */
  protocol: WebSocketProtocol;
  /** When connection was established */
  connectedAt: number;
  /** When connection was closed (if closed) */
  closedAt?: number;
  /** Connection headers */
  headers?: Record<string, string>;
  /** Messages exchanged on this connection */
  messages: WebSocketMessage[];
  /** Socket.IO namespace (if socket.io) */
  namespace?: string;
  /** Socket.IO transport method (if socket.io) */
  transport?: 'polling' | 'websocket';
}

/**
 * Learned WebSocket pattern
 */
export interface WebSocketPattern {
  /** Pattern ID */
  id: string;
  /** Domain this pattern applies to */
  domain: string;
  /** WebSocket endpoint pattern */
  endpoint: string;
  /** Full WebSocket URL pattern */
  urlPattern: string;
  /** Protocol type */
  protocol: WebSocketProtocol;
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
  /** Whether this pattern can be used for direct connection */
  canReplay: boolean;

  /** Expected connection headers */
  connectionHeaders?: Record<string, string>;
  /** Socket.IO specific config */
  socketIOConfig?: {
    namespace?: string;
    path?: string;
    transports?: Array<'polling' | 'websocket'>;
  };

  /** Learned message patterns */
  messagePatterns: WebSocketMessagePattern[];

  /** Authentication requirements */
  authRequired?: boolean;
  /** Auth method (cookie, token, query param) */
  authMethod?: 'cookie' | 'token' | 'query' | 'header';
  /** Auth parameter name */
  authParam?: string;

  /** When pattern was created */
  createdAt: number;
  /** When pattern was last verified */
  lastVerified: number;
  /** Number of times pattern was verified */
  verificationCount: number;
  /** Number of times pattern failed */
  failureCount: number;
  /** Last failure context (if any) */
  lastFailure?: {
    type: string;
    errorMessage?: string;
    timestamp: number;
  };

  /** Pattern provenance (FEAT-003) */
  provenance?: ProvenanceMetadata;
}

/**
 * Learned message pattern for WebSocket
 */
export interface WebSocketMessagePattern {
  /** Message direction */
  direction: WebSocketMessageDirection;
  /** Message type/event (if applicable) */
  type?: string;
  /** Event name (for Socket.IO) */
  event?: string;
  /** Message schema (JSON Schema) */
  schema?: Record<string, unknown>;
  /** Example message data */
  example?: unknown;
  /** How often this message was seen */
  frequency: number;
  /** Average time between messages (ms) */
  averageInterval?: number;
  /** Whether this is an initial handshake message */
  isHandshake?: boolean;
  /** Whether this is a heartbeat/ping message */
  isHeartbeat?: boolean;
}

/**
 * Options for WebSocket replay
 */
export interface WebSocketReplayOptions {
  /** WebSocket pattern to use */
  pattern: WebSocketPattern;
  /** Authentication data */
  auth?: {
    cookies?: Array<{ name: string; value: string; domain: string }>;
    token?: string;
    headers?: Record<string, string>;
  };
  /** Messages to send after connection */
  initialMessages?: unknown[];
  /** How long to keep connection open (ms) */
  duration?: number;
  /** Whether to capture all messages */
  captureMessages?: boolean;
  /** Message filter (return true to capture) */
  messageFilter?: (message: WebSocketMessage) => boolean;
}

/**
 * Result of WebSocket replay
 */
export interface WebSocketReplayResult {
  /** Whether connection was successful */
  connected: boolean;
  /** Connection URL used */
  url: string;
  /** Protocol used */
  protocol: WebSocketProtocol;
  /** When connection started */
  connectedAt: number;
  /** When connection ended */
  closedAt: number;
  /** Duration of connection (ms) */
  duration: number;
  /** Messages received */
  messages: WebSocketMessage[];
  /** Connection errors (if any) */
  errors?: Array<{
    type: string;
    message: string;
    timestamp: number;
  }>;
  /** Whether connection closed cleanly */
  cleanClose: boolean;
  /** Close code (if closed) */
  closeCode?: number;
  /** Close reason (if closed) */
  closeReason?: string;
}

/**
 * WebSocket discovery result (from runtime capture)
 */
export interface WebSocketDiscovery {
  /** Discovered connections */
  connections: WebSocketConnection[];
  /** Total messages captured */
  totalMessages: number;
  /** Total connections */
  totalConnections: number;
}

/**
 * Server-Sent Events (SSE) connection
 */
export interface SSEConnection {
  /** SSE endpoint URL */
  url: string;
  /** When connection was established */
  connectedAt: number;
  /** When connection was closed (if closed) */
  closedAt?: number;
  /** Events received */
  events: SSEEvent[];
}

/**
 * Server-Sent Event
 */
export interface SSEEvent {
  /** Event type */
  event?: string;
  /** Event data */
  data: string;
  /** Event ID */
  id?: string;
  /** Retry interval (ms) */
  retry?: number;
  /** Timestamp */
  timestamp: number;
}
