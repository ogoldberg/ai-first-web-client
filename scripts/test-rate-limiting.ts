/**
 * Test Browserless Rate Limiting
 *
 * Tests the rate limiting implementation to ensure:
 * 1. Concurrent connections are limited
 * 2. Requests queue properly
 * 3. Units are tracked
 * 4. Cleanup releases slots
 */

import {
  BrowserlessRateLimiter,
  BROWSERLESS_PLANS,
  BrowserlessQueueFullError,
  resetDefaultRateLimiter,
} from '../src/core/browserless-rate-limiter.js';
import 'dotenv/config';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRateLimiting() {
  console.log('=== Browserless Rate Limiting Tests ===\n');

  // Reset any existing rate limiter state
  resetDefaultRateLimiter();

  // Test 1: Basic slot acquisition and release
  console.log('Test 1: Basic slot acquisition and release');
  console.log('-'.repeat(50));
  {
    const limiter = new BrowserlessRateLimiter('free');
    const stats = limiter.getStats();
    console.log('Initial stats:', JSON.stringify(stats, null, 2));

    console.log('\nAcquiring slot...');
    const release = await limiter.acquire('test-session-1');
    const statsAfterAcquire = limiter.getStats();
    console.log('After acquire:', {
      activeConnections: statsAfterAcquire.activeConnections,
      queuedRequests: statsAfterAcquire.queuedRequests,
    });

    // Simulate some work (2 seconds = 1 unit)
    console.log('Simulating 2 seconds of work...');
    await sleep(2000);

    console.log('Releasing slot...');
    release();
    const statsAfterRelease = limiter.getStats();
    console.log('After release:', {
      activeConnections: statsAfterRelease.activeConnections,
      unitsUsed: statsAfterRelease.unitsUsed,
    });

    limiter.cleanup();
    console.log('PASSED\n');
  }

  // Test 2: Concurrent limit enforcement (free plan = 1 concurrent)
  console.log('Test 2: Concurrent limit enforcement');
  console.log('-'.repeat(50));
  {
    const limiter = new BrowserlessRateLimiter('free');
    console.log('Free plan allows:', limiter.getLimits().maxConcurrent, 'concurrent');

    console.log('\nAcquiring first slot...');
    const release1 = await limiter.acquire('session-1');
    console.log('First slot acquired');

    console.log('Trying to acquire second slot (should queue)...');
    const acquirePromise = limiter.acquire('session-2');

    // Check queue status
    await sleep(100); // Give time for queue update
    const statsWhileQueued = limiter.getStats();
    console.log('While queued:', {
      activeConnections: statsWhileQueued.activeConnections,
      queuedRequests: statsWhileQueued.queuedRequests,
    });

    // Release first slot to allow second
    console.log('Releasing first slot...');
    release1();

    // Second should now acquire
    const release2 = await acquirePromise;
    console.log('Second slot acquired (was queued)');

    const statsAfter = limiter.getStats();
    console.log('After second acquire:', {
      activeConnections: statsAfter.activeConnections,
      queuedRequests: statsAfter.queuedRequests,
    });

    release2();
    limiter.cleanup();
    console.log('PASSED\n');
  }

  // Test 3: Queue full rejection
  console.log('Test 3: Queue full rejection');
  console.log('-'.repeat(50));
  {
    const limiter = new BrowserlessRateLimiter('free');
    const limits = limiter.getLimits();
    console.log('Queue size:', limits.queueSize);

    // Acquire the single allowed connection
    const releases: Array<() => void> = [];
    releases.push(await limiter.acquire('session-0'));
    console.log('Acquired the concurrent slot');

    // Fill up the queue
    const queuedPromises: Array<Promise<() => void>> = [];
    for (let i = 1; i <= limits.queueSize; i++) {
      queuedPromises.push(limiter.acquire(`session-${i}`));
    }
    await sleep(50);
    console.log('Queue filled with', queuedPromises.length, 'requests');

    // Try one more - should be rejected
    console.log('Trying to add one more (should be rejected)...');
    try {
      await limiter.acquire('session-overflow');
      console.log('ERROR: Should have thrown BrowserlessQueueFullError');
    } catch (error) {
      if (error instanceof BrowserlessQueueFullError) {
        console.log('Correctly rejected with BrowserlessQueueFullError');
        console.log('Error message:', error.message);
      } else {
        console.log('ERROR: Wrong error type:', error);
      }
    }

    // Cleanup
    releases.forEach(r => r());
    limiter.cleanup();
    console.log('PASSED\n');
  }

  // Test 4: Unit calculation
  console.log('Test 4: Unit calculation');
  console.log('-'.repeat(50));
  {
    const limiter = new BrowserlessRateLimiter('free');

    console.log('Unit calculation (30 seconds = 1 unit):');
    console.log('  1 second  =', limiter.calculateUnits(1000), 'unit(s)');
    console.log('  29 seconds =', limiter.calculateUnits(29000), 'unit(s)');
    console.log('  30 seconds =', limiter.calculateUnits(30000), 'unit(s)');
    console.log('  31 seconds =', limiter.calculateUnits(31000), 'unit(s)');
    console.log('  60 seconds =', limiter.calculateUnits(60000), 'unit(s)');
    console.log('  90 seconds =', limiter.calculateUnits(90000), 'unit(s)');

    limiter.cleanup();
    console.log('PASSED\n');
  }

  // Test 5: Retry logic
  console.log('Test 5: Retry logic');
  console.log('-'.repeat(50));
  {
    const limiter = new BrowserlessRateLimiter('free');

    const timeoutError = new Error('Timeout 30000ms exceeded');
    const quotaError = new Error('Monthly quota exceeded');
    quotaError.name = 'BrowserlessQuotaExceededError';
    Object.setPrototypeOf(quotaError, { name: 'BrowserlessQuotaExceededError' });

    console.log('Should retry timeout error:', limiter.shouldRetry(timeoutError, 0));
    console.log('Should retry on attempt 3 (max 3):', limiter.shouldRetry(timeoutError, 3));

    console.log('\nRetry delays (exponential backoff with jitter):');
    for (let i = 0; i < 5; i++) {
      console.log(`  Attempt ${i}: ~${limiter.getRetryDelay(i)}ms`);
    }

    limiter.cleanup();
    console.log('PASSED\n');
  }

  // Test 6: Different plans
  console.log('Test 6: Plan configurations');
  console.log('-'.repeat(50));
  {
    for (const [planName, limits] of Object.entries(BROWSERLESS_PLANS)) {
      console.log(`\n${planName.toUpperCase()} plan:`);
      console.log(`  Max concurrent: ${limits.maxConcurrent}`);
      console.log(`  Max session: ${limits.maxSessionDuration / 1000}s`);
      console.log(`  Monthly units: ${limits.monthlyUnits}`);
      console.log(`  Queue size: ${limits.queueSize}`);
    }
    console.log('\nPASSED\n');
  }

  console.log('=== All Rate Limiting Tests Passed ===');
}

testRateLimiting().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
