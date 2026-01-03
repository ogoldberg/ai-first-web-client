/**
 * React Integration Examples for Unbrowser Connect
 *
 * This file demonstrates how to integrate Unbrowser Connect with React:
 * - Custom hooks for Connect lifecycle management
 * - State management patterns
 * - Error boundaries
 * - Loading states
 * - Context providers for app-wide access
 *
 * Note: This file uses JSX and requires a React build setup.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';

import {
  createConnect,
  type UnbrowserConnect,
  type ConnectConfig,
  type FetchOptions,
  type FetchResult,
  type FetchError,
  type FetchProgress,
} from '@unbrowser/connect';

// =============================================================================
// Types
// =============================================================================

interface ConnectContextValue {
  /** Whether the SDK is ready to use */
  isReady: boolean;

  /** Whether a fetch is in progress */
  isLoading: boolean;

  /** Current progress (if loading) */
  progress: FetchProgress | null;

  /** Last error (if any) */
  error: FetchError | null;

  /** Fetch content from URL */
  fetch: (options: FetchOptions) => Promise<FetchResult | FetchError>;

  /** Clear current error */
  clearError: () => void;
}

interface UseFetchResult {
  data: FetchResult | null;
  error: FetchError | null;
  isLoading: boolean;
  progress: FetchProgress | null;
  refetch: () => Promise<void>;
}

// =============================================================================
// Hook 1: useUnbrowserConnect (Basic)
// =============================================================================

/**
 * Basic hook for using Unbrowser Connect in a component.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { fetch, isReady } = useUnbrowserConnect({
 *     appId: 'my-app',
 *     apiKey: 'ub_live_xxx',
 *   });
 *
 *   const handleFetch = async () => {
 *     const result = await fetch({ url: 'https://example.com' });
 *     if (result.success) {
 *       console.log(result.content);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleFetch} disabled={!isReady}>
 *       Fetch Content
 *     </button>
 *   );
 * }
 * ```
 */
export function useUnbrowserConnect(config: ConnectConfig) {
  const connectRef = useRef<UnbrowserConnect | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<FetchError | null>(null);

  // Initialize on mount
  useEffect(() => {
    const connect = createConnect({
      ...config,
      onReady: () => {
        setIsReady(true);
        config.onReady?.();
      },
      onError: (err) => {
        setError({ success: false, error: err });
        config.onError?.(err);
      },
    });

    connectRef.current = connect;

    connect.init().catch((err) => {
      console.error('Connect init failed:', err);
    });

    // Cleanup on unmount
    return () => {
      connect.destroy();
      connectRef.current = null;
      setIsReady(false);
    };
  }, [config.appId, config.apiKey]); // Re-init if credentials change

  // Fetch function
  const fetch = useCallback(async (options: FetchOptions): Promise<FetchResult | FetchError> => {
    if (!connectRef.current) {
      const err: FetchError = {
        success: false,
        error: { code: 'INIT_FAILED', message: 'Connect not initialized' },
      };
      setError(err);
      return err;
    }

    setIsLoading(true);
    setProgress(null);
    setError(null);

    try {
      const result = await connectRef.current.fetch({
        ...options,
        onProgress: (p) => {
          setProgress(p);
          options.onProgress?.(p);
        },
      });

      if (!result.success) {
        setError(result);
      }

      return result;
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isReady,
    isLoading,
    progress,
    error,
    fetch,
    clearError,
  };
}

// =============================================================================
// Hook 2: useFetch (Data Fetching Pattern)
// =============================================================================

/**
 * React Query-style hook for fetching content.
 *
 * @example
 * ```tsx
 * function ArticleViewer({ url }: { url: string }) {
 *   const { data, error, isLoading, refetch } = useFetch(url, {
 *     extract: { markdown: true },
 *   });
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.error.message} />;
 *   if (!data) return null;
 *
 *   return (
 *     <article>
 *       <h1>{data.content.title}</h1>
 *       <MarkdownRenderer content={data.content.markdown} />
 *       <button onClick={refetch}>Refresh</button>
 *     </article>
 *   );
 * }
 * ```
 */
export function useFetch(
  url: string,
  options: Omit<FetchOptions, 'url'> = {},
  config?: { enabled?: boolean }
): UseFetchResult {
  const [data, setData] = useState<FetchResult | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<FetchProgress | null>(null);

  // Get Connect from context
  const context = useContext(ConnectContext);
  if (!context) {
    throw new Error('useFetch must be used within a ConnectProvider');
  }

  const doFetch = useCallback(async () => {
    if (!context.isReady) return;

    setIsLoading(true);
    setError(null);

    const result = await context.fetch({
      url,
      ...options,
      onProgress: (p) => {
        setProgress(p);
        options.onProgress?.(p);
      },
    });

    if (result.success) {
      setData(result);
    } else {
      setError(result);
    }

    setIsLoading(false);
    setProgress(null);
  }, [url, context.isReady, options]);

  // Fetch on mount and when URL changes
  useEffect(() => {
    if (config?.enabled !== false) {
      doFetch();
    }
  }, [url, config?.enabled]);

  return {
    data,
    error,
    isLoading,
    progress,
    refetch: doFetch,
  };
}

// =============================================================================
// Context Provider
// =============================================================================

const ConnectContext = createContext<ConnectContextValue | null>(null);

interface ConnectProviderProps {
  config: ConnectConfig;
  children: ReactNode;
}

/**
 * Provider component for app-wide Connect access.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ConnectProvider config={{ appId: 'my-app', apiKey: 'ub_live_xxx' }}>
 *       <MyApp />
 *     </ConnectProvider>
 *   );
 * }
 * ```
 */
export function ConnectProvider({ config, children }: ConnectProviderProps) {
  const value = useUnbrowserConnect(config);

  return (
    <ConnectContext.Provider value={value}>
      {children}
    </ConnectContext.Provider>
  );
}

/**
 * Hook to access Connect from context.
 */
export function useConnect(): ConnectContextValue {
  const context = useContext(ConnectContext);
  if (!context) {
    throw new Error('useConnect must be used within a ConnectProvider');
  }
  return context;
}

// =============================================================================
// Safe Content Renderer
// =============================================================================

/**
 * Renders content as plain text paragraphs.
 * For markdown rendering, use a library like react-markdown.
 *
 * SECURITY NOTE: Never use dangerouslySetInnerHTML with untrusted content.
 * Always use a proper markdown renderer or sanitization library.
 */
function SafeContentRenderer({ content }: { content: string }) {
  // Split content into paragraphs and render safely as text
  const paragraphs = content.split('\n\n').filter(Boolean);

  return (
    <div className="content-renderer">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

// =============================================================================
// Example Components
// =============================================================================

/**
 * Loading indicator component
 */
function LoadingIndicator({ progress }: { progress: FetchProgress | null }) {
  if (!progress) return <div>Loading...</div>;

  return (
    <div className="loading-indicator">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="progress-text">
        {progress.stage}: {progress.message}
      </div>
    </div>
  );
}

/**
 * Error display component
 */
function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
}: {
  error: FetchError;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="error-display">
      <div className="error-icon">X</div>
      <div className="error-content">
        <div className="error-code">{error.error.code}</div>
        <div className="error-message">{error.error.message}</div>
      </div>
      <div className="error-actions">
        {onRetry && <button onClick={onRetry}>Retry</button>}
        {onDismiss && <button onClick={onDismiss}>Dismiss</button>}
      </div>
    </div>
  );
}

/**
 * Example: Content Fetcher Component
 */
export function ContentFetcher() {
  const [url, setUrl] = useState('');
  const [content, setContent] = useState<FetchResult | null>(null);
  const { fetch, isReady, isLoading, progress, error, clearError } = useConnect();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const result = await fetch({
      url,
      extract: { markdown: true, text: true },
    });

    if (result.success) {
      setContent(result);
    }
  };

  return (
    <div className="content-fetcher">
      <form onSubmit={handleSubmit}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL to fetch..."
          disabled={!isReady || isLoading}
        />
        <button type="submit" disabled={!isReady || isLoading}>
          {isLoading ? 'Fetching...' : 'Fetch'}
        </button>
      </form>

      {isLoading && <LoadingIndicator progress={progress} />}

      {error && (
        <ErrorDisplay
          error={error}
          onRetry={handleSubmit}
          onDismiss={clearError}
        />
      )}

      {content && (
        <div className="content-result">
          <h2>{content.content.title}</h2>
          <SafeContentRenderer
            content={content.content.markdown || content.content.text || ''}
          />
          <div className="content-meta">
            Fetched in {content.meta.duration}ms via {content.meta.mode}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Example: Auto-fetching Article Component
 */
export function ArticleViewer({ url }: { url: string }) {
  const { data, error, isLoading, progress, refetch } = useFetch(url, {
    extract: { markdown: true },
  });

  if (isLoading) {
    return <LoadingIndicator progress={progress} />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={refetch} />;
  }

  if (!data) {
    return <div>No content</div>;
  }

  return (
    <article className="article-viewer">
      <header>
        <h1>{data.content.title}</h1>
        <button onClick={refetch}>Refresh</button>
      </header>
      <SafeContentRenderer content={data.content.markdown || ''} />
      <footer>
        Source: <a href={data.url}>{data.url}</a>
      </footer>
    </article>
  );
}

/**
 * Example: Multi-source Aggregator
 */
export function ContentAggregator({ urls }: { urls: string[] }) {
  const [results, setResults] = useState<Map<string, FetchResult | FetchError>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const { fetch, isReady } = useConnect();

  const fetchAll = async () => {
    setIsLoading(true);
    setResults(new Map());

    for (const url of urls) {
      const result = await fetch({
        url,
        extract: { text: true },
      });

      setResults((prev) => new Map(prev).set(url, result));
    }

    setIsLoading(false);
  };

  return (
    <div className="content-aggregator">
      <button onClick={fetchAll} disabled={!isReady || isLoading}>
        {isLoading ? 'Fetching...' : 'Fetch All'}
      </button>

      <div className="results-grid">
        {urls.map((url) => {
          const result = results.get(url);
          return (
            <div key={url} className="result-card">
              <div className="result-url">{url}</div>
              {!result && <div className="result-pending">Pending...</div>}
              {result?.success && (
                <div className="result-success">
                  <strong>{result.content.title}</strong>
                  <p>{result.content.text?.slice(0, 200)}...</p>
                </div>
              )}
              {result && !result.success && (
                <div className="result-error">
                  Error: {result.error.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Error Boundary
// =============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for Connect-related errors.
 */
export class ConnectErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Connect error boundary caught:', error, errorInfo);
    // Log to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Complete App Example
// =============================================================================

/**
 * Complete example application showing all patterns together.
 */
export function ExampleApp() {
  return (
    <ConnectProvider
      config={{
        appId: 'react-example-app',
        apiKey: process.env.REACT_APP_UNBROWSER_API_KEY || 'ub_test_demo',
        debug: true,
        ui: {
          showProgress: true,
          showErrors: true,
        },
        theme: {
          primaryColor: '#6366f1',
        },
      }}
    >
      <ConnectErrorBoundary>
        <div className="app">
          <header>
            <h1>Unbrowser Connect React Example</h1>
          </header>

          <main>
            <section>
              <h2>Content Fetcher</h2>
              <ContentFetcher />
            </section>

            <section>
              <h2>Article Viewer</h2>
              <ArticleViewer url="https://example.com" />
            </section>

            <section>
              <h2>Content Aggregator</h2>
              <ContentAggregator
                urls={[
                  'https://example.com',
                  'https://httpbin.org/html',
                  'https://example.org',
                ]}
              />
            </section>
          </main>
        </div>
      </ConnectErrorBoundary>
    </ConnectProvider>
  );
}

// =============================================================================
// Styles (inline for example purposes)
// =============================================================================

export const styles = `
.loading-indicator {
  padding: 16px;
  text-align: center;
}

.progress-bar {
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #6366f1;
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}

.error-display {
  display: flex;
  align-items: center;
  padding: 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  gap: 12px;
}

.error-icon {
  width: 24px;
  height: 24px;
  background: #ef4444;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-content {
  flex: 1;
}

.error-code {
  font-weight: 600;
  color: #dc2626;
}

.error-message {
  color: #7f1d1d;
}

.content-fetcher form {
  display: flex;
  gap: 8px;
}

.content-fetcher input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.content-fetcher button {
  padding: 8px 16px;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.content-fetcher button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.content-renderer p {
  margin-bottom: 1em;
  line-height: 1.6;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.result-card {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.result-url {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-success {
  color: #065f46;
}

.result-error {
  color: #dc2626;
}
`;
