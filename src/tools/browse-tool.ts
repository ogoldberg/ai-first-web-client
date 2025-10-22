/**
 * Browse Tool - Main tool for browsing websites with intelligence
 */

import type { BrowseResult, BrowseOptions } from '../types/index.js';
import { BrowserManager } from '../core/browser-manager.js';
import { ContentExtractor } from '../utils/content-extractor.js';
import { ApiAnalyzer } from '../core/api-analyzer.js';
import { SessionManager } from '../core/session-manager.js';
import { KnowledgeBase } from '../core/knowledge-base.js';

export class BrowseTool {
  constructor(
    private browserManager: BrowserManager,
    private contentExtractor: ContentExtractor,
    private apiAnalyzer: ApiAnalyzer,
    private sessionManager: SessionManager,
    private knowledgeBase: KnowledgeBase
  ) {}

  async execute(url: string, options: BrowseOptions = {}): Promise<BrowseResult> {
    const startTime = Date.now();
    const profile = options.sessionProfile || 'default';

    // Check if we have a known pattern we can optimize
    const domain = new URL(url).hostname;
    const knownPattern = this.knowledgeBase.findPattern(url);

    if (knownPattern && knownPattern.canBypass && knownPattern.confidence === 'high') {
      console.error(`[Optimization] Found high-confidence pattern for ${domain}, but browsing anyway to verify`);
    }

    // Load session if available
    const context = await this.browserManager.getContext(profile);
    const hasSession = await this.sessionManager.loadSession(domain, context, profile);

    if (hasSession) {
      console.error(`[Session] Loaded saved session for ${domain}`);
    }

    // Browse the page
    const { page, network, console: consoleMessages } = await this.browserManager.browse(url, {
      captureNetwork: options.captureNetwork !== false,
      captureConsole: options.captureConsole !== false,
      waitFor: options.waitFor || 'networkidle',
      timeout: options.timeout || 30000,
      profile,
    });

    // Extract content
    const html = await page.content();
    const finalUrl = page.url();
    const extracted = this.contentExtractor.extract(html, finalUrl);

    // Analyze APIs
    const discoveredApis = this.apiAnalyzer.analyzeRequests(network);

    // Learn from this browsing session
    if (discoveredApis.length > 0) {
      this.knowledgeBase.learn(domain, discoveredApis);
      console.error(`[Learning] Discovered ${discoveredApis.length} API pattern(s) for ${domain}`);
    }

    // Close the page
    await page.close();

    const loadTime = Date.now() - startTime;

    return {
      url,
      title: extracted.title,
      content: {
        html,
        markdown: extracted.markdown,
        text: extracted.text,
      },
      network,
      console: consoleMessages,
      discoveredApis,
      metadata: {
        loadTime,
        timestamp: Date.now(),
        finalUrl,
      },
    };
  }
}
