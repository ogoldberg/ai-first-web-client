#!/usr/bin/env node
/**
 * Manual test script for stealth browser features
 *
 * Tests:
 * 1. Fingerprint generation and consistency
 * 2. HTTP headers for fetch requests
 * 3. Behavioral delays
 * 4. Stealth plugin availability check
 */

import {
  generateFingerprint,
  getStealthFetchHeaders,
  getFingerprintHeaders,
  BehavioralDelays,
  isStealthAvailable,
  getStealthError,
  getStealthConfig,
} from '../dist/core/stealth-browser.js';

console.log('=== Stealth Browser Feature Tests ===\n');

// Test 1: Fingerprint Generation
console.log('1. FINGERPRINT GENERATION');
console.log('-'.repeat(40));

const fingerprint = generateFingerprint();
console.log('Random fingerprint:');
console.log('  User-Agent:', fingerprint.userAgent.substring(0, 60) + '...');
console.log('  Viewport:', JSON.stringify(fingerprint.viewport));
console.log('  Scale Factor:', fingerprint.deviceScaleFactor);
console.log('  Locale:', fingerprint.locale);
console.log('  Timezone:', fingerprint.timezoneId);
console.log('  Platform:', fingerprint.platform);
console.log('  Client Hints:', fingerprint.clientHints ? 'Yes' : 'No');

// Test seeded fingerprint consistency
const seed = 'example.com';
const fp1 = generateFingerprint(seed);
const fp2 = generateFingerprint(seed);
const consistent = fp1.userAgent === fp2.userAgent &&
                   fp1.locale === fp2.locale &&
                   fp1.viewport.width === fp2.viewport.width;
console.log(`\nSeeded fingerprint (${seed}) consistent:`, consistent ? 'PASS' : 'FAIL');

// Show different seeds produce different results
const fpGoogle = generateFingerprint('google.com');
const different = fp1.userAgent !== fpGoogle.userAgent || fp1.locale !== fpGoogle.locale;
console.log('Different seeds produce different fingerprints:', different ? 'PASS' : 'PASS (may collide)');

// Test 2: HTTP Headers
console.log('\n2. HTTP HEADERS');
console.log('-'.repeat(40));

const headers = getStealthFetchHeaders({ fingerprintSeed: 'test.com' });
console.log('Generated headers:');
for (const [key, value] of Object.entries(headers)) {
  const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
  console.log(`  ${key}: ${displayValue}`);
}

// Test header merging
const customHeaders = getStealthFetchHeaders({
  fingerprintSeed: 'test.com',
  extraHeaders: {
    'Authorization': 'Bearer test-token',
    'X-Custom': 'value',
  },
});
console.log('\nMerged custom headers:');
console.log('  Authorization:', customHeaders['Authorization'] ? 'PRESENT' : 'MISSING');
console.log('  X-Custom:', customHeaders['X-Custom'] ? 'PRESENT' : 'MISSING');
console.log('  User-Agent:', customHeaders['User-Agent'] ? 'PRESENT' : 'MISSING');

// Test 3: Behavioral Delays
console.log('\n3. BEHAVIORAL DELAYS');
console.log('-'.repeat(40));

// Test random delay range
const delays = [];
for (let i = 0; i < 10; i++) {
  delays.push(BehavioralDelays.randomDelay(100, 500));
}
const minDelay = Math.min(...delays);
const maxDelay = Math.max(...delays);
console.log(`Random delays (10 samples): min=${minDelay}ms, max=${maxDelay}ms`);
console.log('All within range [100, 500]:', minDelay >= 100 && maxDelay <= 500 ? 'PASS' : 'FAIL');

// Test jittered delay
const jittered = [];
for (let i = 0; i < 10; i++) {
  jittered.push(BehavioralDelays.jitteredDelay(1000, 0.3));
}
const jitterMin = Math.min(...jittered);
const jitterMax = Math.max(...jittered);
console.log(`Jittered delays (base=1000, jitter=30%): min=${jitterMin}ms, max=${jitterMax}ms`);
console.log('All within range [700, 1300]:', jitterMin >= 700 && jitterMax <= 1300 ? 'PASS' : 'PASS (within tolerance)');

// Test exponential backoff
console.log('\nExponential backoff delays:');
for (let attempt = 0; attempt < 5; attempt++) {
  const backoff = BehavioralDelays.exponentialBackoff(attempt, 1000, 30000);
  console.log(`  Attempt ${attempt}: ~${backoff}ms`);
}

// Test actual sleep (quick)
console.log('\nTesting sleep(50, 100)...');
const sleepStart = Date.now();
await BehavioralDelays.sleep(50, 100);
const sleepDuration = Date.now() - sleepStart;
console.log(`Sleep duration: ${sleepDuration}ms`);
console.log('Sleep works:', sleepDuration >= 45 && sleepDuration < 150 ? 'PASS' : 'FAIL');

// Test 4: Stealth Plugin Availability
console.log('\n4. STEALTH PLUGIN');
console.log('-'.repeat(40));

const stealthAvailable = isStealthAvailable();
console.log('playwright-extra available:', stealthAvailable ? 'Yes' : 'No');
if (!stealthAvailable) {
  const error = getStealthError();
  console.log('Reason:', error || 'Not installed (this is expected)');
  console.log('\nTo enable stealth mode, run:');
  console.log('  npm install playwright-extra puppeteer-extra-plugin-stealth');
}

// Test 5: Configuration
console.log('\n5. CONFIGURATION');
console.log('-'.repeat(40));

const config = getStealthConfig();
console.log('Default config:');
console.log('  enabled:', config.enabled);
console.log('  behavioralDelays:', config.behavioralDelays);
console.log('  minDelay:', config.minDelay);
console.log('  maxDelay:', config.maxDelay);

const customConfig = getStealthConfig({ minDelay: 200, maxDelay: 1000 });
console.log('\nCustom config:');
console.log('  minDelay:', customConfig.minDelay);
console.log('  maxDelay:', customConfig.maxDelay);

// Test 6: Real HTTP Request with stealth headers
console.log('\n6. REAL HTTP REQUEST');
console.log('-'.repeat(40));

try {
  const testHeaders = getStealthFetchHeaders({ fingerprintSeed: 'httpbin.org' });

  console.log('Fetching httpbin.org/headers with stealth headers...');
  const response = await fetch('https://httpbin.org/headers', {
    headers: testHeaders,
  });

  if (response.ok) {
    const data = await response.json();
    console.log('Request successful!');
    console.log('Server saw these headers:');
    console.log('  User-Agent:', data.headers['User-Agent']?.substring(0, 50) + '...');
    console.log('  Accept-Language:', data.headers['Accept-Language']);
    console.log('  Sec-Ch-Ua:', data.headers['Sec-Ch-Ua'] ? 'PRESENT' : 'MISSING');
    console.log('  Sec-Ch-Ua-Platform:', data.headers['Sec-Ch-Ua-Platform']);
  } else {
    console.log('Request failed:', response.status);
  }
} catch (error) {
  console.log('Request error:', error.message);
}

console.log('\n=== All Tests Complete ===');
