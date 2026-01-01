#!/usr/bin/env npx tsx
/**
 * Stripe Setup Script
 *
 * Automatically creates all required Stripe resources:
 * - Product (Unbrowser API)
 * - Metered Price
 * - Billing Meter
 * - Webhook Endpoint
 *
 * Usage:
 *   1. Add STRIPE_SECRET_KEY to packages/api/.env
 *   2. Run: npm run setup:stripe -w packages/api
 *
 * The script will output the environment variables you need to add.
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from packages/api
config({ path: resolve(import.meta.dirname, '../.env') });

const PRODUCT_NAME = 'Unbrowser API';
const METER_EVENT_NAME = 'unbrowser_requests';

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error('Error: STRIPE_SECRET_KEY not found in packages/api/.env');
    console.error('');
    console.error('Add your Stripe secret key to packages/api/.env:');
    console.error('  STRIPE_SECRET_KEY=sk_test_... or sk_live_...');
    process.exit(1);
  }

  const isTestMode = secretKey.startsWith('sk_test_');
  console.log(`Setting up Stripe in ${isTestMode ? 'TEST' : 'LIVE'} mode...\n`);

  const stripe = new Stripe(secretKey);

  try {
    // 1. Create or find product
    console.log('1. Creating product...');
    let product: Stripe.Product;

    const existingProducts = await stripe.products.list({ limit: 100 });
    const existing = existingProducts.data.find(p => p.name === PRODUCT_NAME);

    if (existing) {
      console.log(`   Found existing product: ${existing.id}`);
      product = existing;
    } else {
      product = await stripe.products.create({
        name: PRODUCT_NAME,
        description: 'Intelligent web browsing API for AI agents. Usage-based pricing per request.',
        metadata: {
          created_by: 'setup-stripe.ts',
        },
      });
      console.log(`   Created product: ${product.id}`);
    }

    // 2. Create or find billing meter
    console.log('2. Creating billing meter...');
    let meter: Stripe.Billing.Meter;

    const existingMeters = await stripe.billing.meters.list({ limit: 100 });
    const existingMeter = existingMeters.data.find(m => m.event_name === METER_EVENT_NAME);

    if (existingMeter) {
      console.log(`   Found existing meter: ${existingMeter.id}`);
      meter = existingMeter;
    } else {
      meter = await stripe.billing.meters.create({
        display_name: 'Unbrowser API Requests',
        event_name: METER_EVENT_NAME,
        default_aggregation: {
          formula: 'sum',
        },
        customer_mapping: {
          type: 'by_id',
          event_payload_key: 'stripe_customer_id',
        },
        value_settings: {
          event_payload_key: 'value',
        },
      });
      console.log(`   Created meter: ${meter.id}`);
    }

    // 3. Create or find metered price
    console.log('3. Creating metered price...');
    let price: Stripe.Price;

    const existingPrices = await stripe.prices.list({
      product: product.id,
      limit: 100,
    });
    const existingPrice = existingPrices.data.find(
      p => p.recurring?.meter === meter.id && p.active
    );

    if (existingPrice) {
      console.log(`   Found existing price: ${existingPrice.id}`);
      price = existingPrice;
    } else {
      price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        recurring: {
          interval: 'month',
          usage_type: 'metered',
          meter: meter.id,
        },
        unit_amount: 1, // $0.01 per 10 requests (adjust as needed)
        billing_scheme: 'per_unit',
        metadata: {
          created_by: 'setup-stripe.ts',
        },
      });
      console.log(`   Created price: ${price.id} ($${(price.unit_amount || 0) / 100} per unit)`);
    }

    // 4. Create webhook endpoint
    console.log('4. Creating webhook endpoint...');

    // Get the webhook URL from environment or prompt
    let webhookUrl = process.env.APP_URL;
    if (!webhookUrl) {
      webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : 'https://api.unbrowser.ai';
    }
    webhookUrl = `${webhookUrl}/v1/billing/webhook`;

    const existingWebhooks = await stripe.webhookEndpoints.list({ limit: 100 });
    const existingWebhook = existingWebhooks.data.find(w => w.url === webhookUrl);

    let webhookSecret: string;

    if (existingWebhook) {
      console.log(`   Found existing webhook: ${existingWebhook.id}`);
      console.log(`   WARNING: Cannot retrieve existing webhook secret.`);
      console.log(`   If you need a new secret, delete the webhook in Stripe dashboard first.`);
      webhookSecret = 'whsec_... (use existing secret or recreate webhook)';
    } else {
      const webhook = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: [
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'invoice.paid',
          'invoice.payment_failed',
        ],
        metadata: {
          created_by: 'setup-stripe.ts',
        },
      });
      console.log(`   Created webhook: ${webhook.id}`);
      console.log(`   URL: ${webhookUrl}`);
      webhookSecret = webhook.secret || 'ERROR: No secret returned';
    }

    // Output results
    console.log('\n' + '='.repeat(60));
    console.log('SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nAdd these to your Railway environment variables:\n');
    console.log(`STRIPE_SECRET_KEY=${secretKey}`);
    console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
    console.log(`STRIPE_PRICE_ID=${price.id}`);
    console.log(`STRIPE_METER_EVENT_NAME=${METER_EVENT_NAME}`);
    console.log('\n' + '='.repeat(60));

    if (isTestMode) {
      console.log('\nNOTE: You are in TEST mode. Use Stripe test cards for testing:');
      console.log('  Success: 4242 4242 4242 4242');
      console.log('  Decline: 4000 0000 0000 0002');
    }

  } catch (error) {
    console.error('\nError during setup:', error);
    process.exit(1);
  }
}

main();
