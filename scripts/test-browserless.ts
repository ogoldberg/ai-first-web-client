/**
 * Test Browserless.io Integration
 *
 * Verifies that the Browserless connection is working correctly.
 * Requires BROWSERLESS_TOKEN to be set in .env
 */

import { createProvider, getProviderInfo } from '../src/core/browser-providers.js';
import { BrowserManager } from '../src/core/browser-manager.js';
import 'dotenv/config';

async function testBrowserlessIntegration() {
  console.log('=== Browserless Integration Test ===\n');

  // Step 1: Check provider configuration
  console.log('1. Checking provider configuration...');
  const providerInfo = getProviderInfo();
  const browserlessInfo = providerInfo.find(p => p.type === 'browserless');

  if (!browserlessInfo?.configured) {
    console.error('   BROWSERLESS_TOKEN is not configured in environment');
    console.log('   Set BROWSERLESS_TOKEN in your .env file');
    process.exit(1);
  }
  console.log('   BROWSERLESS_TOKEN is configured');

  // Step 2: Create and validate provider
  console.log('\n2. Creating Browserless provider...');
  const provider = createProvider({ type: 'browserless' });
  const validation = provider.validate();

  if (!validation.valid) {
    console.error(`   Provider validation failed: ${validation.error}`);
    process.exit(1);
  }
  console.log(`   Provider: ${provider.name}`);
  console.log(`   Capabilities: antiBot=${provider.capabilities.antiBot}, stealth=enabled`);

  // Step 3: Initialize BrowserManager with Browserless
  console.log('\n3. Connecting to Browserless...');
  const browserManager = new BrowserManager({
    headless: true,
    provider: { type: 'browserless' },
  });

  try {
    const startTime = Date.now();
    await browserManager.initialize();
    const connectionTime = Date.now() - startTime;
    console.log(`   Connected successfully in ${connectionTime}ms`);
    console.log(`   Using remote browser: ${browserManager.isUsingRemoteBrowser()}`);

    // Step 4: Test browsing a simple page
    console.log('\n4. Testing page navigation...');
    const testUrl = 'https://example.com';
    const browseStart = Date.now();

    const result = await browserManager.browse(testUrl, {
      waitFor: 'load',
      timeout: 30000,
    });

    const browseTime = Date.now() - browseStart;
    const title = await result.page.title();
    const content = await result.page.content();

    console.log(`   URL: ${testUrl}`);
    console.log(`   Title: ${title}`);
    console.log(`   Content length: ${content.length} chars`);
    console.log(`   Network requests captured: ${result.network.length}`);
    console.log(`   Page loaded in ${browseTime}ms`);

    // Step 5: Take a screenshot to verify rendering
    console.log('\n5. Taking screenshot...');
    const screenshot = await browserManager.screenshotBase64(result.page, { fullPage: false });
    console.log(`   Screenshot captured (${Math.round(screenshot.length / 1024)}KB base64)`);

    // Close the page
    await result.page.close();

    // Step 6: Test a more complex page
    console.log('\n6. Testing complex page (Hacker News)...');
    const complexUrl = 'https://news.ycombinator.com';
    const complexStart = Date.now();

    const complexResult = await browserManager.browse(complexUrl, {
      waitFor: 'networkidle',
      timeout: 30000,
    });

    const complexTime = Date.now() - complexStart;
    const complexTitle = await complexResult.page.title();
    const links = await complexResult.page.locator('a.titleline').count();

    console.log(`   URL: ${complexUrl}`);
    console.log(`   Title: ${complexTitle}`);
    console.log(`   Story links found: ${links}`);
    console.log(`   Page loaded in ${complexTime}ms`);

    await complexResult.page.close();

    console.log('\n=== All Tests Passed ===');
    console.log('\nBrowserless integration is working correctly!');

  } catch (error) {
    console.error('\n   Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    // Clean up
    console.log('\n7. Cleaning up...');
    await browserManager.cleanup();
    console.log('   Browser connection closed');
  }
}

testBrowserlessIntegration().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
