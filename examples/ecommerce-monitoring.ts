/**
 * E-commerce Product Monitoring Example
 *
 * Demonstrates:
 * - Product data extraction
 * - Price monitoring with change detection
 * - Skill learning (selector patterns for product pages)
 * - Automated alerts when prices change
 *
 * Unbrowser learns the structure of product pages and creates
 * reusable skills for efficient future monitoring.
 */

import { createLLMBrowser } from '../src/sdk.js';

interface ProductData {
  url: string;
  name?: string;
  price?: number;
  currency?: string;
  availability?: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  rating?: number;
  reviewCount?: number;
  brand?: string;
  sku?: string;
  lastChecked: string;
  changed?: boolean;
  previousPrice?: number;
}

async function extractProductData(url: string): Promise<ProductData> {
  const browser = await createLLMBrowser();

  console.log(`\nFetching product: ${url}`);

  const result = await browser.browse(url, {
    contentType: 'product',
    checkForChanges: true, // Enable change detection
  });

  console.log(`Strategy: ${result.meta.strategy} (${result.meta.timing.total}ms)`);

  // Extract product data from structured content
  const structured = result.content.structured || {};

  const product: ProductData = {
    url,
    name: structured.name as string | undefined,
    price: structured.price as number | undefined,
    currency: (structured.currency as string | undefined) || 'USD',
    availability: (structured.availability as ProductData['availability']) || 'unknown',
    rating: structured.rating as number | undefined,
    reviewCount: structured.reviewCount as number | undefined,
    brand: structured.brand as string | undefined,
    sku: structured.sku as string | undefined,
    lastChecked: new Date().toISOString(),
  };

  return product;
}

async function monitorProduct(
  url: string,
  previousData?: ProductData
): Promise<{ current: ProductData; alerts: string[] }> {
  const current = await extractProductData(url);
  const alerts: string[] = [];

  if (previousData) {
    // Check for price changes
    if (current.price && previousData.price && current.price !== previousData.price) {
      const diff = current.price - previousData.price;
      const percent = ((diff / previousData.price) * 100).toFixed(1);

      if (diff < 0) {
        alerts.push(
          `🎉 Price dropped by ${current.currency}${Math.abs(diff).toFixed(2)} (${percent}%)`
        );
      } else {
        alerts.push(`⚠️  Price increased by ${current.currency}${diff.toFixed(2)} (+${percent}%)`);
      }

      current.changed = true;
      current.previousPrice = previousData.price;
    }

    // Check for availability changes
    if (current.availability !== previousData.availability) {
      if (current.availability === 'in_stock' && previousData.availability === 'out_of_stock') {
        alerts.push('✅ Back in stock!');
      } else if (current.availability === 'out_of_stock') {
        alerts.push('❌ Out of stock');
      }
    }
  }

  return { current, alerts };
}

function displayProductData(product: ProductData, alerts?: string[]) {
  console.log('\n' + '='.repeat(60));
  console.log('Product Information');
  console.log('='.repeat(60));

  if (product.name) {
    console.log(`\nName:          ${product.name}`);
  }

  if (product.brand) {
    console.log(`Brand:         ${product.brand}`);
  }

  if (product.price !== undefined) {
    const priceDisplay = `${product.currency}${product.price.toFixed(2)}`;
    if (product.previousPrice) {
      console.log(
        `Price:         ${priceDisplay} (was ${product.currency}${product.previousPrice.toFixed(2)})`
      );
    } else {
      console.log(`Price:         ${priceDisplay}`);
    }
  }

  if (product.availability) {
    const statusEmoji = {
      in_stock: '✅',
      out_of_stock: '❌',
      preorder: '📅',
      unknown: '❓',
    };
    console.log(`Availability:  ${statusEmoji[product.availability]} ${product.availability}`);
  }

  if (product.rating !== undefined) {
    const stars = '⭐'.repeat(Math.round(product.rating));
    console.log(`Rating:        ${stars} ${product.rating}/5`);
  }

  if (product.reviewCount !== undefined) {
    console.log(`Reviews:       ${product.reviewCount.toLocaleString()}`);
  }

  if (product.sku) {
    console.log(`SKU:           ${product.sku}`);
  }

  console.log(`Last Checked:  ${new Date(product.lastChecked).toLocaleString()}`);

  if (alerts && alerts.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('Alerts:');
    alerts.forEach(alert => console.log(`  ${alert}`));
    console.log('-'.repeat(60));
  }
}

// Example usage
async function main() {
  console.log('E-commerce Product Monitoring Example');
  console.log('Demonstrates product extraction and change detection\n');

  // Example product URLs (replace with real product pages)
  const productUrls = [
    // 'https://www.amazon.com/product/...',
    // 'https://www.ebay.com/itm/...',
    // Add real product URLs when testing
  ];

  if (productUrls.length === 0) {
    console.log('⚠️  No product URLs configured');
    console.log('\nTo run this example:');
    console.log('1. Add real product URLs to the productUrls array');
    console.log('2. Run: npx tsx examples/ecommerce-monitoring.ts');
    console.log('\nExample URLs:');
    console.log('- Amazon product pages');
    console.log('- eBay listings');
    console.log('- Any e-commerce product page');
    return;
  }

  // First pass: Extract initial data
  console.log('First pass: Extracting initial product data...');
  const initialData: ProductData[] = [];

  for (const url of productUrls) {
    try {
      const product = await extractProductData(url);
      initialData.push(product);
      displayProductData(product);
    } catch (error) {
      console.error(`Error extracting ${url}:`, error);
    }
  }

  // Wait a bit (in real use, this would be hours/days)
  console.log('\n\nWaiting 5 seconds before re-checking...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Second pass: Check for changes
  console.log('Second pass: Checking for changes...');

  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i];
    const previous = initialData[i];

    try {
      const { current, alerts } = await monitorProduct(url, previous);
      displayProductData(current, alerts);

      if (alerts.length === 0) {
        console.log('\n✓ No changes detected');
      }
    } catch (error) {
      console.error(`Error monitoring ${url}:`, error);
    }
  }

  console.log('\n\nKey Learning Points:');
  console.log('='.repeat(60));
  console.log('1. First Visit: Learns product page structure (selectors, patterns)');
  console.log('2. Creates Skill: Reusable extraction skill for this site');
  console.log('3. Future Visits: Uses learned skill for faster extraction');
  console.log('4. Change Detection: Automatically tracks changes over time');
  console.log('5. Alerts: Notifies on price drops or stock changes');
  console.log('\nSet up automated monitoring with cron jobs or scheduled tasks!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { extractProductData, monitorProduct };
