/**
 * Unbrowser Connect Types
 *
 * Type definitions for the Connect SDK used by B2B SaaS applications
 * to fetch content through their users' browsers.
 */

/**
 * Configuration for initializing Unbrowser Connect
 */
export interface ConnectConfig {
  /** Your Unbrowser Connect app ID */
  appId: string;

  /** Your Unbrowser Connect API key */
  apiKey: string;

  /** API endpoint (defaults to production) */
  apiUrl?: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom styling for popup/modal UI */
  theme?: ConnectTheme;

  /** Global UI options for built-in components */
  ui?: GlobalUIOptions;

  /** Callback when SDK is ready */
  onReady?: () => void;

  /** Callback on errors */
  onError?: (error: ConnectError) => void;
}

/**
 * Theme customization for Connect UI elements
 */
export interface ConnectTheme {
  /** Primary brand color */
  primaryColor?: string;

  /** Background color for modals */
  backgroundColor?: string;

  /** Text color */
  textColor?: string;

  /** Border radius for UI elements */
  borderRadius?: string;

  /** Font family */
  fontFamily?: string;
}

/**
 * Global UI options for the Connect SDK
 */
export interface GlobalUIOptions {
  /** Show progress overlay during fetches (default: false) */
  showProgress?: boolean;

  /** Show error toasts on failures (default: false) */
  showErrors?: boolean;

  /** How long to show error toasts in ms (default: 5000) */
  errorDuration?: number;

  /** Container element to mount UI components (default: document.body) */
  container?: HTMLElement;
}

/**
 * Per-fetch UI options
 */
export interface FetchUIOptions {
  /** Show progress overlay for this fetch (overrides global) */
  showProgress?: boolean;

  /** Auth prompt modal configuration */
  authPrompt?: AuthPromptConfig;

  /** Container element for this fetch's UI */
  container?: HTMLElement;
}

/**
 * Configuration for the auth prompt modal
 */
export interface AuthPromptConfig {
  /** Modal title */
  title?: string;

  /** Explanation message */
  message?: string;

  /** Continue button text (default: "Continue") */
  buttonText?: string;

  /** Cancel button text (default: "Cancel") */
  cancelText?: string;

  /** Show cancel button (default: true) */
  showCancel?: boolean;
}

/**
 * Configuration for progress overlay
 */
export interface ProgressOverlayConfig {
  /** Show spinner animation (default: true) */
  showSpinner?: boolean;

  /** Show percentage (default: true) */
  showPercent?: boolean;

  /** Show stage text (default: true) */
  showStage?: boolean;

  /** Custom loading text */
  loadingText?: string;
}

/**
 * Options for a fetch request
 */
export interface FetchOptions {
  /** The URL to fetch */
  url: string;

  /**
   * Fetch mode:
   * - 'background': Hidden iframe, invisible to user
   * - 'popup': Small popup window, auto-closes on completion
   * - 'tab': Opens new tab, user controls when done
   */
  mode?: 'background' | 'popup' | 'tab';

  /** Whether this URL requires user authentication */
  requiresAuth?: boolean;

  /** Custom message shown to user when auth is required */
  authPrompt?: string;

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** What content to extract */
  extract?: ExtractionOptions;

  /** Headers to include (limited by browser security) */
  headers?: Record<string, string>;

  /** Callback when auth is completed (for popup/tab modes) */
  onAuthComplete?: () => void;

  /** Callback for progress updates */
  onProgress?: (progress: FetchProgress) => void;

  /** UI options for this fetch (overrides global settings) */
  ui?: FetchUIOptions;
}

/**
 * Options for content extraction
 */
export interface ExtractionOptions {
  /** Extract full HTML */
  html?: boolean;

  /** Extract rendered text content */
  text?: boolean;

  /** Extract as markdown */
  markdown?: boolean;

  /** Extract structured data (JSON-LD, microdata, etc.) */
  structured?: boolean;

  /** Extract specific elements by selector */
  selectors?: Record<string, string>;

  /** Use site-specific extraction patterns */
  usePatterns?: boolean;

  /** Custom extraction function (runs in page context) */
  custom?: string;
}

/**
 * Progress update during fetch
 */
export interface FetchProgress {
  /** Current stage */
  stage: 'initializing' | 'loading' | 'waiting_auth' | 'extracting' | 'complete';

  /** Progress percentage (0-100) */
  percent: number;

  /** Human-readable status message */
  message: string;
}

/**
 * Result of a successful fetch
 */
export interface FetchResult {
  /** Whether the fetch succeeded */
  success: true;

  /** The final URL after any redirects */
  url: string;

  /** Page title */
  title: string;

  /** Extracted content */
  content: {
    /** Raw HTML (if requested) */
    html?: string;

    /** Text content */
    text?: string;

    /** Markdown content */
    markdown?: string;

    /** Structured data */
    structured?: Record<string, unknown>;

    /** Custom selector results */
    selectors?: Record<string, string | string[]>;

    /** Custom extraction results */
    custom?: unknown;
  };

  /** Metadata about the fetch */
  meta: {
    /** How long the fetch took (ms) */
    duration: number;

    /** Which mode was used */
    mode: 'background' | 'popup' | 'tab';

    /** Whether user authentication was performed */
    authenticated: boolean;

    /** Content type of the response */
    contentType: string;

    /** Patterns used for extraction (if any) */
    patternsUsed?: string[];
  };
}

/**
 * Error result from a failed fetch
 */
export interface FetchError {
  success: false;
  error: ConnectError;
}

/**
 * Connect error object
 */
export interface ConnectError {
  /** Error code for programmatic handling */
  code: ConnectErrorCode;

  /** Human-readable error message */
  message: string;

  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Error codes returned by Connect
 */
export type ConnectErrorCode =
  | 'NOT_INITIALIZED'      // SDK not initialized
  | 'INVALID_URL'          // URL is malformed or blocked
  | 'TIMEOUT'              // Request timed out
  | 'BLOCKED'              // Target site blocked the request
  | 'AUTH_REQUIRED'        // User needs to authenticate but didn't
  | 'USER_CANCELLED'       // User closed popup/tab before completion
  | 'EXTRACTION_FAILED'    // Content extraction failed
  | 'NETWORK_ERROR'        // Network connectivity issue
  | 'QUOTA_EXCEEDED'       // Account quota exceeded
  | 'INVALID_CONFIG'       // Configuration is invalid
  | 'CORS_BLOCKED'         // Cross-origin request blocked
  | 'POPUP_BLOCKED'        // Browser blocked popup
  | 'IFRAME_BLOCKED';      // Site doesn't allow iframe embedding

/**
 * Batch fetch options
 */
export interface BatchFetchOptions {
  /** URLs to fetch */
  urls: string[];

  /** Options applied to all fetches */
  options?: Omit<FetchOptions, 'url'>;

  /** Maximum concurrent fetches (default: 3) */
  concurrency?: number;

  /** Continue on individual failures */
  continueOnError?: boolean;

  /** Progress callback for batch */
  onProgress?: (completed: number, total: number, results: (FetchResult | FetchError)[]) => void;
}

/**
 * Batch fetch result
 */
export interface BatchFetchResult {
  /** Total URLs processed */
  total: number;

  /** Successful fetches */
  succeeded: number;

  /** Failed fetches */
  failed: number;

  /** Individual results in order */
  results: (FetchResult | FetchError)[];
}

/**
 * Internal message types for iframe/popup communication
 */
export interface ConnectMessage {
  type: 'CONNECT_INIT' | 'CONNECT_FETCH' | 'CONNECT_RESULT' | 'CONNECT_ERROR' | 'CONNECT_PROGRESS' | 'CONNECT_AUTH';
  id: string;
  payload: unknown;
}
