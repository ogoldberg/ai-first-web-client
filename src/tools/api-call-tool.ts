/**
 * API Call Tool - Execute direct API calls with inherited authentication
 */

import type { ApiCallOptions } from '../types/index.js';
import { BrowserManager } from '../core/browser-manager.js';

export class ApiCallTool {
  constructor(private browserManager: BrowserManager) {}

  async execute(
    url: string,
    options: ApiCallOptions = {}
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: any;
    metadata: {
      duration: number;
      method: string;
    };
  }> {
    const startTime = Date.now();
    const method = options.method || 'GET';
    const profile = options.sessionProfile || 'default';

    // Get browser context (to inherit auth)
    const context = await this.browserManager.getContext(profile);
    const page = await context.newPage();

    try {
      // Make API call through browser context (inherits cookies)
      const response = await page.evaluate(
        async ({ url, method, headers, body }) => {
          const options: RequestInit = {
            method,
            headers: headers || {},
          };

          if (body) {
            options.body = typeof body === 'string' ? body : JSON.stringify(body);
            if (!options.headers) options.headers = {};
            (options.headers as any)['Content-Type'] = 'application/json';
          }

          const res = await fetch(url, options);
          const text = await res.text();

          let parsedBody;
          try {
            parsedBody = JSON.parse(text);
          } catch {
            parsedBody = text;
          }

          return {
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body: parsedBody,
          };
        },
        {
          url,
          method,
          headers: options.headers,
          body: options.body,
        }
      );

      await page.close();

      return {
        ...response,
        metadata: {
          duration: Date.now() - startTime,
          method,
        },
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  }
}
