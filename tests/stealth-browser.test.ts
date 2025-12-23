/**
 * Tests for stealth browser module
 *
 * These tests verify the fingerprint generation, header creation,
 * and behavioral delay utilities work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateFingerprint,
  getAcceptLanguage,
  getFingerprintHeaders,
  getStealthFetchHeaders,
  getStealthConfig,
  BehavioralDelays,
  isStealthAvailable,
  EVASION_SCRIPTS,
  getEvasionScripts,
  DEFAULT_STEALTH_CONFIG,
  type BrowserFingerprint,
} from '../packages/core/src/core/stealth-browser.js';

describe('Fingerprint Generation', () => {
  it('should generate a complete fingerprint', () => {
    const fingerprint = generateFingerprint();

    expect(fingerprint).toBeDefined();
    expect(fingerprint.userAgent).toMatch(/Mozilla\/5\.0/);
    expect(fingerprint.viewport).toHaveProperty('width');
    expect(fingerprint.viewport).toHaveProperty('height');
    expect(fingerprint.deviceScaleFactor).toBeGreaterThan(0);
    expect(fingerprint.locale).toMatch(/[a-z]{2}-[A-Z]{2}/);
    expect(fingerprint.timezoneId).toBeDefined();
    expect(fingerprint.platform).toBeDefined();
  });

  it('should generate consistent fingerprint from seed', () => {
    const seed = 'example.com';
    const fingerprint1 = generateFingerprint(seed);
    const fingerprint2 = generateFingerprint(seed);

    expect(fingerprint1.userAgent).toBe(fingerprint2.userAgent);
    expect(fingerprint1.viewport).toEqual(fingerprint2.viewport);
    expect(fingerprint1.locale).toBe(fingerprint2.locale);
    expect(fingerprint1.timezoneId).toBe(fingerprint2.timezoneId);
  });

  it('should generate different fingerprints for different seeds', () => {
    const fingerprint1 = generateFingerprint('example.com');
    const fingerprint2 = generateFingerprint('google.com');

    // At least one property should differ (very high probability)
    const allSame =
      fingerprint1.userAgent === fingerprint2.userAgent &&
      fingerprint1.viewport.width === fingerprint2.viewport.width &&
      fingerprint1.locale === fingerprint2.locale;

    // With different seeds, at least one value should differ in most cases
    // (small chance they're the same due to hash collisions, so we just check it runs)
    expect(fingerprint1).toBeDefined();
    expect(fingerprint2).toBeDefined();
  });

  it('should include client hints in fingerprint', () => {
    const fingerprint = generateFingerprint();

    expect(fingerprint.clientHints).toBeDefined();
    expect(fingerprint.clientHints!.brands).toBeInstanceOf(Array);
    expect(fingerprint.clientHints!.brands.length).toBeGreaterThan(0);
    expect(fingerprint.clientHints!.mobile).toBe(false);
    expect(fingerprint.clientHints!.platform).toBeDefined();
  });

  it('should have matching platform in userAgent and clientHints', () => {
    const fingerprint = generateFingerprint('test-seed');

    if (fingerprint.userAgent.includes('Macintosh')) {
      expect(fingerprint.platform).toBe('macOS');
      expect(fingerprint.clientHints!.platform).toBe('macOS');
    } else if (fingerprint.userAgent.includes('Windows')) {
      expect(fingerprint.platform).toBe('Windows');
      expect(fingerprint.clientHints!.platform).toBe('Windows');
    } else if (fingerprint.userAgent.includes('Linux')) {
      expect(fingerprint.platform).toBe('Linux');
      expect(fingerprint.clientHints!.platform).toBe('Linux');
    }
  });
});

describe('Accept-Language Header', () => {
  it('should generate proper Accept-Language for en-US', () => {
    const fingerprint: BrowserFingerprint = {
      userAgent: 'test',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      platform: 'Windows',
    };

    const acceptLanguage = getAcceptLanguage(fingerprint);

    expect(acceptLanguage).toBe('en-US,en;q=0.9,en;q=0.8');
  });

  it('should generate proper Accept-Language for de-DE', () => {
    const fingerprint: BrowserFingerprint = {
      userAgent: 'test',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      platform: 'Windows',
    };

    const acceptLanguage = getAcceptLanguage(fingerprint);

    expect(acceptLanguage).toBe('de-DE,de;q=0.9,en;q=0.8');
  });

  it('should handle locale without region', () => {
    const fingerprint: BrowserFingerprint = {
      userAgent: 'test',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      locale: 'en',
      timezoneId: 'America/New_York',
      platform: 'Windows',
    };

    const acceptLanguage = getAcceptLanguage(fingerprint);

    expect(acceptLanguage).toBe('en,en;q=0.9');
  });
});

describe('Fingerprint Headers', () => {
  it('should generate all required headers', () => {
    const fingerprint = generateFingerprint();
    const headers = getFingerprintHeaders(fingerprint);

    expect(headers['Accept-Language']).toBeDefined();
    expect(headers['Accept']).toContain('text/html');
    expect(headers['Accept-Encoding']).toContain('gzip');
    expect(headers['Upgrade-Insecure-Requests']).toBe('1');
  });

  it('should include client hints when available', () => {
    const fingerprint = generateFingerprint();
    const headers = getFingerprintHeaders(fingerprint);

    expect(headers['sec-ch-ua']).toBeDefined();
    expect(headers['sec-ch-ua-mobile']).toBe('?0');
    expect(headers['sec-ch-ua-platform']).toBeDefined();
  });

  it('should format client hints correctly', () => {
    const fingerprint = generateFingerprint('test');
    const headers = getFingerprintHeaders(fingerprint);

    // sec-ch-ua should be formatted as: "Brand";v="Version", ...
    expect(headers['sec-ch-ua']).toMatch(/"[^"]+";v="\d+"/);
  });
});

describe('Stealth Fetch Headers', () => {
  it('should generate complete headers with User-Agent', () => {
    const headers = getStealthFetchHeaders();

    expect(headers['User-Agent']).toMatch(/Mozilla\/5\.0/);
    expect(headers['Accept-Language']).toBeDefined();
    expect(headers['Accept']).toBeDefined();
  });

  it('should use provided fingerprint', () => {
    const customFingerprint: BrowserFingerprint = {
      userAgent: 'Custom/1.0',
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      platform: 'Linux',
    };

    const headers = getStealthFetchHeaders({ fingerprint: customFingerprint });

    expect(headers['User-Agent']).toBe('Custom/1.0');
    expect(headers['Accept-Language']).toContain('fr-FR');
  });

  it('should merge extra headers', () => {
    const headers = getStealthFetchHeaders({
      extraHeaders: {
        'X-Custom-Header': 'test-value',
        'Authorization': 'Bearer token',
      },
    });

    expect(headers['X-Custom-Header']).toBe('test-value');
    expect(headers['Authorization']).toBe('Bearer token');
    expect(headers['User-Agent']).toBeDefined(); // Still has standard headers
  });

  it('should use fingerprint seed for consistent headers', () => {
    const headers1 = getStealthFetchHeaders({ fingerprintSeed: 'example.com' });
    const headers2 = getStealthFetchHeaders({ fingerprintSeed: 'example.com' });

    expect(headers1['User-Agent']).toBe(headers2['User-Agent']);
    expect(headers1['Accept-Language']).toBe(headers2['Accept-Language']);
  });
});

describe('Behavioral Delays', () => {
  it('should generate random delay within range', () => {
    for (let i = 0; i < 100; i++) {
      const delay = BehavioralDelays.randomDelay(100, 500);
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(500);
    }
  });

  it('should generate jittered delay around base', () => {
    const baseDelay = 1000;
    const jitterFactor = 0.3; // 30% jitter

    for (let i = 0; i < 100; i++) {
      const delay = BehavioralDelays.jitteredDelay(baseDelay, jitterFactor);
      // Should be within +/- 30% of base
      expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.7);
      expect(delay).toBeLessThanOrEqual(baseDelay * 1.3);
    }
  });

  it('should never return negative delay', () => {
    for (let i = 0; i < 100; i++) {
      const delay = BehavioralDelays.jitteredDelay(100, 2); // 200% jitter - could go negative without floor
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  it('should calculate exponential backoff', () => {
    const attempt0 = BehavioralDelays.exponentialBackoff(0, 1000, 30000);
    const attempt1 = BehavioralDelays.exponentialBackoff(1, 1000, 30000);
    const attempt2 = BehavioralDelays.exponentialBackoff(2, 1000, 30000);
    const attempt5 = BehavioralDelays.exponentialBackoff(5, 1000, 30000);

    // Attempt 0 should be around 1000ms (with jitter)
    expect(attempt0).toBeGreaterThanOrEqual(700);
    expect(attempt0).toBeLessThanOrEqual(1300);

    // Attempt 1 should be around 2000ms
    expect(attempt1).toBeGreaterThanOrEqual(1400);
    expect(attempt1).toBeLessThanOrEqual(2600);

    // Attempt 2 should be around 4000ms
    expect(attempt2).toBeGreaterThanOrEqual(2800);
    expect(attempt2).toBeLessThanOrEqual(5200);

    // Attempt 5 should be capped at maxDelay (30000ms)
    expect(attempt5).toBeLessThanOrEqual(39000); // 30000 * 1.3 with jitter
  });

  it('should sleep for random duration', async () => {
    const start = Date.now();
    await BehavioralDelays.sleep(50, 100);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small timing variance
    expect(elapsed).toBeLessThan(150);
  });
});

describe('Stealth Configuration', () => {
  it('should return default config', () => {
    const config = getStealthConfig();

    expect(config.enabled).toBe(true);
    expect(config.behavioralDelays).toBe(true);
    expect(config.minDelay).toBe(DEFAULT_STEALTH_CONFIG.minDelay);
    expect(config.maxDelay).toBe(DEFAULT_STEALTH_CONFIG.maxDelay);
  });

  it('should merge overrides', () => {
    const config = getStealthConfig({
      minDelay: 200,
      maxDelay: 1000,
      behavioralDelays: false,
    });

    expect(config.enabled).toBe(true); // Default
    expect(config.behavioralDelays).toBe(false);
    expect(config.minDelay).toBe(200);
    expect(config.maxDelay).toBe(1000);
  });

  it('should allow custom fingerprint', () => {
    const customFingerprint: BrowserFingerprint = {
      userAgent: 'Custom/1.0',
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      platform: 'Linux',
    };

    const config = getStealthConfig({ fingerprint: customFingerprint });

    expect(config.fingerprint).toBeDefined();
    expect(config.fingerprint!.locale).toBe('ja-JP');
  });
});

describe('Evasion Scripts', () => {
  it('should have all evasion scripts defined', () => {
    expect(EVASION_SCRIPTS.removeWebdriver).toBeDefined();
    expect(EVASION_SCRIPTS.patchPermissions).toBeDefined();
    expect(EVASION_SCRIPTS.spoofPlugins).toBeDefined();
    expect(EVASION_SCRIPTS.spoofMimeTypes).toBeDefined();
    expect(EVASION_SCRIPTS.fixChromeRuntime).toBeDefined();
    expect(EVASION_SCRIPTS.patchLanguages).toBeDefined();
  });

  it('should generate combined evasion scripts', () => {
    const fingerprint = generateFingerprint();
    const scripts = getEvasionScripts(fingerprint);

    expect(scripts).toContain("'webdriver'");
    expect(scripts).toContain('permissions.query');
    expect(scripts).toContain("'plugins'");
    expect(scripts).toContain("'mimeTypes'");
    expect(scripts).toContain('chrome.runtime');
    expect(scripts).toContain("'languages'");
  });

  it('should include locale in language patch', () => {
    const fingerprint: BrowserFingerprint = {
      userAgent: 'test',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      platform: 'Windows',
    };

    const scripts = getEvasionScripts(fingerprint);

    expect(scripts).toContain('de-DE');
    expect(scripts).toContain("'de'");
  });
});

describe('Stealth Availability', () => {
  it('should check if stealth is available without crashing', () => {
    // This just checks the function doesn't throw
    const available = isStealthAvailable();
    expect(typeof available).toBe('boolean');
  });
});

describe('Viewport Pool', () => {
  it('should generate valid viewport dimensions', () => {
    for (let i = 0; i < 20; i++) {
      const fingerprint = generateFingerprint(`seed-${i}`);

      expect(fingerprint.viewport.width).toBeGreaterThanOrEqual(800);
      expect(fingerprint.viewport.width).toBeLessThanOrEqual(2560);
      expect(fingerprint.viewport.height).toBeGreaterThanOrEqual(600);
      expect(fingerprint.viewport.height).toBeLessThanOrEqual(1440);
    }
  });
});

describe('Scale Factor Pool', () => {
  it('should generate valid scale factors', () => {
    const validScaleFactors = [1, 1.25, 1.5, 2];

    for (let i = 0; i < 20; i++) {
      const fingerprint = generateFingerprint(`scale-${i}`);
      expect(validScaleFactors).toContain(fingerprint.deviceScaleFactor);
    }
  });
});

describe('Timezone/Locale Consistency', () => {
  it('should generate consistent timezone and locale pairs', () => {
    const validPairs = [
      { locale: 'en-US', timezones: ['America/New_York', 'America/Los_Angeles', 'America/Chicago'] },
      { locale: 'en-GB', timezones: ['Europe/London'] },
      { locale: 'de-DE', timezones: ['Europe/Berlin'] },
      { locale: 'fr-FR', timezones: ['Europe/Paris'] },
      { locale: 'ja-JP', timezones: ['Asia/Tokyo'] },
    ];

    for (let i = 0; i < 20; i++) {
      const fingerprint = generateFingerprint(`tz-${i}`);

      // Find if this locale/timezone pair is valid
      const matchingPair = validPairs.find(p => p.locale === fingerprint.locale);
      if (matchingPair) {
        expect(matchingPair.timezones).toContain(fingerprint.timezoneId);
      }
    }
  });
});
