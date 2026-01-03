/**
 * PatternCache - Site-specific extraction patterns
 *
 * Caches patterns from Unbrowser Cloud for offline use.
 * Patterns contain CSS selectors, content structures, and
 * extraction logic learned from all Unbrowser customers.
 */

interface PatternCacheConfig {
  apiUrl: string;
  apiKey: string;
  appId: string;
}

interface SitePattern {
  domain: string;
  version: string;
  lastUpdated: string;
  selectors: {
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    [key: string]: string | undefined;
  };
  contentStructure?: {
    type: 'article' | 'list' | 'forum' | 'product' | 'unknown';
    pagination?: {
      nextSelector?: string;
      pageParamName?: string;
    };
  };
  customExtraction?: string; // Serialized extraction function
}

interface PatternSyncResponse {
  patterns: SitePattern[];
  syncToken: string;
}

const DB_NAME = 'unbrowser-connect';
const STORE_NAME = 'patterns';
const SYNC_TOKEN_KEY = '__syncToken';

export class PatternCache {
  private config: PatternCacheConfig;
  private patterns = new Map<string, SitePattern>();
  private db: IDBDatabase | null = null;
  private syncToken: string | null = null;

  constructor(config: PatternCacheConfig) {
    this.config = config;
  }

  /**
   * Sync patterns from server
   */
  async sync(): Promise<void> {
    await this.initDB();

    // Fetch patterns from server with delta sync
    const response = await fetch(`${this.config.apiUrl}/v1/connect/patterns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'X-App-Id': this.config.appId,
      },
      body: JSON.stringify({
        syncToken: this.syncToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Pattern sync failed: ${response.status}`);
    }

    const data: PatternSyncResponse = await response.json();

    // Update in-memory cache
    for (const pattern of data.patterns) {
      this.patterns.set(pattern.domain, pattern);
    }

    // Persist to IndexedDB
    await this.persistPatterns(data.patterns);
    this.syncToken = data.syncToken;
    await this.saveSyncToken(data.syncToken);
  }

  /**
   * Get pattern for a domain
   */
  get(domain: string): SitePattern | undefined {
    // Check exact match
    if (this.patterns.has(domain)) {
      return this.patterns.get(domain);
    }

    // Check parent domain (e.g., reddit.com for old.reddit.com)
    const parts = domain.split('.');
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join('.');
      if (this.patterns.has(parentDomain)) {
        return this.patterns.get(parentDomain);
      }
    }

    return undefined;
  }

  /**
   * Check if we have patterns for a domain
   */
  has(domain: string): boolean {
    return this.get(domain) !== undefined;
  }

  /**
   * Load patterns from IndexedDB
   */
  async load(): Promise<void> {
    await this.initDB();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        for (const pattern of request.result as SitePattern[]) {
          if (pattern.domain === SYNC_TOKEN_KEY) {
            this.syncToken = (pattern as unknown as { token: string }).token;
          } else {
            this.patterns.set(pattern.domain, pattern);
          }
        }
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async initDB(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'domain' });
        }
      };
    });
  }

  private async persistPatterns(patterns: SitePattern[]): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      for (const pattern of patterns) {
        store.put(pattern);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private async saveSyncToken(token: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ domain: SYNC_TOKEN_KEY, token });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
