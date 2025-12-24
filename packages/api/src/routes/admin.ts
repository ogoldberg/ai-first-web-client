/**
 * Admin Routes
 *
 * Administrative endpoints for log queries and system management.
 * Requires admin permission to access.
 */

import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { getRequestLogger, type LogQueryFilter } from '../middleware/request-logger.js';

export const admin = new Hono();

// Protect all admin routes - require authentication and admin permission
admin.use('*', authMiddleware, requirePermission('admin'));

/**
 * GET /logs - Query request logs
 *
 * Query parameters:
 * - tenantId: Filter by tenant ID
 * - method: Filter by HTTP method
 * - path: Filter by exact path
 * - pathPrefix: Filter by path prefix
 * - status: Filter by exact status code
 * - statusMin/statusMax: Filter by status range
 * - success: Filter by success (true/false)
 * - startTime: Filter by start time (ISO string)
 * - endTime: Filter by end time (ISO string)
 * - limit: Max results (default 100)
 * - offset: Pagination offset
 */
admin.get('/logs', (c) => {
  const logger = getRequestLogger();
  const query = c.req.query();

  const filter: LogQueryFilter = {};

  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.method) filter.method = query.method.toUpperCase();
  if (query.path) filter.path = query.path;
  if (query.pathPrefix) filter.pathPrefix = query.pathPrefix;
  if (query.status) {
    const status = parseInt(query.status, 10);
    if (!Number.isNaN(status)) filter.status = status;
  }
  if (query.statusMin || query.statusMax) {
    const min = parseInt(query.statusMin || '0', 10);
    const max = parseInt(query.statusMax || '599', 10);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      filter.statusRange = { min, max };
    }
  }
  if (query.success !== undefined) filter.success = query.success === 'true';
  if (query.startTime) {
    const startTime = new Date(query.startTime);
    if (!Number.isNaN(startTime.getTime())) filter.startTime = startTime;
  }
  if (query.endTime) {
    const endTime = new Date(query.endTime);
    if (!Number.isNaN(endTime.getTime())) filter.endTime = endTime;
  }
  if (query.limit) {
    const limit = parseInt(query.limit, 10);
    if (!Number.isNaN(limit)) filter.limit = Math.min(limit, 1000);
  }
  if (query.offset) {
    const offset = parseInt(query.offset, 10);
    if (!Number.isNaN(offset)) filter.offset = offset;
  }

  const logs = logger.query(filter);

  return c.json({
    success: true,
    data: {
      logs,
      count: logs.length,
      filter,
    },
  });
});

/**
 * GET /logs/stats - Get aggregated log statistics
 *
 * Query parameters same as /logs for filtering
 */
admin.get('/logs/stats', (c) => {
  const logger = getRequestLogger();
  const query = c.req.query();

  const filter: Partial<LogQueryFilter> = {};

  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.method) filter.method = query.method.toUpperCase();
  if (query.pathPrefix) filter.pathPrefix = query.pathPrefix;
  if (query.success !== undefined) filter.success = query.success === 'true';
  if (query.startTime) filter.startTime = new Date(query.startTime);
  if (query.endTime) filter.endTime = new Date(query.endTime);

  const stats = logger.getStats(Object.keys(filter).length > 0 ? filter : undefined);

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /logs/:requestId - Get a specific log entry by request ID
 */
admin.get('/logs/:requestId', (c) => {
  const requestId = c.req.param('requestId');
  const logger = getRequestLogger();

  // Query for the specific log entry by its ID
  const [entry] = logger.query({ requestId, limit: 1 });

  if (!entry) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Log entry ${requestId} not found`,
        },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: entry,
  });
});

/**
 * DELETE /logs - Clear all logs (use with caution)
 */
admin.delete('/logs', (c) => {
  const logger = getRequestLogger();
  logger.clear();

  return c.json({
    success: true,
    message: 'All logs cleared',
  });
});
