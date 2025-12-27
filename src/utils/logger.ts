/**
 * Structured Logger using Pino
 *
 * Provides structured JSON logging with:
 * - Multiple log levels (debug, info, warn, error)
 * - Component-based child loggers
 * - Structured metadata for each log entry
 * - MCP-friendly output to stderr (stdout reserved for MCP protocol)
 */

import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Log context metadata
 */
export interface LogContext {
  component?: string;
  domain?: string;
  url?: string;
  operation?: string;
  tier?: string;
  skillId?: string;
  sessionId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
  destination: 'stderr' | 'stdout';
}

// Default configuration - logs to stderr (MCP uses stdout for protocol)
const DEFAULT_CONFIG: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  prettyPrint: process.env.LOG_PRETTY === 'true',
  destination: 'stderr',
};

/**
 * Paths to redact from logs to prevent secrets from leaking.
 * Uses Pino's path syntax (wildcards with *)
 *
 * See: https://getpino.io/#/docs/redaction
 */
const REDACT_PATHS = [
  // HTTP headers (case variations)
  '*.authorization',
  '*.Authorization',
  '*.cookie',
  '*.Cookie',
  '*.set-cookie',
  '*.Set-Cookie',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
  'headers.Cookie',
  'requestHeaders.authorization',
  'requestHeaders.Authorization',
  'requestHeaders.cookie',
  'requestHeaders.Cookie',
  'responseHeaders.set-cookie',
  'responseHeaders.Set-Cookie',

  // Common secret field names
  '*.password',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.apikey',
  '*.token',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.privateKey',
  '*.private_key',
  '*.credentials',
  '*.auth',

  // localStorage/sessionStorage
  '*.localStorage',
  '*.sessionStorage',

  // Nested in common objects
  'session.cookies',
  'session.auth',
  'request.headers.authorization',
  'request.headers.cookie',
  'response.headers.set-cookie',
];

/**
 * Create the base Pino logger instance
 */
function createBaseLogger(config: LoggerConfig = DEFAULT_CONFIG): PinoLogger {
  const options: LoggerOptions = {
    level: config.level,
    base: {
      pid: process.pid,
      service: 'llm-browser',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  };

  // Use stderr since stdout is reserved for MCP protocol
  const destination = config.destination === 'stderr' ? process.stderr : process.stdout;

  // Pretty print for development
  if (config.prettyPrint) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,service',
          destination: config.destination === 'stderr' ? 2 : 1,
        },
      },
    });
  }

  return pino(options, destination);
}

// Base logger instance
let baseLogger = createBaseLogger();

/**
 * Reconfigure the logger (useful for testing or runtime changes)
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  baseLogger = createBaseLogger({ ...DEFAULT_CONFIG, ...config });
}

/**
 * Get the base logger
 */
export function getLogger(): PinoLogger {
  return baseLogger;
}

/**
 * Component-specific logger wrapper
 *
 * Uses a getter to always access the current baseLogger, allowing
 * reconfiguration at runtime via configureLogger().
 */
export class Logger {
  private _logger: PinoLogger | null = null;
  private _context: LogContext | null = null;
  private component: string;

  constructor(component: string, parentLogger?: PinoLogger) {
    this.component = component;
    // If a specific parent logger is provided, cache it (for child loggers)
    if (parentLogger) {
      this._logger = parentLogger.child({ component });
    }
  }

  /**
   * Get the internal Pino logger, creating fresh child from baseLogger if needed
   */
  private get logger(): PinoLogger {
    // If we have a cached logger (from parent), use it
    if (this._logger) {
      return this._logger;
    }
    // Otherwise, create child from current baseLogger each time
    // This ensures configureLogger() changes take effect
    return baseLogger.child({ component: this.component });
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger(this.component, this.logger);
    childLogger._logger = this.logger.child(context);
    childLogger._context = context;
    return childLogger;
  }

  /**
   * Debug level - detailed diagnostic information
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(context || {}, message);
  }

  /**
   * Info level - general operational messages
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(context || {}, message);
  }

  /**
   * Warn level - warning conditions
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(context || {}, message);
  }

  /**
   * Error level - error conditions
   * Accepts unknown type for error since catch blocks provide unknown
   */
  error(message: string, context?: LogContext & { error?: unknown }): void {
    if (context?.error) {
      const err = context.error instanceof Error
        ? {
            message: context.error.message,
            name: context.error.name,
            stack: context.error.stack,
          }
        : { message: String(context.error) };

      this.logger.error(
        {
          ...context,
          err,
        },
        message
      );
    } else {
      this.logger.error(context || {}, message);
    }
  }

  /**
   * Log with timing information
   */
  timed(message: string, startTime: number, context?: LogContext): void {
    const durationMs = Date.now() - startTime;
    this.info(message, { ...context, durationMs });
  }
}

/**
 * Pre-configured loggers for each component
 */
export const logger = {
  // Core components
  browser: new Logger('BrowserManager'),
  session: new Logger('SessionManager'),
  intelligence: new Logger('ContentIntelligence'),
  tieredFetcher: new Logger('TieredFetcher'),
  smartBrowser: new Logger('SmartBrowser'),
  verificationEngine: new Logger('VerificationEngine'),
  workflowRecorder: new Logger('WorkflowRecorder'),
  workflowScheduler: new Logger('WorkflowScheduler'),

  // Learning components
  learning: new Logger('LearningEngine'),
  proceduralMemory: new Logger('ProceduralMemory'),
  knowledgeBase: new Logger('KnowledgeBase'),
  embedding: new Logger('Embedding'),
  formLearner: new Logger('FormSubmissionLearner'),

  // Tools
  browseTool: new Logger('BrowseTool'),
  apiCall: new Logger('ApiCallTool'),

  // Utils
  rateLimiter: new Logger('RateLimiter'),
  retry: new Logger('Retry'),

  // Server
  server: new Logger('MCPServer'),

  // Create a custom logger for any component
  create: (component: string) => new Logger(component),
};

/**
 * Convenience function to log server startup
 */
export function logServerStart(version: string, features: string[]): void {
  logger.server.info('Server starting', {
    version,
    features,
    nodeVersion: process.version,
  });
}

/**
 * Convenience function to log server shutdown
 */
export function logServerShutdown(reason?: string): void {
  logger.server.info('Server shutting down', { reason });
}

export default logger;
