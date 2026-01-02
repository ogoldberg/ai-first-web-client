#!/usr/bin/env node
/**
 * Test stealth headers against real bot detection services
 *
 * Tests against:
 * 1. Bot detection test sites (nowsecure, sannysoft, etc.)
 * 2. Cloudflare-protected sites
 * 3. Common protected APIs
 *
 * NOTE: This script tests internal APIs from the local MCP server package (llm-browser).
 * These functions are NOT exported by the cloud SDK (unbrowser-core) as they are
 * implementation details of the server-side intelligence.
 */

import {
  getStealthFetchHeaders,
  generateFingerprint,
} from '../dist/core/stealth-browser.js';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

function log(status, message, details = '') {
  const icons = {
    pass: `${COLORS.green}PASS${COLORS.reset}`,
    fail: `${COLORS.red}FAIL${COLORS.reset}`,
    warn: `${COLORS.yellow}WARN${COLORS.reset}`,
    info: `${COLORS.blue}INFO${COLORS.reset}`,
  };
  console.log(`[${icons[status]}] ${message}${details ? ` ${COLORS.dim}${details}${COLORS.reset}` : ''}`);
}

async function testSite(name, url, options = {}) {
  const {
    checkFor = null,           // String to check for in response
    checkAgainst = null,       // String that indicates bot detection
    expectStatus = 200,
    seed = new URL(url).hostname,
    useStealth = true,
  } = options;

  const headers = useStealth
    ? getStealthFetchHeaders({ fingerprintSeed: seed })
    : {};

  console.log(`\n--- Testing: ${name} ${useStealth ? '(with stealth)' : '(NO stealth)'} ---`);
  console.log(`URL: ${url}`);
  if (useStealth) {
    console.log(`User-Agent: ${headers['User-Agent'].substring(0, 60)}...`);
  } else {
    console.log(`User-Agent: (default Node.js)`);
  }

  try {
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
    });

    const status = response.status;
    const contentType = response.headers.get('content-type') || '';

    // Check status
    if (status === expectStatus) {
      log('pass', `Status: ${status}`);
    } else if (status === 403 || status === 503) {
      log('fail', `Status: ${status}`, '(likely bot detection)');
      return { success: false, blocked: true, status };
    } else {
      log('warn', `Status: ${status}`, `(expected ${expectStatus})`);
    }

    // Check for Cloudflare challenge
    const cfRay = response.headers.get('cf-ray');
    const cfCacheStatus = response.headers.get('cf-cache-status');
    if (cfRay) {
      log('info', 'Cloudflare detected', `CF-Ray: ${cfRay}`);
    }

    // Read body for content checks
    let body = '';
    if (contentType.includes('text') || contentType.includes('json') || contentType.includes('html')) {
      body = await response.text();

      // Check for Cloudflare challenge page
      if (body.includes('Just a moment...') || body.includes('Checking your browser')) {
        log('fail', 'Cloudflare challenge page detected');
        return { success: false, blocked: true, cloudflare: true };
      }

      // Check for bot detection indicators
      if (checkAgainst && body.includes(checkAgainst)) {
        log('fail', `Bot detection triggered`, `(found: "${checkAgainst.substring(0, 30)}...")`);
        return { success: false, blocked: true };
      }

      // Check for expected content
      if (checkFor) {
        if (body.includes(checkFor)) {
          log('pass', `Expected content found`, `("${checkFor.substring(0, 30)}...")`);
        } else {
          log('warn', `Expected content NOT found`, `("${checkFor.substring(0, 30)}...")`);
        }
      }

      // Show snippet of response
      const snippet = body.substring(0, 200).replace(/\s+/g, ' ').trim();
      console.log(`${COLORS.dim}Response preview: ${snippet}...${COLORS.reset}`);
    }

    return { success: true, blocked: false, status, hasCloudflare: !!cfRay };

  } catch (error) {
    log('fail', `Request error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function compareStealthVsNone(name, url, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`COMPARISON: ${name}`);
  console.log('='.repeat(60));

  const withoutStealth = await testSite(name, url, { ...options, useStealth: false });
  const withStealth = await testSite(name, url, { ...options, useStealth: true });

  console.log(`\nComparison result:`);
  if (!withoutStealth.success && withStealth.success) {
    log('pass', 'Stealth headers HELPED - blocked without, passed with!');
    return { improved: true };
  } else if (withoutStealth.success && withStealth.success) {
    log('info', 'Both passed - site has minimal bot detection');
    return { improved: false, bothPass: true };
  } else if (!withoutStealth.success && !withStealth.success) {
    log('warn', 'Both failed - site has aggressive protection (needs full browser or IP change)');
    return { improved: false, bothFail: true };
  } else {
    log('fail', 'Stealth made it worse? Unusual case.');
    return { improved: false, worse: true };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('BOT DETECTION EVASION TESTS');
  console.log('='.repeat(60));
  console.log('Testing stealth headers against real bot protection...\n');

  const fingerprint = generateFingerprint();
  console.log('Test fingerprint:');
  console.log(`  User-Agent: ${fingerprint.userAgent.substring(0, 50)}...`);
  console.log(`  Platform: ${fingerprint.platform}`);
  console.log(`  Locale: ${fingerprint.locale}`);
  console.log(`  Viewport: ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);

  const results = [];

  // Test 1: Bot detection test sites
  console.log('\n' + '='.repeat(60));
  console.log('TEST GROUP 1: Bot Detection Test Sites');
  console.log('='.repeat(60));

  // These sites are specifically designed to test bot detection
  results.push(await testSite(
    'CreepJS (fingerprint test)',
    'https://abrahamjuliot.github.io/creepjs/',
    { checkFor: 'CreepJS' }
  ));

  // Test 2: Common Cloudflare-protected sites
  console.log('\n' + '='.repeat(60));
  console.log('TEST GROUP 2: Cloudflare-Protected Sites');
  console.log('='.repeat(60));

  // Discord uses Cloudflare
  results.push(await testSite(
    'Discord (Cloudflare)',
    'https://discord.com/',
    { checkFor: 'Discord' }
  ));

  // Cloudflare's own site
  results.push(await testSite(
    'Cloudflare Blog',
    'https://blog.cloudflare.com/',
    { checkFor: 'Cloudflare' }
  ));

  // Test 3: E-commerce sites (often heavily protected)
  console.log('\n' + '='.repeat(60));
  console.log('TEST GROUP 3: E-commerce Sites');
  console.log('='.repeat(60));

  results.push(await testSite(
    'Nike (common target)',
    'https://www.nike.com/',
    { checkFor: 'Nike' }
  ));

  results.push(await testSite(
    'Best Buy',
    'https://www.bestbuy.com/',
    { checkFor: 'Best Buy' }
  ));

  // Test 4: API endpoints that often check for bots
  console.log('\n' + '='.repeat(60));
  console.log('TEST GROUP 4: API-like Endpoints');
  console.log('='.repeat(60));

  results.push(await testSite(
    'GitHub API (public)',
    'https://api.github.com/',
    { checkFor: 'current_user_url' }
  ));

  results.push(await testSite(
    'Reddit (JSON)',
    'https://www.reddit.com/r/programming.json?limit=1',
    { checkFor: 'data' }
  ));

  // Test 5: News sites (often use bot protection)
  console.log('\n' + '='.repeat(60));
  console.log('TEST GROUP 5: News Sites');
  console.log('='.repeat(60));

  results.push(await testSite(
    'Reuters',
    'https://www.reuters.com/',
    { checkFor: 'Reuters' }
  ));

  results.push(await testSite(
    'Bloomberg',
    'https://www.bloomberg.com/',
    { checkFor: 'Bloomberg' }
  ));

  // Test 6: Comparison tests - sites that behave differently with/without stealth
  console.log('\n' + '='.repeat(60));
  console.log('TEST GROUP 6: With/Without Stealth Comparison');
  console.log('='.repeat(60));

  // Reddit is known to sometimes block default Node.js user-agent
  const redditComparison = await compareStealthVsNone(
    'Reddit API',
    'https://www.reddit.com/r/technology.json?limit=1',
    { checkFor: 'data' }
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success && !r.blocked).length;
  const blocked = results.filter(r => r.blocked).length;
  const errors = results.filter(r => r.error).length;
  const total = results.length;

  console.log(`\nResults: ${passed}/${total} passed`);
  console.log(`  - Passed: ${passed}`);
  console.log(`  - Blocked: ${blocked}`);
  console.log(`  - Errors: ${errors}`);

  if (blocked > 0) {
    console.log(`\n${COLORS.yellow}Note: Some sites still blocked. This is expected for:`);
    console.log('  - Sites with aggressive bot detection (DataDome, PerimeterX)');
    console.log('  - Sites requiring JS execution for challenge solving');
    console.log('  - Sites with IP-based blocking (datacenter IPs)');
    console.log(`${COLORS.reset}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('LIMITATIONS REMINDER');
  console.log('='.repeat(60));
  console.log(`
Stealth headers help with basic bot detection but CANNOT bypass:
1. JavaScript challenges (require full browser)
2. CAPTCHAs (require human solving)
3. IP reputation checks (datacenter IPs often blocked)
4. Advanced fingerprinting (canvas, WebGL, audio)

For these, you need:
- Full Playwright with stealth plugin (playwright-extra)
- Residential proxies
- CAPTCHA solving services
`);
}

main().catch(console.error);
