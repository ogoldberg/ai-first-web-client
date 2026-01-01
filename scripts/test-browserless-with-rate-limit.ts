/**
 * Test Browserless Integration with Rate Limiting
 *
 * Tests that rate limiting properly manages Browserless connections.
 */

import { BrowserManager } from '../src/core/browser-manager.js';
import { resetDefaultRateLimiter, getDefaultRateLimiter } from '../src/core/browserless-rate-limiter.js';
import 'dotenv/config';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBrowserlessWithRateLimiting() {
  console.log('=== Browserless Integration with Rate Limiting ===\n');

  // Reset rate limiter state
  resetDefaultRateLimiter();

  const rateLimiter = getDefaultRateLimiter();
  console.log('Rate limiter stats before test:');
  console.log(JSON.stringify(rateLimiter.getStats(), null, 2));
  console.log('');

  // Test 1: Sequential connections (should work)
  console.log('Test 1: Sequential browser sessions');
  console.log('-'.repeat(50));

  const testUrls = [
    'https://example.com',
    'https://news.ycombinator.com',
  ];

  for (const url of testUrls) {
    console.log(`\nBrowsing: ${url}`);

    const browserManager = new BrowserManager({
      headless: true,
      provider: { type: 'browserless' },
    });

    try {
      const startTime = Date.now();

      // This should acquire a slot, connect, browse, and release
      await browserManager.initialize();
      console.log(`  Connected in ${Date.now() - startTime}ms`);

      const result = await browserManager.browse(url, {
        waitFor: 'load',
        timeout: 30000,
      });

      const title = await result.page.title();
      const content = await result.page.content();
      console.log(`  Title: ${title}`);
      console.log(`  Content: ${content.length} chars`);

      await result.page.close();

    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : error}`);
    } finally {
      // This should release the slot
      await browserManager.cleanup();
      console.log('  Browser cleaned up');

      // Check stats after cleanup
      const stats = rateLimiter.getStats();
      console.log(`  Units used: ${stats.unitsUsed}, Active: ${stats.activeConnections}`);
    }

    // Small delay between requests
    await sleep(500);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Final rate limiter stats:');
  console.log(JSON.stringify(rateLimiter.getStats(), null, 2));

  console.log('\n=== Test Complete ===');
}

testBrowserlessWithRateLimiting().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
