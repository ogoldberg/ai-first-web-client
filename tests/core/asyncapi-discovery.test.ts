/**
 * Tests for AsyncAPI Discovery Module (D-005)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  discoverAsyncAPI,
  generateAsyncAPIPatterns,
  generatePatternsFromAsyncAPI,
  clearAsyncAPICache,
  getAsyncAPICacheStats,
  ASYNCAPI_PROBE_LOCATIONS,
  type ParsedAsyncAPISpec,
  type AsyncAPIChannel,
  type AsyncAPIServer,
  type AsyncAPIProtocol,
  type AsyncAPIDiscoveryOptions,
} from '../../src/core/asyncapi-discovery.js';

// ============================================
// MOCK DATA
// ============================================

const MOCK_ASYNCAPI_2_SPEC = {
  asyncapi: '2.6.0',
  info: {
    title: 'Test WebSocket API',
    description: 'A test AsyncAPI specification',
    version: '1.0.0',
  },
  servers: {
    production: {
      url: 'wss://api.example.com',
      protocol: 'wss',
      description: 'Production WebSocket server',
    },
  },
  defaultContentType: 'application/json',
  channels: {
    'chat/messages': {
      description: 'Chat message channel',
      publish: {
        operationId: 'sendMessage',
        summary: 'Send a chat message',
        message: {
          name: 'ChatMessage',
          payload: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sender: { type: 'string' },
            },
          },
        },
      },
      subscribe: {
        operationId: 'receiveMessage',
        summary: 'Receive chat messages',
        message: {
          name: 'ChatMessage',
          payload: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sender: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  },
};

const MOCK_ASYNCAPI_2_WITH_MULTIPLE_SERVERS = {
  asyncapi: '2.5.0',
  info: {
    title: 'Multi-Server API',
    version: '1.0.0',
  },
  servers: {
    production: {
      url: 'wss://ws.example.com',
      protocol: 'wss',
    },
    development: {
      url: 'ws://localhost:8080',
      protocol: 'ws',
    },
    mqtt: {
      url: 'mqtt://broker.example.com:1883',
      protocol: 'mqtt',
    },
  },
  channels: {
    events: {
      subscribe: {
        operationId: 'onEvent',
        message: {
          payload: { type: 'object' },
        },
      },
    },
  },
};

const MOCK_ASYNCAPI_3_SPEC = {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI 3.0 Spec',
    version: '1.0.0',
  },
  servers: {
    websocket: {
      host: 'api.example.com',
      protocol: 'wss',
      pathname: '/v1/ws',
    },
  },
  channels: {
    userEvents: {
      address: 'users/{userId}/events',
      description: 'User event channel',
      parameters: {
        userId: {
          description: 'The user ID',
          schema: { type: 'string' },
        },
      },
    },
  },
  operations: {
    onUserEvent: {
      action: 'receive',
      channel: { $ref: '#/channels/userEvents' },
      messages: [
        { $ref: '#/components/messages/UserEvent' },
      ],
    },
    sendUserCommand: {
      action: 'send',
      channel: { $ref: '#/channels/userEvents' },
      messages: [
        { $ref: '#/components/messages/UserCommand' },
      ],
    },
  },
  components: {
    messages: {
      UserEvent: {
        payload: { type: 'object', properties: { event: { type: 'string' } } },
      },
      UserCommand: {
        payload: { type: 'object', properties: { command: { type: 'string' } } },
      },
    },
  },
};

const MOCK_ASYNCAPI_WITH_KAFKA = {
  asyncapi: '2.6.0',
  info: {
    title: 'Kafka Events API',
    version: '1.0.0',
  },
  servers: {
    kafka: {
      url: 'kafka://broker.example.com:9092',
      protocol: 'kafka',
    },
  },
  channels: {
    'orders.created': {
      subscribe: {
        operationId: 'onOrderCreated',
        message: {
          payload: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

const MOCK_ASYNCAPI_WITH_SECURITY = {
  asyncapi: '2.6.0',
  info: {
    title: 'Secure API',
    version: '1.0.0',
  },
  servers: {
    main: {
      url: 'wss://secure.example.com',
      protocol: 'wss',
    },
  },
  channels: {
    secure: {
      subscribe: {
        operationId: 'onSecureEvent',
        message: { payload: { type: 'object' } },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: 'httpApiKey',
        name: 'X-API-Key',
        in: 'header',
      },
      oauth2: {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: 'https://auth.example.com/token',
            scopes: {
              'read:events': 'Read events',
              'write:events': 'Write events',
            },
          },
        },
      },
      userPassword: {
        type: 'userPassword',
        description: 'Username and password authentication',
      },
    },
  },
};

const MOCK_ASYNCAPI_WITH_VARIABLES = {
  asyncapi: '2.6.0',
  info: {
    title: 'Variable Server API',
    version: '1.0.0',
  },
  servers: {
    main: {
      url: 'wss://{region}.api.example.com:{port}',
      protocol: 'wss',
      variables: {
        region: {
          default: 'us-east-1',
          enum: ['us-east-1', 'eu-west-1', 'ap-northeast-1'],
          description: 'Server region',
        },
        port: {
          default: '443',
        },
      },
    },
  },
  channels: {
    events: {
      subscribe: {
        operationId: 'onEvent',
        message: { payload: { type: 'object' } },
      },
    },
  },
};

const MOCK_ASYNCAPI_WITH_ONEOF_MESSAGE = {
  asyncapi: '2.6.0',
  info: {
    title: 'OneOf Message API',
    version: '1.0.0',
  },
  servers: {
    main: {
      url: 'wss://api.example.com',
      protocol: 'wss',
    },
  },
  channels: {
    notifications: {
      subscribe: {
        operationId: 'onNotification',
        message: {
          oneOf: [
            {
              name: 'EmailNotification',
              payload: { type: 'object', properties: { email: { type: 'string' } } },
            },
            {
              name: 'SMSNotification',
              payload: { type: 'object', properties: { phone: { type: 'string' } } },
            },
          ],
        },
      },
    },
  },
};

// ============================================
// PROBE LOCATIONS TESTS
// ============================================

describe('AsyncAPI Probe Locations', () => {
  it('should have common AsyncAPI locations defined', () => {
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/asyncapi.json');
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/asyncapi.yaml');
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/asyncapi.yml');
  });

  it('should have API directory locations', () => {
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/api/asyncapi.json');
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/api/asyncapi.yaml');
  });

  it('should have .well-known locations', () => {
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/.well-known/asyncapi.json');
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/.well-known/asyncapi.yaml');
  });

  it('should have docs directory locations', () => {
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/docs/asyncapi.json');
    expect(ASYNCAPI_PROBE_LOCATIONS).toContain('/docs/asyncapi.yaml');
  });
});

// ============================================
// SPEC PARSING TESTS
// ============================================

describe('AsyncAPI Spec Parsing', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAsyncAPICache();
    mockFetch = vi.fn();
  });

  afterEach(() => {
    clearAsyncAPICache();
  });

  it('should parse AsyncAPI 2.x JSON spec', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.spec).toBeDefined();
    expect(result.spec?.asyncapiVersion).toBe('2.6');
    expect(result.spec?.title).toBe('Test WebSocket API');
    expect(result.spec?.channels).toHaveLength(1);
  });

  it('should parse AsyncAPI 2.x YAML spec', async () => {
    const yamlSpec = `
asyncapi: '2.6.0'
info:
  title: YAML Test API
  version: '1.0.0'
servers:
  main:
    url: wss://api.example.com
    protocol: wss
channels:
  events:
    subscribe:
      operationId: onEvent
      message:
        payload:
          type: object
`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/yaml' }),
      text: () => Promise.resolve(yamlSpec),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.spec?.title).toBe('YAML Test API');
  });

  it('should parse multiple servers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_WITH_MULTIPLE_SERVERS)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.spec?.servers).toBeDefined();
    expect(Object.keys(result.spec?.servers || {})).toHaveLength(3);
    expect(result.spec?.servers?.production?.protocol).toBe('wss');
    expect(result.spec?.servers?.mqtt?.protocol).toBe('mqtt');
  });

  it('should parse security schemes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_WITH_SECURITY)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.spec?.securitySchemes).toBeDefined();
    expect(result.spec?.securitySchemes?.apiKey?.type).toBe('httpApiKey');
    expect(result.spec?.securitySchemes?.oauth2?.type).toBe('oauth2');
  });

  it('should return found=false when no spec is found', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
    expect(result.spec).toBeUndefined();
    expect(result.probedLocations.length).toBeGreaterThan(0);
  });

  it('should handle timeout', async () => {
    mockFetch.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 100);
    }));

    const result = await discoverAsyncAPI('example.com', {
      fetchFn: mockFetch,
      timeout: 50,
    });

    expect(result.found).toBe(false);
    expect(result.discoveryTime).toBeGreaterThan(0);
  });

  it('should skip patterns when specified', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await discoverAsyncAPI('example.com', {
      fetchFn: mockFetch,
      skipPatterns: ['yaml', 'yml'],
    });

    expect(result.probedLocations.every(loc => !loc.includes('yaml') && !loc.includes('yml'))).toBe(true);
  });
});

// ============================================
// CHANNEL PARSING TESTS
// ============================================

describe('Channel Parsing', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAsyncAPICache();
    mockFetch = vi.fn();
  });

  it('should parse channels with publish and subscribe operations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.spec?.channels).toHaveLength(1);
    const channel = result.spec?.channels[0];
    expect(channel?.address).toBe('chat/messages');
    expect(channel?.publish).toBeDefined();
    expect(channel?.subscribe).toBeDefined();
    expect(channel?.publish?.operationId).toBe('sendMessage');
    expect(channel?.subscribe?.operationId).toBe('receiveMessage');
  });

  it('should parse channel parameters', async () => {
    const specWithParams = {
      asyncapi: '2.6.0',
      info: { title: 'Params API', version: '1.0.0' },
      servers: { main: { url: 'wss://api.example.com', protocol: 'wss' } },
      channels: {
        'users/{userId}/messages': {
          parameters: {
            userId: {
              description: 'The user ID',
              schema: { type: 'string' },
            },
          },
          subscribe: {
            operationId: 'onUserMessage',
            message: { payload: { type: 'object' } },
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(specWithParams)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    const channel = result.spec?.channels[0];
    expect(channel?.parameters).toBeDefined();
    expect(channel?.parameters?.userId?.description).toBe('The user ID');
  });

  it('should parse message payload schemas', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    const channel = result.spec?.channels[0];
    const publishMessage = channel?.publish?.message;
    expect(publishMessage).toBeDefined();
    // Check it has payload with properties
    if (publishMessage && 'payload' in publishMessage) {
      expect(publishMessage.payload).toBeDefined();
    }
  });
});

// ============================================
// PATTERN GENERATION TESTS
// ============================================

describe('Pattern Generation', () => {
  describe('generateAsyncAPIPatterns', () => {
    it('should generate patterns for publish and subscribe operations', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          {
            address: 'chat/messages',
            publish: {
              operationId: 'sendMessage',
            },
            subscribe: {
              operationId: 'receiveMessage',
            },
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generateAsyncAPIPatterns(spec);

      expect(patterns).toHaveLength(2);
      expect(patterns.some(p => p.operationType === 'publish')).toBe(true);
      expect(patterns.some(p => p.operationType === 'subscribe')).toBe(true);
    });

    it('should include server URL in pattern', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          prod: {
            url: 'wss://ws.example.com/v1',
            protocol: 'wss',
          },
        },
        channels: [
          {
            address: 'events',
            subscribe: { operationId: 'onEvent' },
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generateAsyncAPIPatterns(spec);

      expect(patterns[0].serverUrl).toBe('wss://ws.example.com/v1');
    });

    it('should include protocol in pattern', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          {
            address: 'events',
            subscribe: { operationId: 'onEvent' },
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generateAsyncAPIPatterns(spec);

      expect(patterns[0].protocol).toBe('wss');
    });

    it('should include channel address in pattern', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          {
            address: 'users/notifications',
            subscribe: { operationId: 'onNotification' },
          },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generateAsyncAPIPatterns(spec);

      expect(patterns[0].channel).toBe('users/notifications');
    });

    it('should return empty array when no servers defined', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {},
        channels: [
          { address: 'events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generateAsyncAPIPatterns(spec);

      expect(patterns).toHaveLength(0);
    });

    it('should set high confidence for AsyncAPI patterns', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          { address: 'events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generateAsyncAPIPatterns(spec);

      expect(patterns[0].confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('generatePatternsFromAsyncAPI', () => {
    it('should generate LearnedApiPattern objects for WebSocket protocols', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          { address: 'events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generatePatternsFromAsyncAPI(spec, 'example.com');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].templateType).toBe('query-api');
      expect(patterns[0].method).toBe('GET');
    });

    it('should skip non-WebSocket protocols', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Kafka API',
        servers: {
          main: {
            url: 'kafka://broker.example.com:9092',
            protocol: 'kafka',
          },
        },
        channels: [
          { address: 'events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generatePatternsFromAsyncAPI(spec, 'example.com');

      expect(patterns).toHaveLength(0);
    });

    it('should include WebSocket upgrade headers', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          { address: 'events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generatePatternsFromAsyncAPI(spec, 'example.com');

      expect(patterns[0].headers?.Upgrade).toBe('websocket');
      expect(patterns[0].headers?.Connection).toBe('Upgrade');
    });

    it('should generate URL patterns for matching', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          { address: 'users/events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generatePatternsFromAsyncAPI(spec, 'example.com');

      expect(patterns[0].urlPatterns.length).toBeGreaterThan(0);
      expect(patterns[0].urlPatterns[0]).toContain('example\\.com');
    });

    it('should include domain in pattern metrics', () => {
      const spec: ParsedAsyncAPISpec = {
        asyncapiVersion: '2.6',
        title: 'Test API',
        servers: {
          main: {
            url: 'wss://api.example.com',
            protocol: 'wss',
          },
        },
        channels: [
          { address: 'events', subscribe: { operationId: 'onEvent' } },
        ],
        discoveredAt: Date.now(),
        specUrl: 'https://example.com/asyncapi.json',
      };

      const patterns = generatePatternsFromAsyncAPI(spec, 'example.com');

      expect(patterns[0].metrics.domains).toContain('example.com');
    });
  });
});

// ============================================
// SERVER URL RESOLUTION TESTS
// ============================================

describe('Server URL Resolution', () => {
  it('should resolve server URL with variables', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_WITH_VARIABLES)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    const patterns = generateAsyncAPIPatterns(result.spec!);

    // Should use default values for variables
    expect(patterns[0].serverUrl).toBe('wss://us-east-1.api.example.com:443');
  });
});

// ============================================
// CACHE TESTS
// ============================================

describe('AsyncAPI Cache', () => {
  beforeEach(async () => {
    await clearAsyncAPICache();
  });

  afterEach(async () => {
    await clearAsyncAPICache();
  });

  it('should clear cache when clearAsyncAPICache is called', async () => {
    await expect(clearAsyncAPICache()).resolves.not.toThrow();
    const stats = await getAsyncAPICacheStats();
    expect(stats.size).toBe(0);
  });

  it('should return cache statistics', async () => {
    const stats = await getAsyncAPICacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('domains');
    expect(Array.isArray(stats.domains)).toBe(true);
  });
});

// ============================================
// VERSION DETECTION TESTS
// ============================================

describe('AsyncAPI Version Detection', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAsyncAPICache();
    mockFetch = vi.fn();
  });

  it('should recognize AsyncAPI 2.0 spec', async () => {
    const spec20 = { ...MOCK_ASYNCAPI_2_SPEC, asyncapi: '2.0.0' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(spec20)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.spec?.asyncapiVersion).toBe('2.0');
  });

  it('should recognize AsyncAPI 2.6 spec', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.spec?.asyncapiVersion).toBe('2.6');
  });

  it('should recognize AsyncAPI 3.0 spec', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_3_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.spec?.asyncapiVersion).toBe('3.0');
  });

  it('should reject non-AsyncAPI spec', async () => {
    const notAsyncAPI = { openapi: '3.0.0', info: { title: 'OpenAPI', version: '1.0.0' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(notAsyncAPI)),
    });

    // Should continue probing other locations
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.found).toBe(false);
  });
});

// ============================================
// PROTOCOL TESTS
// ============================================

describe('Protocol Handling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAsyncAPICache();
    mockFetch = vi.fn();
  });

  it('should handle WebSocket protocol', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.spec?.servers?.production?.protocol).toBe('wss');
  });

  it('should handle MQTT protocol', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_WITH_MULTIPLE_SERVERS)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.spec?.servers?.mqtt?.protocol).toBe('mqtt');
  });

  it('should handle Kafka protocol', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_WITH_KAFKA)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    expect(result.spec?.servers?.kafka?.protocol).toBe('kafka');
  });
});

// ============================================
// MESSAGE HANDLING TESTS
// ============================================

describe('Message Handling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAsyncAPICache();
    mockFetch = vi.fn();
  });

  it('should handle oneOf message definitions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_WITH_ONEOF_MESSAGE)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    const patterns = generateAsyncAPIPatterns(result.spec!);

    // Should still generate pattern even with oneOf message
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('should extract message payload schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(MOCK_ASYNCAPI_2_SPEC)),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });
    const patterns = generateAsyncAPIPatterns(result.spec!);

    const publishPattern = patterns.find(p => p.operationType === 'publish');
    expect(publishPattern?.messageSchema).toBeDefined();
  });
});

// ============================================
// CHANNEL LIMIT TESTS
// ============================================

describe('Channel Limits', () => {
  it('should limit patterns generated per spec', () => {
    // Create spec with many channels
    const channels: AsyncAPIChannel[] = [];
    for (let i = 0; i < 100; i++) {
      channels.push({
        address: `channel${i}`,
        subscribe: { operationId: `onChannel${i}` },
      });
    }

    const spec: ParsedAsyncAPISpec = {
      asyncapiVersion: '2.6',
      title: 'Many Channels',
      servers: {
        main: {
          url: 'wss://api.example.com',
          protocol: 'wss',
        },
      },
      channels,
      discoveredAt: Date.now(),
      specUrl: 'https://example.com/asyncapi.json',
    };

    const patterns = generateAsyncAPIPatterns(spec);

    // Should be limited to MAX_CHANNELS_PER_SPEC (50)
    expect(patterns.length).toBeLessThanOrEqual(50);
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Error Handling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAsyncAPICache();
    mockFetch = vi.fn();
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
    expect(result.probedLocations.length).toBeGreaterThan(0);
  });

  it('should handle malformed JSON gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{ invalid json }'),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
  });

  it('should handle empty response gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(''),
    });

    const result = await discoverAsyncAPI('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
  });
});
