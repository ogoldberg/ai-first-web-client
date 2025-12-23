/**
 * MCP SDK Client Wrapper
 *
 * Provides a singleton SDK client instance for MCP tool handlers.
 * This module wraps the LLMBrowserClient from the SDK package and provides
 * additional MCP-specific functionality.
 *
 * Design principle: MCP handlers should be thin wrappers that delegate to SDK.
 */

import { BrowserManager } from '../core/browser-manager.js';
import { ContentExtractor } from '../utils/content-extractor.js';
import { ApiAnalyzer } from '../core/api-analyzer.js';
import { SessionManager } from '../core/session-manager.js';
import { SmartBrowser } from '../core/smart-browser.js';
import { LearningEngine } from '../core/learning-engine.js';
import { AuthWorkflow } from '../core/auth-workflow.js';
import { BrowseTool } from '../tools/browse-tool.js';
import { ApiCallTool } from '../tools/api-call-tool.js';
import type {
  SmartBrowseOptions,
  SmartBrowseResult,
  DomainCapabilitiesSummary,
  DomainKnowledgeSummary,
} from '../core/smart-browser.js';
import type { RenderTier } from '../core/tiered-fetcher.js';

/**
 * MCP SDK Client
 *
 * Singleton instance providing SDK access for MCP tool handlers.
 * Initializes all core components and provides typed access.
 */
export class McpSdkClient {
  private static instance: McpSdkClient | null = null;

  // Core components
  readonly browserManager: BrowserManager;
  readonly contentExtractor: ContentExtractor;
  readonly apiAnalyzer: ApiAnalyzer;
  readonly sessionManager: SessionManager;
  readonly learningEngine: LearningEngine;
  readonly smartBrowser: SmartBrowser;
  readonly authWorkflow: AuthWorkflow;

  // Legacy tools (for backward compatibility during migration)
  readonly browseTool: BrowseTool;
  readonly apiCallTool: ApiCallTool;

  private constructor() {
    // Initialize core components
    this.browserManager = new BrowserManager();
    this.contentExtractor = new ContentExtractor();
    this.apiAnalyzer = new ApiAnalyzer();
    this.sessionManager = new SessionManager('./sessions');
    this.learningEngine = new LearningEngine('./enhanced-knowledge-base.json');

    // Initialize smart browser
    this.smartBrowser = new SmartBrowser(
      this.browserManager,
      this.contentExtractor,
      this.apiAnalyzer,
      this.sessionManager
    );

    // Initialize auth workflow
    this.authWorkflow = new AuthWorkflow(this.sessionManager);

    // Initialize legacy tools
    this.browseTool = new BrowseTool(
      this.browserManager,
      this.contentExtractor,
      this.apiAnalyzer,
      this.sessionManager,
      this.learningEngine
    );
    this.apiCallTool = new ApiCallTool(this.browserManager);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): McpSdkClient {
    if (!McpSdkClient.instance) {
      McpSdkClient.instance = new McpSdkClient();
    }
    return McpSdkClient.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    McpSdkClient.instance = null;
  }

  // ==========================================================================
  // BROWSING METHODS
  // ==========================================================================

  /**
   * Smart browse with automatic learning and optimization
   */
  async browse(url: string, options: SmartBrowseOptions = {}): Promise<SmartBrowseResult> {
    return this.smartBrowser.browse(url, options);
  }

  /**
   * Batch browse multiple URLs
   */
  async batchBrowse(
    urls: string[],
    browseOptions: SmartBrowseOptions = {},
    batchOptions: {
      concurrency?: number;
      stopOnError?: boolean;
      continueOnRateLimit?: boolean;
      perUrlTimeoutMs?: number;
      totalTimeoutMs?: number;
    } = {}
  ) {
    return this.smartBrowser.batchBrowse(urls, browseOptions, batchOptions);
  }

  // ==========================================================================
  // DOMAIN INTELLIGENCE METHODS
  // ==========================================================================

  /**
   * Get domain intelligence summary
   */
  async getDomainIntelligence(domain: string) {
    return this.smartBrowser.getDomainIntelligence(domain);
  }

  /**
   * Get domain capabilities summary
   */
  async getDomainCapabilities(domain: string) {
    return this.smartBrowser.getDomainCapabilities(domain);
  }

  /**
   * Get both capabilities and intelligence for domain insights
   */
  async getDomainInsights(domain: string): Promise<{
    capabilities: DomainCapabilitiesSummary;
    knowledge: DomainKnowledgeSummary;
  }> {
    const [capabilitiesResult, intelligence] = await Promise.all([
      this.smartBrowser.getDomainCapabilities(domain),
      this.smartBrowser.getDomainIntelligence(domain),
    ]);

    return {
      capabilities: capabilitiesResult.capabilities,
      knowledge: {
        patternCount: intelligence.knownPatterns,
        successRate: intelligence.successRate,
        recommendedWaitStrategy: intelligence.recommendedWaitStrategy,
        recommendations: capabilitiesResult.recommendations.slice(0, 3),
      },
    };
  }

  // ==========================================================================
  // LEARNING METHODS
  // ==========================================================================

  /**
   * Get learning statistics
   */
  getLearningStats() {
    return this.smartBrowser.getLearningEngine().getStats();
  }

  /**
   * Get procedural memory (skills) statistics
   */
  getProceduralMemoryStats() {
    return this.smartBrowser.getProceduralMemoryStats();
  }

  /**
   * Find applicable skills for a URL
   */
  findApplicableSkills(url: string, topK: number = 3) {
    return this.smartBrowser.findApplicableSkills(url, topK);
  }

  // ==========================================================================
  // TIERED FETCHER METHODS
  // ==========================================================================

  /**
   * Get tiered fetcher statistics
   */
  getTieredFetcherStats() {
    return this.smartBrowser.getTieredFetcher().getStats();
  }

  /**
   * Set preferred tier for a domain
   */
  setDomainTier(domain: string, tier: RenderTier) {
    return this.smartBrowser.getTieredFetcher().setDomainPreference(domain, tier);
  }

  /**
   * Get domain tier preference
   */
  getDomainTierPreference(domain: string) {
    return this.smartBrowser.getTieredFetcher().getDomainPreference(domain);
  }

  // ==========================================================================
  // SESSION METHODS
  // ==========================================================================

  /**
   * Get session health for a domain
   */
  getSessionHealth(domain: string, profile: string = 'default') {
    return this.sessionManager.getSessionHealth(domain, profile);
  }

  /**
   * Get all session health
   */
  getAllSessionHealth() {
    return this.sessionManager.getAllSessionHealth();
  }

  /**
   * Save session for a domain
   */
  async saveSession(domain: string, profile: string = 'default') {
    const context = await this.browserManager.getContext(profile);
    return this.sessionManager.saveSession(domain, context, profile);
  }

  /**
   * List all sessions
   */
  listSessions() {
    return this.sessionManager.listSessions();
  }

  // ==========================================================================
  // SCREENSHOT & HAR METHODS
  // ==========================================================================

  /**
   * Capture screenshot
   */
  async captureScreenshot(url: string, options: {
    fullPage?: boolean;
    element?: string;
    waitForSelector?: string;
    sessionProfile?: string;
    width?: number;
    height?: number;
  } = {}) {
    return this.smartBrowser.captureScreenshot(url, options);
  }

  /**
   * Export HAR
   */
  async exportHar(url: string, options: {
    includeResponseBodies?: boolean;
    maxBodySize?: number;
    pageTitle?: string;
    waitForSelector?: string;
    sessionProfile?: string;
  } = {}) {
    return this.smartBrowser.exportHar(url, options);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    await this.browserManager.cleanup();
  }
}

/**
 * Get the singleton MCP SDK client instance
 */
export function getMcpSdkClient(): McpSdkClient {
  return McpSdkClient.getInstance();
}
