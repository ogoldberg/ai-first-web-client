/**
 * Tests for improved error messages (DX-010)
 */

import { describe, it, expect } from 'vitest';
import {
  buildErrorMessage,
  playwrightNotInstalledError,
  betterSqlite3NotAvailableError,
  notInitializedError,
  unknownToolError,
  unknownActionError,
  unknownStrategyError,
  missingArgumentsError,
  prismaClientError,
  encryptionKeyNotSetError,
  sessionDecryptionError,
  invalidSessionFormatError,
  vectorDimensionMismatchError,
  emptyEmbeddingTextError,
  workflowNotFoundError,
  recordingNotActiveError,
  remoteBrowserConnectionError,
  databaseConnectionError,
  vectorStoreDependencyError,
  embeddingProviderInitError,
  notPdfContentError,
  strategyNoResultError,
  pageRequiresFullBrowserError,
} from '../../src/utils/error-messages.js';

describe('Error Messages (DX-010)', () => {
  describe('buildErrorMessage', () => {
    it('should build a simple message', () => {
      const result = buildErrorMessage({ message: 'Test error' });
      expect(result).toBe('Test error');
    });

    it('should include command when provided', () => {
      const result = buildErrorMessage({
        message: 'Package not installed',
        command: 'npm install package',
      });
      expect(result).toContain('npm install package');
      expect(result).toContain('Run:');
    });

    it('should include single suggestion inline', () => {
      const result = buildErrorMessage({
        message: 'Error occurred',
        suggestions: ['Try restarting'],
      });
      expect(result).toContain('Try restarting');
      expect(result).not.toContain('Suggestions:');
    });

    it('should list multiple suggestions', () => {
      const result = buildErrorMessage({
        message: 'Error occurred',
        suggestions: ['First suggestion', 'Second suggestion'],
      });
      expect(result).toContain('Suggestions:');
      expect(result).toContain('  - First suggestion');
      expect(result).toContain('  - Second suggestion');
    });

    it('should include single alternative inline', () => {
      const result = buildErrorMessage({
        message: 'Error occurred',
        alternatives: ['Use a different approach'],
      });
      expect(result).toContain('Alternative: Use a different approach');
    });

    it('should list multiple alternatives', () => {
      const result = buildErrorMessage({
        message: 'Error occurred',
        alternatives: ['Option A', 'Option B'],
      });
      expect(result).toContain('Alternatives:');
      expect(result).toContain('  - Option A');
      expect(result).toContain('  - Option B');
    });

    it('should combine all parts', () => {
      const result = buildErrorMessage({
        message: 'Main error',
        command: 'npm install foo',
        suggestions: ['Check version'],
        alternatives: ['Use bar instead'],
      });
      expect(result).toContain('Main error');
      expect(result).toContain('Run: npm install foo');
      expect(result).toContain('Check version');
      expect(result).toContain('Alternative: Use bar instead');
    });
  });

  describe('Dependency Errors', () => {
    it('playwrightNotInstalledError should provide install command', () => {
      const error = playwrightNotInstalledError();
      expect(error).toContain('Playwright is not installed');
      expect(error).toContain('npm install playwright');
      expect(error).toContain('npx playwright install chromium');
      expect(error).toContain('intelligence');
      expect(error).toContain('lightweight');
    });

    it('betterSqlite3NotAvailableError should provide install command', () => {
      const error = betterSqlite3NotAvailableError();
      expect(error).toContain('better-sqlite3');
      expect(error).toContain('npm install');
      expect(error).toContain('build-essential');
      expect(error).toContain('jsonFallback');
    });

    it('vectorStoreDependencyError should include package name', () => {
      const error = vectorStoreDependencyError('lancedb');
      expect(error).toContain('lancedb');
      expect(error).toContain('npm install lancedb');
    });
  });

  describe('Initialization Errors', () => {
    it('notInitializedError should mention component name', () => {
      const error = notInitializedError('VectorStore');
      expect(error).toContain('VectorStore is not initialized');
      expect(error).toContain('vectorstore.initialize()');
    });

    it('embeddingProviderInitError should provide debugging hints', () => {
      const error = embeddingProviderInitError('Custom reason');
      expect(error).toContain('Failed to initialize EmbeddingProvider');
      expect(error).toContain('Custom reason');
    });

    it('embeddingProviderInitError should work without reason', () => {
      const error = embeddingProviderInitError();
      expect(error).toContain('@xenova/transformers');
    });
  });

  describe('Configuration Errors', () => {
    it('missingArgumentsError should list required parameters', () => {
      const error = missingArgumentsError('smart_browse', ['url', 'options']);
      expect(error).toContain('smart_browse');
      expect(error).toContain('url');
      expect(error).toContain('options');
      expect(error).toContain('Required parameters');
    });

    it('unknownToolError should suggest similar tools', () => {
      const error = unknownToolError('smart_brose', ['smart_browse', 'batch_browse', 'get_stats']);
      expect(error).toContain('Unknown tool: "smart_brose"');
      expect(error).toContain('Did you mean');
      expect(error).toContain('smart_browse');
    });

    it('unknownToolError should show available tools when no similar found', () => {
      const error = unknownToolError('xyz', ['smart_browse', 'batch_browse']);
      expect(error).toContain('Available tools');
      expect(error).toContain('smart_browse');
    });

    it('unknownActionError should list valid actions', () => {
      const error = unknownActionError('invalid', 'tier_management', ['stats', 'set', 'usage']);
      expect(error).toContain('Unknown action "invalid"');
      expect(error).toContain('tier_management');
      expect(error).toContain('stats');
      expect(error).toContain('set');
      expect(error).toContain('usage');
    });

    it('unknownStrategyError should list valid strategies', () => {
      const error = unknownStrategyError('invalid', ['auto', 'static', 'browser']);
      expect(error).toContain('Unknown content extraction strategy');
      expect(error).toContain('invalid');
      expect(error).toContain('auto');
      expect(error).toContain('static');
      expect(error).toContain('browser');
    });
  });

  describe('Database Errors', () => {
    it('prismaClientError should provide troubleshooting steps', () => {
      const error = prismaClientError();
      expect(error).toContain('Prisma client');
      expect(error).toContain('DATABASE_URL');
      expect(error).toContain('npx prisma generate');
      expect(error).toContain('npx prisma migrate deploy');
    });

    it('databaseConnectionError should include db type', () => {
      const error = databaseConnectionError('PostgreSQL', 'Connection refused');
      expect(error).toContain('PostgreSQL');
      expect(error).toContain('Connection refused');
      expect(error).toContain('connection string');
    });
  });

  describe('Session/Encryption Errors', () => {
    it('encryptionKeyNotSetError should show env var name', () => {
      const error = encryptionKeyNotSetError('LLM_BROWSER_SESSION_KEY');
      expect(error).toContain('LLM_BROWSER_SESSION_KEY');
      expect(error).toContain('export');
      expect(error).toContain('openssl rand');
    });

    it('sessionDecryptionError should provide recovery steps', () => {
      const error = sessionDecryptionError();
      expect(error).toContain('decrypt session');
      expect(error).toContain('invalid key');
      expect(error).toContain('corrupted');
      expect(error).toContain('delete the session');
    });

    it('invalidSessionFormatError should mention corruption', () => {
      const error = invalidSessionFormatError();
      expect(error).toContain('Invalid encrypted session format');
      expect(error).toContain('corrupted');
    });
  });

  describe('Content Errors', () => {
    it('notPdfContentError should show actual content type', () => {
      const error = notPdfContentError('https://example.com/doc', 'text/html');
      expect(error).toContain('PDF');
      expect(error).toContain('text/html');
      expect(error).toContain('direct download link');
    });

    it('strategyNoResultError should suggest alternatives', () => {
      const error = strategyNoResultError('framework:nextjs');
      expect(error).toContain('framework:nextjs');
      expect(error).toContain('auto');
      expect(error).toContain('playwright');
    });

    it('pageRequiresFullBrowserError should mention Playwright availability', () => {
      const withPw = pageRequiresFullBrowserError('JavaScript required', true);
      expect(withPw).toContain('Playwright is available');

      const withoutPw = pageRequiresFullBrowserError('JavaScript required', false);
      expect(withoutPw).toContain('Install Playwright');
      expect(withoutPw).toContain('API endpoints');
    });
  });

  describe('Remote Browser Errors', () => {
    it('remoteBrowserConnectionError should include provider info', () => {
      const error = remoteBrowserConnectionError('Browserbase', 'cloud', 'Timeout');
      expect(error).toContain('Browserbase');
      expect(error).toContain('cloud');
      expect(error).toContain('Timeout');
      expect(error).toContain('API key');
    });
  });

  describe('Vector/Embedding Errors', () => {
    it('vectorDimensionMismatchError should show dimensions', () => {
      const error = vectorDimensionMismatchError(384, 768);
      expect(error).toContain('384');
      expect(error).toContain('768');
      expect(error).toContain('same model');
    });

    it('emptyEmbeddingTextError should provide guidance', () => {
      const error = emptyEmbeddingTextError();
      expect(error).toContain('empty text');
      expect(error).toContain('non-empty');
      expect(error).toContain('content extraction');
    });
  });

  describe('Workflow Errors', () => {
    it('workflowNotFoundError should include workflow ID', () => {
      const error = workflowNotFoundError('wf_123');
      expect(error).toContain('wf_123');
      expect(error).toContain('list_workflows');
    });

    it('recordingNotActiveError should show current status', () => {
      const error = recordingNotActiveError('rec_456', 'completed');
      expect(error).toContain('rec_456');
      expect(error).toContain('completed');
      expect(error).toContain('workflow/record/start');
    });
  });
});
