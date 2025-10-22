/**
 * Browser Manager - Handles Playwright browser lifecycle
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { NetworkRequest, ConsoleMessage } from '../types/index.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
      });
    }
  }

  async getContext(profile: string = 'default'): Promise<BrowserContext> {
    await this.initialize();

    if (!this.contexts.has(profile)) {
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      });
      this.contexts.set(profile, context);
    }

    return this.contexts.get(profile)!;
  }

  async browse(
    url: string,
    options: {
      captureNetwork?: boolean;
      captureConsole?: boolean;
      waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
      profile?: string;
    } = {}
  ): Promise<{
    page: Page;
    network: NetworkRequest[];
    console: ConsoleMessage[];
  }> {
    const context = await this.getContext(options.profile);
    const page = await context.newPage();

    const networkRequests: NetworkRequest[] = [];
    const consoleMessages: ConsoleMessage[] = [];

    // Network interception
    if (options.captureNetwork !== false) {
      const requestTiming = new Map<string, number>();

      page.on('request', (request) => {
        requestTiming.set(request.url(), Date.now());
      });

      page.on('response', async (response) => {
        const startTime = requestTiming.get(response.url()) || Date.now();
        const duration = Date.now() - startTime;

        let responseBody: any;
        const contentType = response.headers()['content-type'] || '';

        // Capture JSON responses
        if (contentType.includes('application/json')) {
          try {
            responseBody = await response.json();
          } catch (e) {
            // Failed to parse JSON
          }
        }

        networkRequests.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          headers: response.headers(),
          requestHeaders: response.request().headers(),
          responseBody,
          contentType,
          timestamp: startTime,
          duration,
        });
      });
    }

    // Console capture
    if (options.captureConsole !== false) {
      page.on('console', (msg) => {
        consoleMessages.push({
          type: msg.type() as any,
          text: msg.text(),
          timestamp: Date.now(),
          location: msg.location() ? {
            url: msg.location().url,
            lineNumber: msg.location().lineNumber,
            columnNumber: msg.location().columnNumber,
          } : undefined,
        });
      });
    }

    // Navigate to URL
    const waitUntil = options.waitFor || 'networkidle';
    await page.goto(url, {
      waitUntil,
      timeout: options.timeout || 30000,
    });

    // Give JavaScript a moment to execute
    await page.waitForTimeout(1000);

    return {
      page,
      network: networkRequests,
      console: consoleMessages,
    };
  }

  async cleanup(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close();
    }
    this.contexts.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
