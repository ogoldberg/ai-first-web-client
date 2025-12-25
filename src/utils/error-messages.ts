/**
 * Improved Error Messages with Actionable Suggestions (DX-010)
 *
 * Provides user-friendly error messages that include:
 * - Clear description of what went wrong
 * - Actionable suggestions for resolution
 * - Alternative approaches when available
 */

/**
 * Error message builder for consistent formatting
 */
export interface ErrorMessageOptions {
  /** Main error description */
  message: string;
  /** Suggested actions to resolve the issue */
  suggestions?: string[];
  /** Command to run (e.g., npm install) */
  command?: string;
  /** Alternative approaches */
  alternatives?: string[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Build a formatted error message with suggestions
 */
export function buildErrorMessage(options: ErrorMessageOptions): string {
  const parts: string[] = [options.message];

  if (options.command) {
    parts.push(`Run: ${options.command}`);
  }

  if (options.suggestions && options.suggestions.length > 0) {
    if (options.suggestions.length === 1) {
      parts.push(options.suggestions[0]);
    } else {
      parts.push('Suggestions:');
      options.suggestions.forEach(s => parts.push(`  - ${s}`));
    }
  }

  if (options.alternatives && options.alternatives.length > 0) {
    if (options.alternatives.length === 1) {
      parts.push(`Alternative: ${options.alternatives[0]}`);
    } else {
      parts.push('Alternatives:');
      options.alternatives.forEach(a => parts.push(`  - ${a}`));
    }
  }

  return parts.join('\n');
}

// =============================================================================
// DEPENDENCY ERRORS
// =============================================================================

/**
 * Error when Playwright is not installed
 */
export function playwrightNotInstalledError(): string {
  return buildErrorMessage({
    message: 'Playwright is not installed.',
    command: 'npm install playwright && npx playwright install chromium',
    alternatives: [
      'Use intelligence or lightweight tiers which work without Playwright',
      'Set forceTier: "intelligence" or forceTier: "lightweight" in options',
    ],
  });
}

/**
 * Error when better-sqlite3 is not available
 */
export function betterSqlite3NotAvailableError(): string {
  return buildErrorMessage({
    message: 'better-sqlite3 is not available and JSON fallback is disabled.',
    command: 'npm install better-sqlite3',
    suggestions: [
      'Ensure native build dependencies are installed (python, C++ compiler)',
      'On macOS: xcode-select --install',
      'On Ubuntu/Debian: apt-get install build-essential python3',
    ],
    alternatives: [
      'Enable JSON fallback by setting jsonFallback: true in EmbeddedStore config',
    ],
  });
}

/**
 * Error when vector store dependencies are missing
 */
export function vectorStoreDependencyError(packageName: string): string {
  return buildErrorMessage({
    message: `Vector store dependency "${packageName}" is not installed.`,
    command: `npm install ${packageName}`,
    alternatives: [
      'Use embedded SQLite store instead of LanceDB for simpler setup',
    ],
  });
}

// =============================================================================
// INITIALIZATION ERRORS
// =============================================================================

/**
 * Error when a component is used before initialization
 */
export function notInitializedError(componentName: string): string {
  return buildErrorMessage({
    message: `${componentName} is not initialized.`,
    suggestions: [
      `Call ${componentName.toLowerCase()}.initialize() before using this method`,
      'Ensure initialization completes before making requests',
    ],
  });
}

/**
 * Error when embedding provider fails to initialize
 */
export function embeddingProviderInitError(reason?: string): string {
  return buildErrorMessage({
    message: 'Failed to initialize EmbeddingProvider.',
    suggestions: [
      reason || 'Check that @xenova/transformers is installed correctly',
      'Ensure sufficient memory is available for the embedding model',
      'Try with a smaller model: set EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2',
    ],
  });
}

// =============================================================================
// CONFIGURATION ERRORS
// =============================================================================

/**
 * Error when required arguments are missing
 */
export function missingArgumentsError(toolName: string, required: string[]): string {
  return buildErrorMessage({
    message: `Missing required arguments for "${toolName}".`,
    suggestions: [
      `Required parameters: ${required.join(', ')}`,
      `Example: { ${required.map(r => `${r}: "..."`).join(', ')} }`,
    ],
  });
}

/**
 * Error when an unknown tool is requested
 */
export function unknownToolError(toolName: string, availableTools: string[]): string {
  const similar = findSimilarStrings(toolName, availableTools, 3);
  return buildErrorMessage({
    message: `Unknown tool: "${toolName}".`,
    suggestions: similar.length > 0
      ? [`Did you mean: ${similar.join(', ')}?`]
      : undefined,
    alternatives: [
      `Available tools: ${availableTools.slice(0, 10).join(', ')}${availableTools.length > 10 ? '...' : ''}`,
    ],
  });
}

/**
 * Error when an unknown action is provided
 */
export function unknownActionError(action: string, toolName: string, validActions: string[]): string {
  return buildErrorMessage({
    message: `Unknown action "${action}" for ${toolName}.`,
    suggestions: [
      `Valid actions: ${validActions.join(', ')}`,
    ],
  });
}

/**
 * Error when an unknown strategy is provided
 */
export function unknownStrategyError(strategy: string, validStrategies: string[]): string {
  return buildErrorMessage({
    message: `Unknown content extraction strategy: "${strategy}".`,
    suggestions: [
      `Valid strategies: ${validStrategies.join(', ')}`,
      'Use "auto" to let the system choose the best strategy',
    ],
  });
}

// =============================================================================
// DATABASE ERRORS
// =============================================================================

/**
 * Error when Prisma client fails
 */
export function prismaClientError(): string {
  return buildErrorMessage({
    message: 'Failed to get Prisma client for Postgres backend.',
    suggestions: [
      'Verify DATABASE_URL environment variable is set correctly',
      'Ensure the PostgreSQL server is running and accessible',
      'Run: npx prisma generate (if schema changed)',
      'Run: npx prisma migrate deploy (for pending migrations)',
    ],
    alternatives: [
      'Use SQLite backend by not setting DATABASE_URL',
    ],
  });
}

/**
 * Error when database connection fails
 */
export function databaseConnectionError(dbType: string, details?: string): string {
  return buildErrorMessage({
    message: `Failed to connect to ${dbType} database.${details ? ` ${details}` : ''}`,
    suggestions: [
      'Check database connection string format',
      'Verify network connectivity to database server',
      'Ensure database user has required permissions',
    ],
  });
}

// =============================================================================
// SESSION/ENCRYPTION ERRORS
// =============================================================================

/**
 * Error when session encryption key is not set
 */
export function encryptionKeyNotSetError(envVarName: string): string {
  return buildErrorMessage({
    message: `Session is encrypted but ${envVarName} is not set.`,
    suggestions: [
      `Set the environment variable: export ${envVarName}=your-32-byte-key`,
      'Generate a key with: openssl rand -base64 32',
      'Store the key securely - you need the same key to decrypt sessions',
    ],
  });
}

/**
 * Error when session decryption fails
 */
export function sessionDecryptionError(): string {
  return buildErrorMessage({
    message: 'Failed to decrypt session: invalid key or corrupted data.',
    suggestions: [
      'Verify the encryption key matches the one used to encrypt',
      'Check if the session file was modified or corrupted',
    ],
    alternatives: [
      'Clear the session and re-authenticate: delete the session file and create a new one',
    ],
  });
}

/**
 * Error when session format is invalid
 */
export function invalidSessionFormatError(): string {
  return buildErrorMessage({
    message: 'Invalid encrypted session format.',
    suggestions: [
      'The session file may be corrupted or from an incompatible version',
      'Delete the session file and create a new session',
    ],
  });
}

// =============================================================================
// CONTENT ERRORS
// =============================================================================

/**
 * Error when PDF URL returns non-PDF content
 */
export function notPdfContentError(url: string, actualContentType: string): string {
  return buildErrorMessage({
    message: `URL does not return a PDF. Content-Type: ${actualContentType}`,
    suggestions: [
      'Verify the URL points directly to a PDF file',
      'Check if the URL requires authentication',
      'Look for a direct download link instead of a viewer page',
    ],
    context: { url },
  });
}

/**
 * Error when content extraction strategy fails
 */
export function strategyNoResultError(strategy: string): string {
  return buildErrorMessage({
    message: `Strategy "${strategy}" returned no content.`,
    suggestions: [
      'The page may not match this extraction strategy',
      'Try with strategy: "auto" for automatic detection',
      'Check if the page has the expected content structure',
    ],
    alternatives: [
      'Use a different tier: forceTier: "playwright" for JavaScript-heavy pages',
    ],
  });
}

/**
 * Error when page requires full browser
 */
export function pageRequiresFullBrowserError(reason: string, playwrightAvailable: boolean): string {
  const suggestions: string[] = [
    `Detection reason: ${reason}`,
  ];

  if (playwrightAvailable) {
    suggestions.push('Playwright is available - the request will automatically retry with browser');
  } else {
    suggestions.push('Install Playwright for JavaScript-heavy pages: npm install playwright');
  }

  return buildErrorMessage({
    message: 'Page requires a full browser to render content.',
    suggestions,
    alternatives: playwrightAvailable ? undefined : [
      'Some content may be available from API endpoints - check network requests',
    ],
  });
}

// =============================================================================
// REMOTE BROWSER ERRORS
// =============================================================================

/**
 * Error when remote browser connection fails
 */
export function remoteBrowserConnectionError(
  providerName: string,
  providerType: string,
  details?: string
): string {
  return buildErrorMessage({
    message: `Failed to connect to remote browser provider: ${providerName}.`,
    suggestions: [
      details || 'Check provider credentials and endpoint',
      `Provider type: ${providerType}`,
      'Verify API key or authentication token is valid',
      'Check if the provider service is available',
      'Ensure network allows outbound connections to provider',
    ],
  });
}

// =============================================================================
// VECTOR/EMBEDDING ERRORS
// =============================================================================

/**
 * Error when vector dimensions don't match
 */
export function vectorDimensionMismatchError(expected: number, actual: number): string {
  return buildErrorMessage({
    message: `Vector dimension mismatch: expected ${expected}, got ${actual}.`,
    suggestions: [
      'Ensure all embeddings use the same model',
      'Different embedding models produce different dimensions',
      'Clear and rebuild the vector index if the model changed',
    ],
  });
}

/**
 * Error when embedding text is empty
 */
export function emptyEmbeddingTextError(): string {
  return buildErrorMessage({
    message: 'Cannot generate embedding for empty text.',
    suggestions: [
      'Provide non-empty text for embedding generation',
      'Check that content extraction succeeded before embedding',
    ],
  });
}

// =============================================================================
// WORKFLOW ERRORS
// =============================================================================

/**
 * Error when workflow/recording is not found
 */
export function workflowNotFoundError(workflowId: string): string {
  return buildErrorMessage({
    message: `Workflow not found: "${workflowId}".`,
    suggestions: [
      'Verify the workflow ID is correct',
      'The workflow may have been deleted or expired',
      'Use list_workflows to see available workflows',
    ],
  });
}

/**
 * Error when recording is not active
 */
export function recordingNotActiveError(recordingId: string, currentStatus: string): string {
  return buildErrorMessage({
    message: `Recording "${recordingId}" is not active.`,
    suggestions: [
      `Current status: ${currentStatus}`,
      'Start a new recording with workflow/record/start',
      'Only active recordings can have actions added',
    ],
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Find similar strings using simple edit distance
 */
function findSimilarStrings(target: string, candidates: string[], maxResults: number): string[] {
  const targetLower = target.toLowerCase();

  return candidates
    .map(candidate => ({
      candidate,
      distance: levenshteinDistance(targetLower, candidate.toLowerCase()),
    }))
    .filter(({ distance }) => distance <= 3) // Max 3 edits
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map(({ candidate }) => candidate);
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}
