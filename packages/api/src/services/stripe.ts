/**
 * Stripe Billing Service
 *
 * Handles integration with Stripe for:
 * - Customer management (linked to tenants)
 * - Subscription management
 * - Usage-based metered billing
 * - Webhook event processing
 *
 * Configuration via environment variables:
 * - STRIPE_SECRET_KEY: Stripe API secret key
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret for verification
 * - STRIPE_PRICE_ID: Default metered price ID for usage billing
 */

// Dynamic import type for Stripe
type StripeClient = import('stripe').default;
type StripeEvent = import('stripe').Stripe.Event;
type StripeSubscription = import('stripe').Stripe.Subscription;
type StripeInvoice = import('stripe').Stripe.Invoice;
type StripeSubscriptionItem = import('stripe').Stripe.SubscriptionItem;

/** Stripe configuration */
export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
  priceId?: string;
}

/** Stripe customer data linked to tenant */
export interface StripeCustomer {
  customerId: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

/** Usage record for Stripe metering */
export interface UsageRecord {
  tenantId: string;
  subscriptionItemId: string;
  quantity: number;
  timestamp: number;
  action?: 'increment' | 'set';
}

/** Webhook event types we handle */
export type StripeWebhookEvent =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed';

/** Webhook handler result */
export interface WebhookResult {
  handled: boolean;
  event: string;
  customerId?: string;
  subscriptionId?: string;
  error?: string;
}

// Cached Stripe client
let stripeClient: StripeClient | null = null;
let stripeAvailable: boolean | null = null;
let lastError: string | undefined;

// In-memory store for tenant -> Stripe customer mapping
// In production, this would be persisted to database
const customerStore = new Map<string, StripeCustomer>();

/**
 * Get Stripe configuration from environment
 */
export function getStripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID,
  };
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Get or create the Stripe client
 */
async function getStripeClient(): Promise<StripeClient | null> {
  if (stripeClient !== null) {
    return stripeClient;
  }

  if (stripeAvailable === false) {
    return null;
  }

  const config = getStripeConfig();
  if (!config) {
    stripeAvailable = false;
    console.log('[Stripe] Not configured - billing disabled');
    return null;
  }

  try {
    const { default: Stripe } = await import('stripe');
    stripeClient = new Stripe(config.secretKey);
    stripeAvailable = true;
    console.log('[Stripe] Client initialized');
    return stripeClient;
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Unknown error';
    stripeAvailable = false;
    console.error('[Stripe] Failed to initialize:', lastError);
    return null;
  }
}

/**
 * Get Stripe connection status
 */
export function getStripeStatus(): { available: boolean; lastError?: string } {
  return {
    available: stripeAvailable ?? false,
    lastError,
  };
}

/**
 * Create a Stripe customer for a tenant
 */
export async function createCustomer(
  tenantId: string,
  email: string,
  name: string,
  metadata?: Record<string, string>
): Promise<StripeCustomer | null> {
  const stripe = await getStripeClient();
  if (!stripe) return null;

  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        tenantId,
        ...metadata,
      },
    });

    const stripeCustomer: StripeCustomer = {
      customerId: customer.id,
    };

    customerStore.set(tenantId, stripeCustomer);
    console.log(`[Stripe] Created customer ${customer.id} for tenant ${tenantId}`);
    return stripeCustomer;
  } catch (error) {
    console.error('[Stripe] Failed to create customer:', error);
    return null;
  }
}

/**
 * Get Stripe customer for a tenant
 */
export async function getCustomer(tenantId: string): Promise<StripeCustomer | null> {
  // Check cache first
  const cached = customerStore.get(tenantId);
  if (cached) return cached;

  const stripe = await getStripeClient();
  if (!stripe) return null;

  try {
    // Search for customer by tenant ID in metadata
    const customers = await stripe.customers.search({
      query: `metadata['tenantId']:'${tenantId}'`,
    });

    if (customers.data.length === 0) return null;

    const customer = customers.data[0];
    const stripeCustomer: StripeCustomer = {
      customerId: customer.id,
    };

    // Get subscription info if exists
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      stripeCustomer.subscriptionId = sub.id;
      stripeCustomer.subscriptionStatus = sub.status;
      // Get period from first subscription item
      const firstItem = sub.items.data[0];
      if (firstItem) {
        stripeCustomer.currentPeriodStart = new Date(firstItem.current_period_start * 1000);
        stripeCustomer.currentPeriodEnd = new Date(firstItem.current_period_end * 1000);
      }
    }

    customerStore.set(tenantId, stripeCustomer);
    return stripeCustomer;
  } catch (error) {
    console.error('[Stripe] Failed to get customer:', error);
    return null;
  }
}

/**
 * Create a subscription for a tenant
 */
export async function createSubscription(
  tenantId: string,
  priceId?: string
): Promise<StripeCustomer | null> {
  const stripe = await getStripeClient();
  if (!stripe) return null;

  const config = getStripeConfig();
  const effectivePriceId = priceId || config?.priceId;

  if (!effectivePriceId) {
    console.error('[Stripe] No price ID configured for subscription');
    return null;
  }

  const customer = await getCustomer(tenantId);
  if (!customer) {
    console.error(`[Stripe] No customer found for tenant ${tenantId}`);
    return null;
  }

  try {
    const subscription = await stripe.subscriptions.create({
      customer: customer.customerId,
      items: [
        {
          price: effectivePriceId,
        },
      ],
      metadata: {
        tenantId,
      },
    });

    // Get period from first subscription item
    const firstItem = subscription.items.data[0];
    const updatedCustomer: StripeCustomer = {
      ...customer,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : undefined,
      currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : undefined,
    };

    customerStore.set(tenantId, updatedCustomer);
    console.log(`[Stripe] Created subscription ${subscription.id} for tenant ${tenantId}`);
    return updatedCustomer;
  } catch (error) {
    console.error('[Stripe] Failed to create subscription:', error);
    return null;
  }
}

/**
 * Report usage to Stripe for metered billing
 * Uses the new Billing Meter Events API (Stripe API 2024+)
 *
 * Prerequisites:
 * - A meter must be configured in Stripe Dashboard
 * - STRIPE_METER_EVENT_NAME env var should be set to the meter's event name
 * - Customer must have a subscription with a metered price
 */
export async function reportUsage(
  tenantId: string,
  units: number,
  timestamp?: number
): Promise<boolean> {
  const stripe = await getStripeClient();
  if (!stripe) return false;

  const customer = await getCustomer(tenantId);
  if (!customer?.customerId) {
    console.warn(`[Stripe] No customer for tenant ${tenantId} - skipping usage report`);
    return false;
  }

  const meterEventName = process.env.STRIPE_METER_EVENT_NAME;
  if (!meterEventName) {
    console.warn('[Stripe] STRIPE_METER_EVENT_NAME not configured - skipping usage report');
    return false;
  }

  try {
    // Use the new Billing Meter Events API
    await stripe.billing.meterEvents.create({
      event_name: meterEventName,
      payload: {
        stripe_customer_id: customer.customerId,
        value: units.toString(),
      },
      timestamp: timestamp ? Math.floor(timestamp / 1000) : undefined,
    });

    console.log(
      `[Stripe] Reported ${units} units for tenant ${tenantId} (customer: ${customer.customerId})`
    );
    return true;
  } catch (error) {
    console.error('[Stripe] Failed to report usage:', error);
    return false;
  }
}

/**
 * Cancel a subscription for a tenant
 */
export async function cancelSubscription(
  tenantId: string,
  atPeriodEnd: boolean = true
): Promise<boolean> {
  const stripe = await getStripeClient();
  if (!stripe) return false;

  const customer = await getCustomer(tenantId);
  if (!customer?.subscriptionId) {
    console.warn(`[Stripe] No subscription to cancel for tenant ${tenantId}`);
    return false;
  }

  try {
    if (atPeriodEnd) {
      await stripe.subscriptions.update(customer.subscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      await stripe.subscriptions.cancel(customer.subscriptionId);
    }

    console.log(`[Stripe] Cancelled subscription for tenant ${tenantId}`);
    return true;
  } catch (error) {
    console.error('[Stripe] Failed to cancel subscription:', error);
    return false;
  }
}

/**
 * Verify and parse a Stripe webhook event
 */
export async function verifyWebhook(
  payload: string,
  signature: string
): Promise<StripeEvent | null> {
  const stripe = await getStripeClient();
  if (!stripe) return null;

  const config = getStripeConfig();
  if (!config?.webhookSecret) {
    console.error('[Stripe] Webhook secret not configured');
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
  } catch (error) {
    console.error('[Stripe] Webhook verification failed:', error);
    return null;
  }
}

/**
 * Handle a webhook event
 */
export async function handleWebhookEvent(event: StripeEvent): Promise<WebhookResult> {
  const result: WebhookResult = {
    handled: false,
    event: event.type,
  };

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as StripeSubscription;
      const tenantId = subscription.metadata?.tenantId;

      if (tenantId) {
        // Get period from first subscription item
        const firstItem = subscription.items.data[0];
        const stripeCustomer: StripeCustomer = {
          customerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : undefined,
          currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : undefined,
        };
        customerStore.set(tenantId, stripeCustomer);

        result.handled = true;
        result.customerId = stripeCustomer.customerId;
        result.subscriptionId = subscription.id;
        console.log(
          `[Stripe] Updated subscription ${subscription.id} for tenant ${tenantId}: ${subscription.status}`
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSubscription;
      const tenantId = subscription.metadata?.tenantId;

      if (tenantId) {
        const existing = customerStore.get(tenantId);
        if (existing) {
          existing.subscriptionId = undefined;
          existing.subscriptionStatus = 'canceled';
          customerStore.set(tenantId, existing);
        }

        result.handled = true;
        result.subscriptionId = subscription.id;
        console.log(`[Stripe] Subscription ${subscription.id} deleted for tenant ${tenantId}`);
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as StripeInvoice;
      result.handled = true;
      console.log(`[Stripe] Invoice ${invoice.id} paid: ${invoice.amount_paid / 100} USD`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as StripeInvoice;
      result.handled = true;
      result.error = 'Payment failed';
      console.error(`[Stripe] Invoice ${invoice.id} payment failed`);
      // TODO: Could trigger notification or suspend tenant here
      break;
    }

    default:
      // Unhandled event type
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }

  return result;
}

/**
 * Get usage summary for a tenant's current billing period
 * Returns the billing period dates from the subscription
 *
 * Note: With the new Billing Meters API, actual usage is tracked via meter events.
 * This function returns period info; for usage totals, use the local usage tracking service.
 */
export async function getUsageSummary(
  tenantId: string
): Promise<{ units: number; periodStart: Date; periodEnd: Date } | null> {
  const customer = await getCustomer(tenantId);
  if (!customer?.subscriptionId) return null;
  if (!customer.currentPeriodStart || !customer.currentPeriodEnd) return null;

  // Return period info from cached customer data
  // The actual usage is tracked locally and reported to Stripe via meter events
  return {
    units: 0, // Actual usage should be queried from local usage service
    periodStart: customer.currentPeriodStart,
    periodEnd: customer.currentPeriodEnd,
  };
}

/**
 * Clear cached customer data (for testing)
 */
export function clearCustomerCache(): void {
  customerStore.clear();
}

/**
 * Reset Stripe client (for testing)
 */
export function resetStripeClient(): void {
  stripeClient = null;
  stripeAvailable = null;
  lastError = undefined;
  customerStore.clear();
}

/**
 * Set a customer directly (for testing)
 */
export function setCustomer(tenantId: string, customer: StripeCustomer): void {
  customerStore.set(tenantId, customer);
}

/**
 * Check if tenant has active subscription
 */
export async function hasActiveSubscription(tenantId: string): Promise<boolean> {
  const customer = await getCustomer(tenantId);
  if (!customer?.subscriptionStatus) return false;

  return ['active', 'trialing'].includes(customer.subscriptionStatus);
}
