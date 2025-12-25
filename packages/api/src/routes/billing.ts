/**
 * Billing Routes
 *
 * Handles Stripe billing integration:
 * - Webhook endpoint for Stripe events
 * - Usage export endpoint for tenants
 * - Subscription management endpoints
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  verifyWebhook,
  handleWebhookEvent,
  getCustomer,
  createCustomer,
  createSubscription,
  cancelSubscription,
  getUsageSummary,
  hasActiveSubscription,
  isStripeConfigured,
  reportUsage,
} from '../services/stripe.js';
import { exportUsage } from '../services/usage.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const billing = new Hono();

/**
 * SECURITY: Webhook Idempotency Tracker
 *
 * Prevents duplicate webhook processing which could cause:
 * - Double charging
 * - Duplicate record creation
 * - Inconsistent state
 *
 * Stripe may retry webhooks up to 3 days, so we track event IDs.
 * In production, this should be Redis-backed for persistence across restarts.
 */
interface ProcessedWebhook {
  eventId: string;
  processedAt: Date;
  eventType: string;
}

const processedWebhooks = new Map<string, ProcessedWebhook>();
const WEBHOOK_IDEMPOTENCY_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours (Stripe retries for up to 3 days)
const MAX_STORED_WEBHOOKS = 10000; // Limit memory usage

/**
 * Check if a webhook event has already been processed
 */
function isWebhookProcessed(eventId: string): boolean {
  const record = processedWebhooks.get(eventId);
  if (!record) return false;

  // Check if record is still within TTL
  const age = Date.now() - record.processedAt.getTime();
  if (age > WEBHOOK_IDEMPOTENCY_TTL_MS) {
    processedWebhooks.delete(eventId);
    return false;
  }

  return true;
}

/**
 * Mark a webhook event as processed
 */
function markWebhookProcessed(eventId: string, eventType: string): void {
  // Cleanup old entries if we're at capacity
  if (processedWebhooks.size >= MAX_STORED_WEBHOOKS) {
    const now = Date.now();
    for (const [id, record] of processedWebhooks) {
      if (now - record.processedAt.getTime() > WEBHOOK_IDEMPOTENCY_TTL_MS) {
        processedWebhooks.delete(id);
      }
    }

    // If still at capacity after cleanup, remove oldest entries
    if (processedWebhooks.size >= MAX_STORED_WEBHOOKS) {
      const entries = Array.from(processedWebhooks.entries());
      entries.sort((a, b) => a[1].processedAt.getTime() - b[1].processedAt.getTime());
      const toRemove = entries.slice(0, entries.length - MAX_STORED_WEBHOOKS + 1000);
      for (const [id] of toRemove) {
        processedWebhooks.delete(id);
      }
    }
  }

  processedWebhooks.set(eventId, {
    eventId,
    processedAt: new Date(),
    eventType,
  });
}

/**
 * Get webhook idempotency stats (for monitoring)
 */
export function getWebhookIdempotencyStats(): {
  totalStored: number;
  oldestEntry: Date | null;
} {
  let oldestEntry: Date | null = null;

  for (const record of processedWebhooks.values()) {
    if (!oldestEntry || record.processedAt < oldestEntry) {
      oldestEntry = record.processedAt;
    }
  }

  return {
    totalStored: processedWebhooks.size,
    oldestEntry,
  };
}

/**
 * Clear webhook idempotency store (for testing)
 */
export function clearWebhookIdempotencyStore(): void {
  processedWebhooks.clear();
}

// Error handler for billing routes (for standalone testing)
billing.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: {
          code: err.status === 400 ? 'BAD_REQUEST' : 'ERROR',
          message: err.message,
        },
      },
      err.status
    );
  }
  console.error('[Billing] Error:', err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred',
      },
    },
    500
  );
});

/**
 * POST /billing/webhook
 * Stripe webhook endpoint
 * No authentication - uses Stripe signature verification
 *
 * SECURITY: Implements idempotency to prevent duplicate processing
 */
billing.post('/webhook', async (c) => {
  if (!isStripeConfigured()) {
    return c.json({ error: 'Billing not configured' }, 503);
  }

  // Get raw body for signature verification
  const payload = await c.req.text();
  const signature = c.req.header('stripe-signature');

  if (!signature) {
    throw new HTTPException(400, { message: 'Missing Stripe signature' });
  }

  const event = await verifyWebhook(payload, signature);
  if (!event) {
    throw new HTTPException(400, { message: 'Invalid webhook signature' });
  }

  // SECURITY: Check if this event has already been processed (idempotency)
  if (isWebhookProcessed(event.id)) {
    // Return 200 to prevent Stripe retries, but indicate it was a duplicate
    return c.json({
      received: true,
      handled: false,
      duplicate: true,
      event: event.type,
      message: 'Event already processed',
    });
  }

  const result = await handleWebhookEvent(event);

  // Mark as processed AFTER successful handling to ensure we don't
  // mark failed events as processed (they should be retried)
  if (result.handled && !result.error) {
    markWebhookProcessed(event.id, event.type);
  }

  return c.json({
    received: true,
    handled: result.handled,
    event: result.event,
    ...(result.error && { error: result.error }),
  });
});

// Protected routes require authentication
billing.use('/usage/*', authMiddleware);
billing.use('/subscription/*', authMiddleware);

/**
 * GET /billing/usage
 * Get usage for current billing period
 */
billing.get('/usage', authMiddleware, async (c) => {
  const tenant = c.get('tenant');
  if (!tenant) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  // Get Stripe usage summary if available
  const stripeSummary = await getUsageSummary(tenant.id);

  // Get local usage data for current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const localUsage = exportUsage(tenant.id, startOfMonth, endOfMonth);

  return c.json({
    success: true,
    data: {
      tenantId: tenant.id,
      period: stripeSummary
        ? {
            start: stripeSummary.periodStart.toISOString(),
            end: stripeSummary.periodEnd.toISOString(),
          }
        : localUsage.period,
      usage: {
        units: stripeSummary?.units || localUsage.totals.units,
        requests: localUsage.totals.requests,
        byTier: localUsage.byTier,
      },
      stripeConnected: !!stripeSummary,
    },
  });
});

/**
 * GET /billing/usage/export
 * Export usage data for a date range
 */
billing.get('/usage/export', authMiddleware, async (c) => {
  const tenant = c.get('tenant');
  if (!tenant) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const startDate = c.req.query('start');
  const endDate = c.req.query('end');

  if (!startDate || !endDate) {
    throw new HTTPException(400, { message: 'start and end date parameters required' });
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new HTTPException(400, { message: 'Invalid date format. Use YYYY-MM-DD' });
  }

  const usage = exportUsage(tenant.id, startDate, endDate);

  return c.json({
    success: true,
    data: usage,
  });
});

/**
 * POST /billing/usage/report
 * Manually report usage to Stripe
 * Admin endpoint - requires admin permission
 */
billing.post('/usage/report', authMiddleware, requirePermission('admin'), async (c) => {
  if (!isStripeConfigured()) {
    return c.json({ error: 'Billing not configured' }, 503);
  }

  const body = await c.req.json<{ tenantId: string; units: number }>();

  if (!body.tenantId || typeof body.units !== 'number') {
    throw new HTTPException(400, { message: 'tenantId and units required' });
  }

  const success = await reportUsage(body.tenantId, body.units);

  return c.json({
    success,
    message: success ? 'Usage reported to Stripe' : 'Failed to report usage',
  });
});

/**
 * GET /billing/subscription
 * Get subscription status for tenant
 */
billing.get('/subscription', authMiddleware, async (c) => {
  const tenant = c.get('tenant');
  if (!tenant) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  if (!isStripeConfigured()) {
    return c.json({
      success: true,
      data: {
        tenantId: tenant.id,
        plan: tenant.plan,
        stripeConnected: false,
        subscription: null,
      },
    });
  }

  const customer = await getCustomer(tenant.id);
  const isActive = await hasActiveSubscription(tenant.id);

  return c.json({
    success: true,
    data: {
      tenantId: tenant.id,
      plan: tenant.plan,
      stripeConnected: !!customer,
      subscription: customer
        ? {
            id: customer.subscriptionId,
            status: customer.subscriptionStatus,
            currentPeriodStart: customer.currentPeriodStart?.toISOString(),
            currentPeriodEnd: customer.currentPeriodEnd?.toISOString(),
            isActive,
          }
        : null,
    },
  });
});

/**
 * POST /billing/subscription
 * Create a subscription for tenant
 * Admin endpoint
 */
billing.post('/subscription', authMiddleware, requirePermission('admin'), async (c) => {
  if (!isStripeConfigured()) {
    throw new HTTPException(503, { message: 'Billing not configured' });
  }

  const body = await c.req.json<{ tenantId: string; email: string; name: string; priceId?: string }>();

  if (!body.tenantId || !body.email || !body.name) {
    throw new HTTPException(400, { message: 'tenantId, email, and name required' });
  }

  // Create or get customer
  let customer = await getCustomer(body.tenantId);
  if (!customer) {
    customer = await createCustomer(body.tenantId, body.email, body.name);
    if (!customer) {
      throw new HTTPException(500, { message: 'Failed to create Stripe customer' });
    }
  }

  // Create subscription
  const subscription = await createSubscription(body.tenantId, body.priceId);
  if (!subscription) {
    throw new HTTPException(500, { message: 'Failed to create subscription' });
  }

  return c.json({
    success: true,
    data: {
      customerId: subscription.customerId,
      subscriptionId: subscription.subscriptionId,
      status: subscription.subscriptionStatus,
    },
  });
});

/**
 * DELETE /billing/subscription
 * Cancel subscription for tenant
 * Admin endpoint
 */
billing.delete('/subscription', authMiddleware, requirePermission('admin'), async (c) => {
  if (!isStripeConfigured()) {
    throw new HTTPException(503, { message: 'Billing not configured' });
  }

  const body = await c.req.json<{ tenantId: string; immediate?: boolean }>();

  if (!body.tenantId) {
    throw new HTTPException(400, { message: 'tenantId required' });
  }

  const success = await cancelSubscription(body.tenantId, !body.immediate);

  if (!success) {
    throw new HTTPException(500, { message: 'Failed to cancel subscription' });
  }

  return c.json({
    success: true,
    message: body.immediate
      ? 'Subscription cancelled immediately'
      : 'Subscription will cancel at end of billing period',
  });
});

/**
 * GET /billing/status
 * Get billing system status (public)
 */
billing.get('/status', (c) => {
  return c.json({
    configured: isStripeConfigured(),
    features: {
      meteredBilling: isStripeConfigured(),
      subscriptions: isStripeConfigured(),
      webhooks: isStripeConfigured() && !!process.env.STRIPE_WEBHOOK_SECRET,
    },
  });
});

export { billing };
