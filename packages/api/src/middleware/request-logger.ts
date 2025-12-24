/**
 * Request Logger Middleware
 *
 * Structured logging for API requests with:
 * - Unique request IDs
 * - Timing and duration tracking
 * - Sensitive data redaction
 * - Tenant context capture
 * - Queryable log storage
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { recordHttpRequest } from '../services/metrics.js';

/**
 * Log entry for a single request/response cycle
 */
export interface RequestLogEntry {
  requestId: string;
  timestamp: string;
  durationMs: number;
  method: string;
  path: string;
  query: Record<string, string>;
  status: number;
  success: boolean;
  tenantId?: string;
  tenantName?: string;
  apiKeyId?: string;
  apiKeyPrefix?: string;
  userAgent?: string;
  clientIp?: string;
  contentLength?: number;
  responseSize?: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Filter options for querying logs
 */
export interface LogQueryFilter {
  requestId?: string;
  tenantId?: string;
  method?: string;
  path?: string;
  pathPrefix?: string;
  status?: number;
  statusRange?: { min: number; max: number };
  success?: boolean;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Aggregated statistics from logs
 */
export interface LogStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  statusCodes: Record<number, number>;
  topPaths: Array<{ path: string; count: number }>;
  topErrors: Array<{ code: string; count: number }>;
}

/**
 * Interface for request logging backends
 */
export interface RequestLogger {
  log(entry: RequestLogEntry): void;
  query(filter: LogQueryFilter): RequestLogEntry[];
  getStats(filter?: Partial<LogQueryFilter>): LogStats;
  clear(): void;
}

/**
 * In-memory log store for development and testing
 */
export class InMemoryLogStore implements RequestLogger {
  private logs: RequestLogEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  log(entry: RequestLogEntry): void {
    this.logs.push(entry);
    // Trim oldest entries if over max size
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }

  query(filter: LogQueryFilter): RequestLogEntry[] {
    let results = [...this.logs];

    if (filter.requestId) {
      results = results.filter((e) => e.requestId === filter.requestId);
    }
    if (filter.tenantId) {
      results = results.filter((e) => e.tenantId === filter.tenantId);
    }
    if (filter.method) {
      results = results.filter((e) => e.method === filter.method);
    }
    if (filter.path) {
      results = results.filter((e) => e.path === filter.path);
    }
    if (filter.pathPrefix) {
      results = results.filter((e) => e.path.startsWith(filter.pathPrefix!));
    }
    if (filter.status !== undefined) {
      results = results.filter((e) => e.status === filter.status);
    }
    if (filter.statusRange) {
      results = results.filter(
        (e) => e.status >= filter.statusRange!.min && e.status <= filter.statusRange!.max
      );
    }
    if (filter.success !== undefined) {
      results = results.filter((e) => e.success === filter.success);
    }
    if (filter.startTime) {
      results = results.filter((e) => new Date(e.timestamp) >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter((e) => new Date(e.timestamp) <= filter.endTime!);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    return results.slice(offset, offset + limit);
  }

  getStats(filter?: Partial<LogQueryFilter>): LogStats {
    let logs = filter ? this.query({ ...filter, limit: undefined, offset: undefined }) : this.logs;

    if (logs.length === 0) {
      return {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        avgDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        statusCodes: {},
        topPaths: [],
        topErrors: [],
      };
    }

    const durations = logs.map((l) => l.durationMs).sort((a, b) => a - b);
    const statusCodes: Record<number, number> = {};
    const pathCounts: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};

    let successCount = 0;
    let totalDuration = 0;

    for (const log of logs) {
      if (log.success) successCount++;
      totalDuration += log.durationMs;
      statusCodes[log.status] = (statusCodes[log.status] || 0) + 1;
      pathCounts[log.path] = (pathCounts[log.path] || 0) + 1;
      if (log.error?.code) {
        errorCounts[log.error.code] = (errorCounts[log.error.code] || 0) + 1;
      }
    }

    const percentile = (arr: number[], p: number) => {
      const idx = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, idx)] || 0;
    };

    return {
      totalRequests: logs.length,
      successCount,
      errorCount: logs.length - successCount,
      avgDurationMs: Math.round(totalDuration / logs.length),
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p99DurationMs: percentile(durations, 99),
      statusCodes,
      topPaths: Object.entries(pathCounts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topErrors: Object.entries(errorCounts)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  clear(): void {
    this.logs = [];
  }

  getAll(): RequestLogEntry[] {
    return [...this.logs];
  }
}

// Global logger instance (can be swapped for testing)
let requestLogger: RequestLogger = new InMemoryLogStore();

/**
 * Set the request logger instance
 */
export function setRequestLogger(logger: RequestLogger): void {
  requestLogger = logger;
}

/**
 * Get the current request logger instance
 */
export function getRequestLogger(): RequestLogger {
  return requestLogger;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Headers that should be redacted for security
 */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'api-key', 'x-auth-token'];

/**
 * Query parameters that should be redacted
 */
const SENSITIVE_PARAMS = ['api_key', 'apikey', 'token', 'secret', 'password', 'key'];

/**
 * Redact sensitive values from headers
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      // Show prefix for debugging but hide the rest
      redacted[key] = value.length > 8 ? `${value.substring(0, 8)}...REDACTED` : 'REDACTED';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Redact sensitive values from query parameters
 */
export function redactQuery(query: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (SENSITIVE_PARAMS.includes(key.toLowerCase())) {
      redacted[key] = 'REDACTED';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Configuration for the request logger middleware
 */
export interface RequestLoggerConfig {
  /** Skip logging for certain paths (e.g., health checks) */
  skipPaths?: string[];
  /** Include request headers in logs (default: false) */
  includeHeaders?: boolean;
  /** Log to console in addition to store (default: true in dev) */
  logToConsole?: boolean;
  /** Include stack traces for errors (default: true in dev) */
  includeStacks?: boolean;
}

/**
 * Create the request logger middleware
 */
export function createRequestLoggerMiddleware(config: RequestLoggerConfig = {}) {
  const {
    skipPaths = ['/health', '/health/ready', '/health/live'],
    includeHeaders = false,
    logToConsole = process.env.NODE_ENV === 'development',
    includeStacks = process.env.NODE_ENV === 'development',
  } = config;

  return createMiddleware(async (c: Context, next: Next) => {
    const path = c.req.path;

    // Skip logging for certain paths
    if (skipPaths.some((p) => path === p || path.startsWith(p + '/'))) {
      return next();
    }

    const requestId = generateRequestId();
    const startTime = Date.now();

    // Set request ID on context for downstream use
    c.set('requestId', requestId);

    // Add request ID to response headers
    c.header('X-Request-Id', requestId);

    // Get query params (redacted)
    const url = new URL(c.req.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    let error: RequestLogEntry['error'] | undefined;

    try {
      await next();
    } catch (err) {
      // Capture error details
      const e = err as Error & { code?: string };
      error = {
        code: e.code || 'UNHANDLED_ERROR',
        message: e.message,
        ...(includeStacks && { stack: e.stack }),
      };
      throw err; // Re-throw to let error handler deal with it
    } finally {
      const durationMs = Date.now() - startTime;
      const status = c.res.status;

      // Try to get error from response body if status indicates error
      if (!error && status >= 400) {
        try {
          const body = (await c.res.clone().json()) as { error?: { code?: string; message?: string } };
          if (body?.error) {
            error = {
              code: body.error.code || 'ERROR',
              message: body.error.message || 'Unknown error',
            };
          }
        } catch {
          // Response might not be JSON, that's ok
        }
      }

      // Get tenant info if available (set by auth middleware)
      const tenant = c.get('tenant') as { id: string; name: string } | undefined;
      const apiKey = c.get('apiKey') as { id: string; keyPrefix: string } | undefined;

      const entry: RequestLogEntry = {
        requestId,
        timestamp: new Date().toISOString(),
        durationMs,
        method: c.req.method,
        path,
        query: redactQuery(query),
        status,
        success: status < 400,
        tenantId: tenant?.id,
        tenantName: tenant?.name,
        apiKeyId: apiKey?.id,
        apiKeyPrefix: apiKey?.keyPrefix,
        userAgent: c.req.header('user-agent'),
        clientIp: (c.req.header('x-forwarded-for') || c.req.header('x-real-ip'))?.split(',')[0].trim(),
        contentLength: ((val) => (Number.isNaN(val) ? undefined : val))(parseInt(c.req.header('content-length') ?? '', 10)),
        responseSize: ((val) => (Number.isNaN(val) ? undefined : val))(parseInt(c.res.headers.get('content-length') ?? '', 10)),
        error,
      };

      // Log to store
      requestLogger.log(entry);

      // Record metrics (for Prometheus export)
      recordHttpRequest(entry.method, entry.path, entry.status, entry.durationMs);

      // Optionally log to console
      if (logToConsole) {
        const logLine = `${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms${entry.tenantId ? ` [${entry.tenantId}]` : ''}${error ? ` ERROR: ${error.code}` : ''}`;
        if (status >= 500) {
          console.error(`[${requestId}]`, logLine);
        } else if (status >= 400) {
          console.warn(`[${requestId}]`, logLine);
        } else {
          console.log(`[${requestId}]`, logLine);
        }
      }
    }
  });
}

/**
 * Default middleware instance
 */
export const requestLoggerMiddleware = createRequestLoggerMiddleware();
