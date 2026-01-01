/**
 * Beta Program Routes (API-017)
 *
 * Public and admin endpoints for the beta program:
 * - Public: Join waitlist, validate invite, submit feedback
 * - Admin: Manage waitlist, create invites, view feedback
 */

import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  joinWaitlist,
  getWaitlistEntry,
  listWaitlist,
  updateWaitlistStatus,
  createInvite,
  validateInviteCode,
  useInviteCode,
  revokeInvite,
  listInvites,
  submitFeedback,
  getFeedback,
  listFeedback,
  updateFeedbackStatus,
  getBetaProgramStats,
  inviteWaitlistEntry,
  batchInviteWaitlist,
} from '../services/beta-program.js';
import type {
  BetaWaitlistStatus,
  BetaFeedbackCategory,
  BetaFeedbackPriority,
} from '../middleware/types.js';

export const beta = new Hono();

// =============================================================================
// Public Endpoints (no auth required)
// =============================================================================

/**
 * POST /beta/waitlist - Join the beta waitlist
 *
 * Body:
 * - email: string (required)
 * - name: string (required)
 * - company: string (optional)
 * - useCase: string (required)
 * - expectedVolume: string (optional)
 * - referralSource: string (optional)
 */
beta.post('/waitlist', async (c) => {
  const body = await c.req.json<{
    email?: string;
    name?: string;
    company?: string;
    useCase?: string;
    expectedVolume?: string;
    referralSource?: string;
  }>();

  // Validate required fields
  if (!body.email || !body.email.includes('@')) {
    return c.json(
      { success: false, error: 'Valid email is required' },
      400
    );
  }

  if (!body.name || body.name.trim().length < 2) {
    return c.json(
      { success: false, error: 'Name is required (at least 2 characters)' },
      400
    );
  }

  if (!body.useCase || body.useCase.trim().length < 10) {
    return c.json(
      { success: false, error: 'Use case description is required (at least 10 characters)' },
      400
    );
  }

  const result = await joinWaitlist({
    email: body.email,
    name: body.name,
    company: body.company,
    useCase: body.useCase,
    expectedVolume: body.expectedVolume,
    referralSource: body.referralSource,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    message: 'Successfully joined the waitlist! We\'ll notify you when your invite is ready.',
    position: result.entry?.id,
  }, 201);
});

/**
 * GET /beta/waitlist/status - Check waitlist status by email
 *
 * Query params:
 * - email: string (required)
 */
beta.get('/waitlist/status', async (c) => {
  const email = c.req.query('email');

  if (!email) {
    return c.json({ success: false, error: 'Email is required' }, 400);
  }

  const entry = await getWaitlistEntry(email);

  if (!entry) {
    return c.json({ success: false, error: 'Email not found on waitlist' }, 404);
  }

  // Only return safe fields
  return c.json({
    success: true,
    status: entry.status,
    joinedAt: entry.createdAt,
    invitedAt: entry.invitedAt,
    inviteCode: entry.status === 'invited' ? entry.inviteCode : null,
  });
});

/**
 * POST /beta/invite/validate - Validate an invite code
 *
 * Body:
 * - code: string (required)
 * - email: string (optional, for email-specific invites)
 */
beta.post('/invite/validate', async (c) => {
  const body = await c.req.json<{
    code?: string;
    email?: string;
  }>();

  if (!body.code) {
    return c.json({ success: false, error: 'Invite code is required' }, 400);
  }

  const result = await validateInviteCode(body.code, body.email);

  if (!result.valid) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    valid: true,
    expiresAt: result.invite?.expiresAt,
    remainingUses: result.invite
      ? result.invite.maxUses - result.invite.usedCount
      : 0,
  });
});

/**
 * POST /beta/invite/use - Use an invite code (during signup)
 *
 * Body:
 * - code: string (required)
 */
beta.post('/invite/use', async (c) => {
  const body = await c.req.json<{
    code?: string;
  }>();

  if (!body.code) {
    return c.json({ success: false, error: 'Invite code is required' }, 400);
  }

  // Validate first
  const validation = await validateInviteCode(body.code);
  if (!validation.valid) {
    return c.json({ success: false, error: validation.error }, 400);
  }

  // Use the code
  const result = await useInviteCode(body.code);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({ success: true, message: 'Invite code applied successfully' });
});

// =============================================================================
// Authenticated Endpoints (beta users)
// =============================================================================

/**
 * POST /beta/feedback - Submit feedback (requires auth)
 *
 * Body:
 * - category: 'bug' | 'feature_request' | 'documentation' | 'performance' | 'usability' | 'other'
 * - priority: 'low' | 'medium' | 'high' | 'critical' (optional, default: medium)
 * - title: string (required)
 * - description: string (required)
 * - context: { endpoint?, requestId?, errorCode?, browserInfo? } (optional)
 */
beta.post('/feedback', authMiddleware, async (c) => {
  const tenant = c.get('tenant');
  const body = await c.req.json<{
    category?: BetaFeedbackCategory;
    priority?: BetaFeedbackPriority;
    title?: string;
    description?: string;
    context?: {
      endpoint?: string;
      requestId?: string;
      errorCode?: string;
      browserInfo?: string;
    };
  }>();

  // Validate category
  const validCategories: BetaFeedbackCategory[] = [
    'bug', 'feature_request', 'documentation', 'performance', 'usability', 'other'
  ];
  if (!body.category || !validCategories.includes(body.category)) {
    return c.json(
      { success: false, error: `Category must be one of: ${validCategories.join(', ')}` },
      400
    );
  }

  // Validate title
  if (!body.title || body.title.trim().length < 5) {
    return c.json(
      { success: false, error: 'Title is required (at least 5 characters)' },
      400
    );
  }

  // Validate description
  if (!body.description || body.description.trim().length < 20) {
    return c.json(
      { success: false, error: 'Description is required (at least 20 characters)' },
      400
    );
  }

  const result = await submitFeedback({
    tenantId: tenant.id,
    category: body.category,
    priority: body.priority,
    title: body.title,
    description: body.description,
    context: body.context,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    message: 'Thank you for your feedback!',
    feedbackId: result.feedback?.id,
  }, 201);
});

/**
 * GET /beta/feedback - List user's own feedback (requires auth)
 */
const validFeedbackStatuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix'] as const;
type FeedbackStatus = typeof validFeedbackStatuses[number];

beta.get('/feedback', authMiddleware, async (c) => {
  const tenant = c.get('tenant');
  const query = c.req.query();

  // Validate status if provided
  let status: FeedbackStatus | undefined;
  if (query.status) {
    if (!validFeedbackStatuses.includes(query.status as FeedbackStatus)) {
      return c.json({
        success: false,
        error: `Invalid status. Must be one of: ${validFeedbackStatuses.join(', ')}`,
      }, 400);
    }
    status = query.status as FeedbackStatus;
  }

  const result = await listFeedback({
    tenantId: tenant.id,
    category: query.category as BetaFeedbackCategory | undefined,
    status,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
  });

  return c.json({
    success: true,
    feedback: result.feedback,
    total: result.total,
  });
});

// =============================================================================
// Admin Endpoints
// =============================================================================

const adminBeta = new Hono();
adminBeta.use('*', authMiddleware, requirePermission('admin'));

/**
 * GET /beta/admin/stats - Get beta program statistics
 */
adminBeta.get('/stats', async (c) => {
  const stats = await getBetaProgramStats();

  return c.json({ success: true, stats });
});

/**
 * GET /beta/admin/waitlist - List all waitlist entries
 */
adminBeta.get('/waitlist', async (c) => {
  const query = c.req.query();

  const result = await listWaitlist({
    status: query.status as BetaWaitlistStatus | undefined,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
  });

  return c.json({
    success: true,
    entries: result.entries,
    total: result.total,
  });
});

/**
 * POST /beta/admin/waitlist/:id/invite - Invite a waitlist entry
 */
adminBeta.post('/waitlist/:id/invite', async (c) => {
  const id = c.req.param('id');
  const tenant = c.get('tenant');
  const body = await c.req.json<{ expiresInDays?: number }>();

  const result = await inviteWaitlistEntry(id, tenant.id, {
    expiresInDays: body.expiresInDays,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    invite: result.invite,
    message: 'Waitlist entry invited successfully',
  });
});

/**
 * POST /beta/admin/waitlist/batch-invite - Invite multiple waitlist entries
 */
adminBeta.post('/waitlist/batch-invite', async (c) => {
  const tenant = c.get('tenant');
  const body = await c.req.json<{
    ids: string[];
    expiresInDays?: number;
  }>();

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ success: false, error: 'ids array is required' }, 400);
  }

  if (body.ids.length > 100) {
    return c.json({ success: false, error: 'Maximum 100 entries per batch' }, 400);
  }

  const result = await batchInviteWaitlist(body.ids, tenant.id, {
    expiresInDays: body.expiresInDays,
  });

  return c.json({
    success: result.success,
    invited: result.invited,
    failed: result.failed,
    errors: result.errors,
  });
});

/**
 * PATCH /beta/admin/waitlist/:id - Update waitlist entry status
 */
adminBeta.patch('/waitlist/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status: BetaWaitlistStatus }>();

  const validStatuses: BetaWaitlistStatus[] = ['pending', 'invited', 'joined', 'declined'];
  if (!body.status || !validStatuses.includes(body.status)) {
    return c.json(
      { success: false, error: `Status must be one of: ${validStatuses.join(', ')}` },
      400
    );
  }

  const result = await updateWaitlistStatus(id, body.status);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({ success: true, message: 'Status updated' });
});

/**
 * GET /beta/admin/invites - List all invite codes
 */
adminBeta.get('/invites', async (c) => {
  const query = c.req.query();

  const result = await listInvites({
    includeRevoked: query.includeRevoked === 'true',
    includeExpired: query.includeExpired === 'true',
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
  });

  return c.json({
    success: true,
    invites: result.invites,
    total: result.total,
  });
});

/**
 * POST /beta/admin/invites - Create a new invite code
 */
adminBeta.post('/invites', async (c) => {
  const tenant = c.get('tenant');
  const body = await c.req.json<{
    email?: string;
    maxUses?: number;
    expiresInDays?: number;
  }>();

  const result = await createInvite({
    email: body.email,
    maxUses: body.maxUses,
    expiresInDays: body.expiresInDays,
    createdBy: tenant.id,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    invite: result.invite,
  }, 201);
});

/**
 * DELETE /beta/admin/invites/:id - Revoke an invite code
 */
adminBeta.delete('/invites/:id', async (c) => {
  const id = c.req.param('id');

  const result = await revokeInvite(id);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({ success: true, message: 'Invite revoked' });
});

/**
 * GET /beta/admin/feedback - List all feedback
 */
adminBeta.get('/feedback', async (c) => {
  const query = c.req.query();

  // Validate status if provided
  let status: FeedbackStatus | undefined;
  if (query.status) {
    if (!validFeedbackStatuses.includes(query.status as FeedbackStatus)) {
      return c.json({
        success: false,
        error: `Invalid status. Must be one of: ${validFeedbackStatuses.join(', ')}`,
      }, 400);
    }
    status = query.status as FeedbackStatus;
  }

  const result = await listFeedback({
    tenantId: query.tenantId,
    category: query.category as BetaFeedbackCategory | undefined,
    status,
    priority: query.priority as BetaFeedbackPriority | undefined,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
  });

  return c.json({
    success: true,
    feedback: result.feedback,
    total: result.total,
  });
});

/**
 * GET /beta/admin/feedback/:id - Get feedback details
 */
adminBeta.get('/feedback/:id', async (c) => {
  const id = c.req.param('id');

  const feedback = await getFeedback(id);

  if (!feedback) {
    return c.json({ success: false, error: 'Feedback not found' }, 404);
  }

  return c.json({ success: true, feedback });
});

/**
 * PATCH /beta/admin/feedback/:id - Update feedback status
 */
adminBeta.patch('/feedback/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    status?: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'wont_fix';
    adminNotes?: string;
  }>();

  const validStatuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix'];
  if (body.status && !validStatuses.includes(body.status)) {
    return c.json(
      { success: false, error: `Status must be one of: ${validStatuses.join(', ')}` },
      400
    );
  }

  const result = await updateFeedbackStatus(id, body.status, body.adminNotes);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({ success: true, message: 'Feedback updated' });
});

// Mount admin routes
beta.route('/admin', adminBeta);
