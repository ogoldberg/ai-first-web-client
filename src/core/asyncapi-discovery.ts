/**
 * AsyncAPI Discovery Module (D-005)
 *
 * Automatically discovers AsyncAPI specifications for event-driven APIs
 * including WebSocket, MQTT, Kafka, AMQP, and other message-based protocols.
 *
 * This module:
 * 1. Probes common AsyncAPI spec locations
 * 2. Parses AsyncAPI 2.x and 3.x specifications
 * 3. Extracts channels, servers, and message schemas
 * 4. Generates API patterns for discovered endpoints
 * 5. Integrates with the Discovery Orchestrator
 */

import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import type { LearnedApiPattern, ContentMapping, PatternValidation } from '../types/api-patterns.js';

const asyncapiLogger = logger.create('AsyncAPIDiscovery');

// ============================================
// TYPES
// ============================================

/**
 * AsyncAPI protocol types
 */
export type AsyncAPIProtocol =
  | 'ws'       // WebSocket
  | 'wss'      // WebSocket Secure
  | 'mqtt'     // MQTT
  | 'mqtts'    // MQTT Secure
  | 'amqp'     // AMQP
  | 'amqps'    // AMQP Secure
  | 'kafka'    // Kafka
  | 'kafka-secure'
  | 'http'     // HTTP (streaming)
  | 'https'
  | 'jms'      // Java Message Service
  | 'sns'      // AWS SNS
  | 'sqs'      // AWS SQS
  | 'stomp'    // STOMP
  | 'redis'    // Redis Pub/Sub
  | 'nats'     // NATS
  | 'pulsar';  // Apache Pulsar

/**
 * AsyncAPI specification version
 */
export type AsyncAPIVersion = '2.0' | '2.1' | '2.2' | '2.3' | '2.4' | '2.5' | '2.6' | '3.0';

/**
 * AsyncAPI server definition
 */
export interface AsyncAPIServer {
  /** Server URL (may contain variables) */
  url: string;
  /** Protocol used by this server */
  protocol: AsyncAPIProtocol;
  /** Protocol version if applicable */
  protocolVersion?: string;
  /** Human-readable description */
  description?: string;
  /** Server variables for URL templating */
  variables?: Record<string, {
    default?: string;
    description?: string;
    enum?: string[];
  }>;
  /** Security requirements */
  security?: Array<Record<string, string[]>>;
  /** Server bindings (protocol-specific config) */
  bindings?: Record<string, unknown>;
}

/**
 * AsyncAPI message definition
 */
export interface AsyncAPIMessage {
  /** Message name/identifier */
  name?: string;
  /** Human-readable title */
  title?: string;
  /** Message description */
  description?: string;
  /** Content type (e.g., 'application/json') */
  contentType?: string;
  /** Message payload schema */
  payload?: Record<string, unknown>;
  /** Message headers schema */
  headers?: Record<string, unknown>;
  /** Correlation ID configuration */
  correlationId?: {
    location: string;
    description?: string;
  };
  /** Message bindings (protocol-specific) */
  bindings?: Record<string, unknown>;
  /** Example messages */
  examples?: Array<{
    name?: string;
    summary?: string;
    payload?: unknown;
    headers?: Record<string, unknown>;
  }>;
}

/**
 * AsyncAPI channel operation (publish/subscribe)
 */
export interface AsyncAPIOperation {
  /** Operation ID */
  operationId?: string;
  /** Human-readable summary */
  summary?: string;
  /** Description */
  description?: string;
  /** Security requirements for this operation */
  security?: Array<Record<string, string[]>>;
  /** Tags for categorization */
  tags?: Array<{ name: string; description?: string }>;
  /** Message(s) for this operation */
  message?: AsyncAPIMessage | { oneOf: AsyncAPIMessage[] };
  /** Protocol bindings */
  bindings?: Record<string, unknown>;
}

/**
 * AsyncAPI channel definition
 */
export interface AsyncAPIChannel {
  /** Channel address/topic */
  address: string;
  /** Human-readable description */
  description?: string;
  /** Publish operation (client sends to server) */
  publish?: AsyncAPIOperation;
  /** Subscribe operation (client receives from server) */
  subscribe?: AsyncAPIOperation;
  /** Channel parameters (variables in address) */
  parameters?: Record<string, {
    description?: string;
    schema?: Record<string, unknown>;
    location?: string;
  }>;
  /** Channel bindings (protocol-specific) */
  bindings?: Record<string, unknown>;
  /** Servers this channel is available on (v3.0) */
  servers?: string[];
}

/**
 * AsyncAPI security scheme
 */
export interface AsyncAPISecurityScheme {
  /** Security scheme type */
  type: 'userPassword' | 'apiKey' | 'X509' | 'symmetricEncryption' | 'asymmetricEncryption' | 'httpApiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'plain' | 'scramSha256' | 'scramSha512' | 'gssapi';
  /** Description */
  description?: string;
  /** API key location (for apiKey/httpApiKey) */
  in?: 'user' | 'password' | 'query' | 'header' | 'cookie';
  /** API key name */
  name?: string;
  /** HTTP scheme (for http type) */
  scheme?: string;
  /** Bearer format */
  bearerFormat?: string;
  /** OAuth2 flows */
  flows?: {
    implicit?: { authorizationUrl: string; scopes: Record<string, string> };
    password?: { tokenUrl: string; scopes: Record<string, string> };
    clientCredentials?: { tokenUrl: string; scopes: Record<string, string> };
    authorizationCode?: { authorizationUrl: string; tokenUrl: string; scopes: Record<string, string> };
  };
  /** OpenID Connect URL */
  openIdConnectUrl?: string;
}

/**
 * Parsed AsyncAPI specification
 */
export interface ParsedAsyncAPISpec {
  /** AsyncAPI version */
  asyncapiVersion: AsyncAPIVersion;
  /** API title */
  title: string;
  /** API version */
  version?: string;
  /** API description */
  description?: string;
  /** Available servers by name */
  servers: Record<string, AsyncAPIServer>;
  /** Available channels */
  channels: AsyncAPIChannel[];
  /** Default content type for messages */
  defaultContentType?: string;
  /** Security schemes */
  securitySchemes?: Record<string, AsyncAPISecurityScheme>;
  /** When the spec was discovered */
  discoveredAt: number;
  /** URL where the spec was found */
  specUrl: string;
}

/**
 * Result of AsyncAPI discovery attempt
 */
export interface AsyncAPIDiscoveryResult {
  /** Whether an AsyncAPI spec was found */
  found: boolean;
  /** The parsed spec if found */
  spec?: ParsedAsyncAPISpec;
  /** URL where the spec was found */
  specUrl?: string;
  /** Locations that were probed */
  probedLocations: string[];
  /** Time taken to discover (ms) */
  discoveryTime: number;
  /** Error message if discovery failed */
  error?: string;
}

/**
 * Options for AsyncAPI discovery
 */
export interface AsyncAPIDiscoveryOptions {
  /** Maximum time to spend probing (ms) */
  timeout?: number;
  /** Only probe these specific locations */
  probeLocations?: string[];
  /** Skip locations that match these patterns */
  skipPatterns?: string[];
  /** Headers to send with probe requests */
  headers?: Record<string, string>;
  /** Custom fetch function */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Generated AsyncAPI pattern
 */
export interface AsyncAPIPattern {
  /** Unique identifier */
  id: string;
  /** Channel address */
  channel: string;
  /** Protocol type */
  protocol: AsyncAPIProtocol;
  /** Server URL */
  serverUrl: string;
  /** Operation type */
  operationType: 'publish' | 'subscribe';
  /** Operation ID */
  operationId?: string;
  /** Message schema */
  messageSchema?: Record<string, unknown>;
  /** Confidence score (0-1) */
  confidence: number;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Common locations to probe for AsyncAPI specifications
 */
export const ASYNCAPI_PROBE_LOCATIONS = [
  '/asyncapi.json',
  '/asyncapi.yaml',
  '/asyncapi.yml',
  '/api/asyncapi.json',
  '/api/asyncapi.yaml',
  '/api/asyncapi.yml',
  '/docs/asyncapi.json',
  '/docs/asyncapi.yaml',
  '/.well-known/asyncapi.json',
  '/.well-known/asyncapi.yaml',
  '/v1/asyncapi.json',
  '/v2/asyncapi.json',
  '/spec/asyncapi.json',
  '/spec/asyncapi.yaml',
] as const;

/** Default timeout for probing each location */
const DEFAULT_PROBE_TIMEOUT = 5000;

/** Maximum channels to convert to patterns per spec */
const MAX_CHANNELS_PER_SPEC = 50;

/** Confidence for AsyncAPI-derived patterns */
const ASYNCAPI_PATTERN_CONFIDENCE = 0.85;

/** Initial success count for AsyncAPI-derived patterns */
const ASYNCAPI_INITIAL_SUCCESS_COUNT = 50;

// ============================================
// ASYNCAPI DISCOVERY
// ============================================

/**
 * Discover AsyncAPI specification for a domain
 */
export async function discoverAsyncAPI(
  domain: string,
  options: AsyncAPIDiscoveryOptions = {}
): Promise<AsyncAPIDiscoveryResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_PROBE_TIMEOUT * ASYNCAPI_PROBE_LOCATIONS.length;
  const probeLocations = options.probeLocations ?? [...ASYNCAPI_PROBE_LOCATIONS];
  const probedLocations: string[] = [];
  const fetchFn = options.fetchFn ?? fetch;

  // Ensure domain has protocol
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedBase = new URL(baseUrl);
  const origin = parsedBase.origin;

  asyncapiLogger.debug('Starting AsyncAPI discovery', { domain, probeLocations: probeLocations.length });

  for (const location of probeLocations) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      asyncapiLogger.debug('Discovery timeout reached', { domain, probed: probedLocations.length });
      break;
    }

    // Skip if matches skip patterns
    if (options.skipPatterns?.some(pattern => location.includes(pattern))) {
      continue;
    }

    const specUrl = `${origin}${location}`;
    probedLocations.push(specUrl);

    try {
      const response = await fetchWithTimeout(specUrl, {
        timeout: DEFAULT_PROBE_TIMEOUT,
        headers: {
          'Accept': 'application/json, application/yaml, text/yaml, */*',
          'User-Agent': 'LLM-Browser-MCP/1.0 (AsyncAPI Discovery)',
          ...options.headers,
        },
        fetchFn,
      });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      // Try to parse as AsyncAPI spec
      const spec = parseAsyncAPISpec(text, specUrl, contentType);
      if (spec) {
        asyncapiLogger.info('AsyncAPI spec discovered', {
          domain,
          specUrl,
          version: spec.asyncapiVersion,
          channels: spec.channels.length,
          servers: Object.keys(spec.servers).length,
        });

        return {
          found: true,
          spec,
          specUrl,
          probedLocations,
          discoveryTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      // Silently continue to next location
      asyncapiLogger.debug('Probe failed', { specUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }

  asyncapiLogger.debug('No AsyncAPI spec found', { domain, probed: probedLocations.length });

  return {
    found: false,
    probedLocations,
    discoveryTime: Date.now() - startTime,
  };
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: {
    timeout: number;
    headers?: Record<string, string>;
    fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);
  const fetchFn = options.fetchFn ?? fetch;

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: options.headers,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// SPEC PARSING
// ============================================

/**
 * Parse AsyncAPI specification from text
 */
function parseAsyncAPISpec(
  text: string,
  specUrl: string,
  contentType: string
): ParsedAsyncAPISpec | null {
  let spec: Record<string, unknown> | null = null;

  // Try JSON first
  try {
    spec = JSON.parse(text);
  } catch {
    // Try YAML if JSON failed
    if (
      contentType.includes('yaml') ||
      specUrl.endsWith('.yaml') ||
      specUrl.endsWith('.yml') ||
      text.trimStart().startsWith('asyncapi:')
    ) {
      spec = parseYaml(text);
    }
  }

  if (!spec) {
    return null;
  }

  // Validate it looks like an AsyncAPI spec
  if (!isAsyncAPISpec(spec)) {
    return null;
  }

  // Determine version
  const version = getAsyncAPIVersion(spec);
  if (!version) {
    return null;
  }

  // Parse based on version
  if (version.startsWith('3.')) {
    return parseAsyncAPI3(spec, specUrl, version as AsyncAPIVersion);
  } else {
    return parseAsyncAPI2(spec, specUrl, version as AsyncAPIVersion);
  }
}

/**
 * Parse YAML using js-yaml library
 */
function parseYaml(text: string): Record<string, unknown> | null {
  try {
    const parsed = yaml.load(text, {
      schema: yaml.JSON_SCHEMA,
    });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (error) {
    asyncapiLogger.debug('YAML parse error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if object looks like an AsyncAPI spec
 */
function isAsyncAPISpec(obj: Record<string, unknown>): boolean {
  // AsyncAPI has 'asyncapi' field with version string
  if (typeof obj.asyncapi === 'string') {
    return obj.asyncapi.startsWith('2.') || obj.asyncapi.startsWith('3.');
  }
  return false;
}

/**
 * Get AsyncAPI version from spec
 */
function getAsyncAPIVersion(spec: Record<string, unknown>): AsyncAPIVersion | null {
  const version = spec.asyncapi as string;
  if (!version) return null;

  // Map to our version types
  if (version.startsWith('2.0')) return '2.0';
  if (version.startsWith('2.1')) return '2.1';
  if (version.startsWith('2.2')) return '2.2';
  if (version.startsWith('2.3')) return '2.3';
  if (version.startsWith('2.4')) return '2.4';
  if (version.startsWith('2.5')) return '2.5';
  if (version.startsWith('2.6')) return '2.6';
  if (version.startsWith('3.')) return '3.0';

  return null;
}

/**
 * Parse AsyncAPI 2.x specification
 */
function parseAsyncAPI2(
  spec: Record<string, unknown>,
  specUrl: string,
  version: AsyncAPIVersion
): ParsedAsyncAPISpec {
  const info = (spec.info as Record<string, unknown>) || {};
  const serversRaw = (spec.servers as Record<string, Record<string, unknown>>) || {};
  const channelsRaw = (spec.channels as Record<string, Record<string, unknown>>) || {};
  const components = (spec.components as Record<string, unknown>) || {};

  // Parse servers
  const servers: Record<string, AsyncAPIServer> = {};
  for (const [name, serverDef] of Object.entries(serversRaw)) {
    servers[name] = parseServer(serverDef);
  }

  // Parse channels
  const channels: AsyncAPIChannel[] = [];
  for (const [address, channelDef] of Object.entries(channelsRaw)) {
    channels.push(parseChannel2(address, channelDef));
  }

  // Parse security schemes
  const securitySchemesRaw = (components.securitySchemes as Record<string, Record<string, unknown>>) || {};
  const securitySchemes = parseSecuritySchemes(securitySchemesRaw);

  return {
    asyncapiVersion: version,
    title: (info.title as string) || 'Unknown AsyncAPI',
    version: info.version as string,
    description: info.description as string,
    servers,
    channels,
    defaultContentType: spec.defaultContentType as string,
    securitySchemes: Object.keys(securitySchemes).length > 0 ? securitySchemes : undefined,
    discoveredAt: Date.now(),
    specUrl,
  };
}

/**
 * Parse AsyncAPI 3.x specification
 * AsyncAPI 3.0 has a different structure with operations separated from channels
 */
function parseAsyncAPI3(
  spec: Record<string, unknown>,
  specUrl: string,
  version: AsyncAPIVersion
): ParsedAsyncAPISpec {
  const info = (spec.info as Record<string, unknown>) || {};
  const serversRaw = (spec.servers as Record<string, Record<string, unknown>>) || {};
  const channelsRaw = (spec.channels as Record<string, Record<string, unknown>>) || {};
  const operationsRaw = (spec.operations as Record<string, Record<string, unknown>>) || {};
  const components = (spec.components as Record<string, unknown>) || {};

  // Parse servers
  const servers: Record<string, AsyncAPIServer> = {};
  for (const [name, serverDef] of Object.entries(serversRaw)) {
    servers[name] = parseServer(serverDef);
  }

  // Parse channels and associate operations
  const channels: AsyncAPIChannel[] = [];
  for (const [channelId, channelDef] of Object.entries(channelsRaw)) {
    const address = (channelDef.address as string) || channelId;
    const channel = parseChannel3(address, channelDef, operationsRaw, channelId);
    channels.push(channel);
  }

  // Parse security schemes
  const securitySchemesRaw = (components.securitySchemes as Record<string, Record<string, unknown>>) || {};
  const securitySchemes = parseSecuritySchemes(securitySchemesRaw);

  return {
    asyncapiVersion: version,
    title: (info.title as string) || 'Unknown AsyncAPI',
    version: info.version as string,
    description: info.description as string,
    servers,
    channels,
    defaultContentType: spec.defaultContentType as string,
    securitySchemes: Object.keys(securitySchemes).length > 0 ? securitySchemes : undefined,
    discoveredAt: Date.now(),
    specUrl,
  };
}

/**
 * Parse a server definition
 */
function parseServer(serverDef: Record<string, unknown>): AsyncAPIServer {
  return {
    url: (serverDef.url as string) || '',
    protocol: (serverDef.protocol as AsyncAPIProtocol) || 'ws',
    protocolVersion: serverDef.protocolVersion as string,
    description: serverDef.description as string,
    variables: serverDef.variables as Record<string, { default?: string; description?: string; enum?: string[] }>,
    security: serverDef.security as Array<Record<string, string[]>>,
    bindings: serverDef.bindings as Record<string, unknown>,
  };
}

/**
 * Parse a channel definition (AsyncAPI 2.x)
 */
function parseChannel2(address: string, channelDef: Record<string, unknown>): AsyncAPIChannel {
  const channel: AsyncAPIChannel = {
    address,
    description: channelDef.description as string,
    parameters: channelDef.parameters as Record<string, {
      description?: string;
      schema?: Record<string, unknown>;
      location?: string;
    }>,
    bindings: channelDef.bindings as Record<string, unknown>,
  };

  // Parse publish operation
  if (channelDef.publish) {
    channel.publish = parseOperation(channelDef.publish as Record<string, unknown>);
  }

  // Parse subscribe operation
  if (channelDef.subscribe) {
    channel.subscribe = parseOperation(channelDef.subscribe as Record<string, unknown>);
  }

  return channel;
}

/**
 * Parse a channel definition (AsyncAPI 3.x)
 * In 3.x, operations are defined separately and reference channels
 */
function parseChannel3(
  address: string,
  channelDef: Record<string, unknown>,
  operations: Record<string, Record<string, unknown>>,
  channelId: string
): AsyncAPIChannel {
  const channel: AsyncAPIChannel = {
    address,
    description: channelDef.description as string,
    parameters: channelDef.parameters as Record<string, {
      description?: string;
      schema?: Record<string, unknown>;
      location?: string;
    }>,
    bindings: channelDef.bindings as Record<string, unknown>,
    servers: channelDef.servers as string[],
  };

  // Find operations that reference this channel
  for (const [opId, opDef] of Object.entries(operations)) {
    const channelRef = opDef.channel as Record<string, string> | string;
    const targetChannelId = typeof channelRef === 'string'
      ? channelRef
      : channelRef?.$ref?.replace('#/channels/', '');

    if (targetChannelId === channelId) {
      const action = opDef.action as string;
      const operation = parseOperation3(opDef, opId);

      if (action === 'send') {
        channel.publish = operation;
      } else if (action === 'receive') {
        channel.subscribe = operation;
      }
    }
  }

  return channel;
}

/**
 * Parse an operation (AsyncAPI 2.x)
 */
function parseOperation(opDef: Record<string, unknown>): AsyncAPIOperation {
  return {
    operationId: opDef.operationId as string,
    summary: opDef.summary as string,
    description: opDef.description as string,
    security: opDef.security as Array<Record<string, string[]>>,
    tags: opDef.tags as Array<{ name: string; description?: string }>,
    message: parseMessage(opDef.message as Record<string, unknown>),
    bindings: opDef.bindings as Record<string, unknown>,
  };
}

/**
 * Parse an operation (AsyncAPI 3.x)
 */
function parseOperation3(opDef: Record<string, unknown>, operationId: string): AsyncAPIOperation {
  return {
    operationId: operationId,
    summary: opDef.summary as string,
    description: opDef.description as string,
    security: opDef.security as Array<Record<string, string[]>>,
    tags: opDef.tags as Array<{ name: string; description?: string }>,
    message: parseMessage3(opDef.messages as Array<Record<string, unknown>>),
    bindings: opDef.bindings as Record<string, unknown>,
  };
}

/**
 * Parse a message definition (AsyncAPI 2.x)
 */
function parseMessage(msgDef: Record<string, unknown> | undefined): AsyncAPIMessage | undefined {
  if (!msgDef) return undefined;

  // Handle oneOf messages
  if (msgDef.oneOf) {
    return {
      name: 'oneOf',
    };
  }

  return {
    name: msgDef.name as string,
    title: msgDef.title as string,
    description: msgDef.description as string,
    contentType: msgDef.contentType as string,
    payload: msgDef.payload as Record<string, unknown>,
    headers: msgDef.headers as Record<string, unknown>,
    correlationId: msgDef.correlationId as { location: string; description?: string },
    bindings: msgDef.bindings as Record<string, unknown>,
    examples: msgDef.examples as Array<{
      name?: string;
      summary?: string;
      payload?: unknown;
      headers?: Record<string, unknown>;
    }>,
  };
}

/**
 * Parse messages (AsyncAPI 3.x)
 */
function parseMessage3(messages: Array<Record<string, unknown>> | undefined): AsyncAPIMessage | undefined {
  if (!messages || messages.length === 0) return undefined;

  // For now, just use the first message
  const msgRef = messages[0];

  // Handle $ref
  if (msgRef.$ref) {
    return { name: (msgRef.$ref as string).split('/').pop() };
  }

  return parseMessage(msgRef);
}

/**
 * Parse security schemes
 */
function parseSecuritySchemes(
  schemes: Record<string, Record<string, unknown>>
): Record<string, AsyncAPISecurityScheme> {
  const result: Record<string, AsyncAPISecurityScheme> = {};

  for (const [name, schemeDef] of Object.entries(schemes)) {
    result[name] = {
      type: schemeDef.type as AsyncAPISecurityScheme['type'],
      description: schemeDef.description as string,
      in: schemeDef.in as 'user' | 'password' | 'query' | 'header' | 'cookie',
      name: schemeDef.name as string,
      scheme: schemeDef.scheme as string,
      bearerFormat: schemeDef.bearerFormat as string,
      flows: schemeDef.flows as AsyncAPISecurityScheme['flows'],
      openIdConnectUrl: schemeDef.openIdConnectUrl as string,
    };
  }

  return result;
}

// ============================================
// PATTERN GENERATION
// ============================================

/**
 * Type guard for oneOf message
 */
function isOneOfMessage(
  message: AsyncAPIMessage | { oneOf: AsyncAPIMessage[] }
): message is { oneOf: AsyncAPIMessage[] } {
  return 'oneOf' in message && Array.isArray((message as { oneOf: AsyncAPIMessage[] }).oneOf);
}

/**
 * Extract payload from a message definition
 * Handles both single messages and oneOf message arrays
 */
function getMessagePayload(
  message: AsyncAPIMessage | { oneOf: AsyncAPIMessage[] } | undefined
): Record<string, unknown> | undefined {
  if (!message) return undefined;

  // Check if it's a oneOf message
  if (isOneOfMessage(message)) {
    // Return the first message's payload
    const firstMessage = message.oneOf[0];
    return firstMessage?.payload;
  }

  // It's a single AsyncAPIMessage
  return message.payload;
}

/**
 * Generate AsyncAPI patterns from a parsed spec
 */
export function generateAsyncAPIPatterns(spec: ParsedAsyncAPISpec): AsyncAPIPattern[] {
  const patterns: AsyncAPIPattern[] = [];
  const serverEntries = Object.entries(spec.servers);

  if (serverEntries.length === 0) {
    asyncapiLogger.warn('No servers found in AsyncAPI spec', { specUrl: spec.specUrl });
    return patterns;
  }

  // Use first server by default
  const [serverName, server] = serverEntries[0];
  const serverUrl = resolveServerUrl(server);

  // Generate patterns for each channel
  const channelsToProcess = spec.channels.slice(0, MAX_CHANNELS_PER_SPEC);

  for (const channel of channelsToProcess) {
    // Generate pattern for publish operation
    if (channel.publish) {
      patterns.push({
        id: `asyncapi:${serverName}:${channel.address}:publish`,
        channel: channel.address,
        protocol: server.protocol,
        serverUrl,
        operationType: 'publish',
        operationId: channel.publish.operationId,
        messageSchema: getMessagePayload(channel.publish.message),
        confidence: ASYNCAPI_PATTERN_CONFIDENCE,
      });
    }

    // Generate pattern for subscribe operation
    if (channel.subscribe) {
      patterns.push({
        id: `asyncapi:${serverName}:${channel.address}:subscribe`,
        channel: channel.address,
        protocol: server.protocol,
        serverUrl,
        operationType: 'subscribe',
        operationId: channel.subscribe.operationId,
        messageSchema: getMessagePayload(channel.subscribe.message),
        confidence: ASYNCAPI_PATTERN_CONFIDENCE,
      });
    }
  }

  asyncapiLogger.info('Generated AsyncAPI patterns', {
    specUrl: spec.specUrl,
    patterns: patterns.length,
    channels: channelsToProcess.length,
  });

  return patterns;
}

/**
 * Resolve server URL by applying default variable values
 */
function resolveServerUrl(server: AsyncAPIServer): string {
  let url = server.url;

  if (server.variables) {
    for (const [varName, varDef] of Object.entries(server.variables)) {
      const value = varDef.default || (varDef.enum ? varDef.enum[0] : '');
      url = url.replace(`{${varName}}`, value);
    }
  }

  return url;
}

/**
 * Generate LearnedApiPattern objects from AsyncAPI patterns
 * These are used by the Discovery Orchestrator
 */
export function generatePatternsFromAsyncAPI(
  spec: ParsedAsyncAPISpec,
  domain: string
): LearnedApiPattern[] {
  const asyncPatterns = generateAsyncAPIPatterns(spec);
  const patterns: LearnedApiPattern[] = [];
  const now = Date.now();

  for (const asyncPattern of asyncPatterns) {
    // Only generate patterns for WebSocket protocols (HTTP-like)
    // Other protocols (MQTT, Kafka, etc.) require special handling
    if (!isWebSocketProtocol(asyncPattern.protocol)) {
      continue;
    }

    const pattern = createLearnedPatternFromAsyncAPI(asyncPattern, domain, now);
    patterns.push(pattern);
  }

  return patterns;
}

/**
 * Check if protocol is WebSocket-based
 */
function isWebSocketProtocol(protocol: AsyncAPIProtocol): boolean {
  return protocol === 'ws' || protocol === 'wss';
}

/**
 * Create a LearnedApiPattern from an AsyncAPI pattern
 */
function createLearnedPatternFromAsyncAPI(
  asyncPattern: AsyncAPIPattern,
  domain: string,
  now: number
): LearnedApiPattern {
  // Build endpoint URL
  const endpointUrl = asyncPattern.serverUrl.endsWith('/')
    ? `${asyncPattern.serverUrl}${asyncPattern.channel.replace(/^\//, '')}`
    : `${asyncPattern.serverUrl}${asyncPattern.channel}`;

  // Build URL pattern for matching
  const urlPatterns = createUrlPatternsForChannel(domain, asyncPattern);

  // Create content mapping
  const contentMapping: ContentMapping = {
    title: asyncPattern.operationId || asyncPattern.channel,
    description: asyncPattern.operationType,
  };

  // Create validation
  const validation: PatternValidation = {
    requiredFields: [],
    minContentLength: 1, // Event-driven APIs can have minimal payloads
  };

  return {
    id: asyncPattern.id,
    templateType: 'query-api', // Event-driven APIs are similar to query APIs
    urlPatterns,
    endpointTemplate: endpointUrl,
    extractors: [], // WebSocket URLs typically don't need extractors
    method: 'GET', // WebSocket connections start with GET upgrade
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
    },
    responseFormat: 'json',
    contentMapping,
    validation,
    metrics: {
      successCount: ASYNCAPI_INITIAL_SUCCESS_COUNT,
      failureCount: 0,
      confidence: asyncPattern.confidence,
      domains: [domain],
      lastSuccess: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create URL patterns for matching a channel
 */
function createUrlPatternsForChannel(domain: string, asyncPattern: AsyncAPIPattern): string[] {
  // Escape special regex characters
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Convert channel parameters {param} to regex wildcards
  let channelPattern = asyncPattern.channel
    .replace(/\{[^}]+\}/g, '[^/]+')
    .replace(/\//g, '\\/');

  // Match both ws:// and wss:// protocols, and the domain
  return [
    `^wss?://(www\\.)?${escapedDomain}${channelPattern}`,
    `^https?://(www\\.)?${escapedDomain}${channelPattern}`,
  ];
}

// ============================================
// CACHING (CLOUD-008: Unified Discovery Cache)
// ============================================

import { getDiscoveryCache } from '../utils/discovery-cache.js';

/** How long to cache discovery results (1 hour) */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get cached discovery result or discover anew
 * Uses unified discovery cache with tenant isolation and failed domain tracking
 */
export async function discoverAsyncAPICached(
  domain: string,
  options: AsyncAPIDiscoveryOptions = {}
): Promise<AsyncAPIDiscoveryResult> {
  const cache = getDiscoveryCache();

  // Check if domain is in cooldown from previous failures
  if (cache.isInCooldown('asyncapi', domain)) {
    const cooldownInfo = cache.getCooldownInfo('asyncapi', domain);
    asyncapiLogger.debug('Domain in cooldown, returning empty result', {
      domain,
      failureCount: cooldownInfo?.failureCount,
    });
    return {
      found: false,
      probedLocations: [],
      discoveryTime: 0,
    };
  }

  // Check cache
  const cached = await cache.get<AsyncAPIDiscoveryResult>('asyncapi', domain);
  if (cached) {
    asyncapiLogger.debug('Using cached AsyncAPI discovery result', { domain });
    return cached;
  }

  // Perform discovery
  try {
    const result = await discoverAsyncAPI(domain, options);
    await cache.set('asyncapi', domain, result, CACHE_TTL);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    cache.recordFailure('asyncapi', domain, errorMsg);
    throw err;
  }
}

/**
 * Clear the spec cache
 * @param domain - Optional domain to clear, or all if not specified
 */
export async function clearAsyncAPICache(domain?: string): Promise<void> {
  const cache = getDiscoveryCache();
  if (domain) {
    await cache.delete('asyncapi', domain);
  } else {
    await cache.clear('asyncapi');
  }
}

/**
 * Get cache statistics
 */
export async function getAsyncAPICacheStats(): Promise<{ size: number; domains: string[] }> {
  const cache = getDiscoveryCache();
  const stats = await cache.getStats();
  return {
    size: stats.entriesBySource['asyncapi'] || 0,
    domains: [], // Domain list is now internal to cache
  };
}
