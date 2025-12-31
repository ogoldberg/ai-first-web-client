/**
 * Browser Service
 *
 * Manages the LLMBrowserClient instance for the API server.
 * Provides a singleton client that's shared across all requests.
 */

import { createLLMBrowser, type LLMBrowserClient, type LLMBrowserConfig } from 'unbrowser/sdk';

let browserClient: LLMBrowserClient | null = null;
let initializationPromise: Promise<LLMBrowserClient> | null = null;

/**
 * Get the browser client configuration from environment
 */
function getConfig(): LLMBrowserConfig {
  return {
    sessionsDir: process.env.SESSIONS_DIR || './sessions',
    learningEnginePath: process.env.LEARNING_ENGINE_PATH || './enhanced-knowledge-base.json',
    enableProceduralMemory: process.env.DISABLE_PROCEDURAL_MEMORY !== 'true',
    enableLearning: process.env.DISABLE_LEARNING !== 'true',
    browser: {
      headless: true,
    },
  };
}

/**
 * Get or create the browser client
 * Uses singleton pattern with async initialization
 */
export async function getBrowserClient(): Promise<LLMBrowserClient> {
  // Return existing client if available
  if (browserClient) {
    return browserClient;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = createLLMBrowser(getConfig());

  try {
    browserClient = await initializationPromise;
    return browserClient;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

/**
 * Clean up the browser client
 * Call this on server shutdown
 */
export async function cleanupBrowserClient(): Promise<void> {
  if (browserClient) {
    await browserClient.cleanup();
    browserClient = null;
    initializationPromise = null;
  }
}

/**
 * Check if the browser client is initialized
 */
export function isBrowserClientInitialized(): boolean {
  return browserClient !== null;
}

/**
 * Set a custom browser client (useful for testing)
 */
export function setBrowserClient(client: LLMBrowserClient | null): void {
  browserClient = client;
  initializationPromise = null;
}
