# Vector Embedding Storage Plan

**Status:** Draft
**Created:** 2025-12-20
**Author:** AI-assisted design

## Executive Summary

This document describes how to add vector embedding storage to the LLM Browser MCP Server using LanceDB as a complementary database to our existing SQLite storage. This enables semantic similarity search for patterns, skills, and content, dramatically improving the system's ability to find relevant learned knowledge.

## Problem Statement

The current system stores learned patterns and skills as structured JSON data in SQLite. While this supports exact key lookups and range queries efficiently, it cannot answer questions like:

- "Find patterns similar to this new URL structure"
- "What skills are related to form submissions?"
- "Find content that semantically matches this query"

Without vector search, the system must:
1. Load all patterns into memory
2. Apply heuristic string matching
3. Miss semantically similar but textually different patterns

## Solution Architecture

### Dual Database Design

```
+------------------+        +------------------+
|    SQLite        |        |    LanceDB       |
|  (EmbeddedStore) |        |  (Vector Store)  |
+------------------+        +------------------+
|                  |        |                  |
| - Pattern JSON   |  <-->  | - Pattern ID     |
| - Skill data     |  link  | - Embedding[384] |
| - Provenance     |   by   | - Metadata       |
| - Config/State   |   ID   |                  |
|                  |        |                  |
+------------------+        +------------------+
        |                           |
        v                           v
  Exact lookups            Similarity search
  Range queries            K-nearest neighbors
  ACID transactions        Vector operations
```

### Why Two Databases?

| Concern | SQLite | LanceDB |
|---------|--------|---------|
| Structured data | Excellent | Poor |
| ACID transactions | Yes | No |
| Vector search | No | Excellent |
| Disk footprint | Small | Larger |
| Memory usage | Low | Higher |
| Query types | SQL | KNN, filters |

**Decision:** Use SQLite for structured data and LanceDB for vectors, linked by ID.

## Data Model

### Embedding Record (LanceDB)

```typescript
interface EmbeddingRecord {
  // Primary key (matches SQLite record)
  id: string;

  // The embedding vector (dimension depends on model)
  // all-MiniLM-L6-v2 = 384 dimensions
  vector: Float32Array;

  // Embedding metadata
  model: string;           // e.g., "all-MiniLM-L6-v2"
  version: number;         // For re-embedding on model changes
  createdAt: number;       // Timestamp

  // Searchable metadata (for filtering)
  entityType: 'pattern' | 'skill' | 'content' | 'error';
  domain?: string;         // For domain-scoped searches
  tenantId?: string;       // For multi-tenant isolation
}
```

### Linked SQLite Record

The existing pattern/skill records in SQLite gain an `embeddingId` field:

```typescript
interface LearnedPattern {
  // ... existing fields ...

  // Link to vector store
  embeddingId?: string;    // References LanceDB record
  embeddingVersion?: number; // Track if re-embedding needed
}
```

## Components

### 1. EmbeddingProvider (existing)

The project already has `@xenova/transformers` as an optional dependency. The `EmbeddingProvider` class wraps it:

```typescript
// src/utils/embedding-provider.ts (already exists)
class EmbeddingProvider {
  async generateEmbedding(text: string): Promise<Float32Array>;
  async generateBatch(texts: string[]): Promise<Float32Array[]>;
  getModelDimensions(): number;
  getModelName(): string;
}
```

### 2. VectorStore (new)

```typescript
// src/utils/vector-store.ts
import * as lancedb from '@lancedb/lancedb';

interface VectorStoreOptions {
  dbPath: string;
  tableName?: string;
  dimensions?: number;      // Default: 384 for all-MiniLM-L6-v2
}

class VectorStore {
  private db: lancedb.Connection;
  private table: lancedb.Table;

  // Initialize/connect to LanceDB
  async initialize(): Promise<void>;

  // Store embedding with metadata
  async add(record: EmbeddingRecord): Promise<void>;
  async addBatch(records: EmbeddingRecord[]): Promise<void>;

  // Search by vector similarity
  async search(
    vector: Float32Array,
    options: SearchOptions
  ): Promise<SearchResult[]>;

  // Search with metadata filters
  async searchFiltered(
    vector: Float32Array,
    filter: FilterExpression,
    options: SearchOptions
  ): Promise<SearchResult[]>;

  // CRUD operations
  async get(id: string): Promise<EmbeddingRecord | null>;
  async delete(id: string): Promise<boolean>;
  async deleteByFilter(filter: FilterExpression): Promise<number>;

  // Maintenance
  async reindex(): Promise<void>;
  async getStats(): Promise<VectorStoreStats>;
}

interface SearchOptions {
  limit?: number;           // Default: 10
  minScore?: number;        // Minimum similarity threshold
  includeVector?: boolean;  // Return vectors in results
}

interface SearchResult {
  id: string;
  score: number;            // Similarity score (0-1)
  metadata: Record<string, unknown>;
}

interface FilterExpression {
  entityType?: 'pattern' | 'skill' | 'content' | 'error';
  domain?: string;
  tenantId?: string;
  minVersion?: number;
}
```

### 3. SemanticPatternMatcher (new)

Bridges LearningEngine with vector search:

```typescript
// src/core/semantic-pattern-matcher.ts

class SemanticPatternMatcher {
  constructor(
    private embeddingProvider: EmbeddingProvider,
    private vectorStore: VectorStore,
    private embeddedStore: EmbeddedStore
  );

  // Index a pattern for semantic search
  async indexPattern(pattern: LearnedPattern): Promise<void>;

  // Find semantically similar patterns
  async findSimilar(
    url: string,
    options?: FindSimilarOptions
  ): Promise<SimilarPattern[]>;

  // Find patterns by content similarity
  async findByContent(
    content: string,
    options?: FindSimilarOptions
  ): Promise<SimilarPattern[]>;

  // Bulk operations for migration
  async indexAllPatterns(): Promise<IndexStats>;
  async reindexStale(): Promise<IndexStats>;
}

interface FindSimilarOptions {
  limit?: number;
  minSimilarity?: number;   // 0.0 - 1.0
  domain?: string;          // Scope to domain
  includeScores?: boolean;
}

interface SimilarPattern {
  pattern: LearnedPattern;
  similarity: number;
  matchReason: 'url' | 'content' | 'both';
}
```

## Ingestion Pipeline

### Pattern Ingestion Flow

```
1. Pattern Created/Updated in LearningEngine
          |
          v
2. Generate embedding text from pattern
   - URL template: "api.example.com/v1/users/{id}"
   - Description: "REST user lookup endpoint"
   - Content sample (if available)
          |
          v
3. Call EmbeddingProvider.generateEmbedding(text)
          |
          v
4. Create EmbeddingRecord with pattern ID
          |
          v
5. Store in LanceDB via VectorStore.add()
          |
          v
6. Update pattern in SQLite with embeddingId
```

### What Gets Embedded

| Entity | Embedding Text Source |
|--------|----------------------|
| Pattern | URL template + description + method + content mapping |
| Skill | Name + description + step summaries |
| Error | Error message + URL + context |
| Content | Page title + extracted content sample |

### Batch Ingestion for Migration

```typescript
async function migrateExistingPatterns(
  store: EmbeddedStore,
  vectorStore: VectorStore,
  embedder: EmbeddingProvider
): Promise<MigrationStats> {
  const patterns = store.getAll<LearnedPattern>('patterns');
  const batchSize = 100;
  const stats = { indexed: 0, failed: 0, skipped: 0 };

  // Process in batches for memory efficiency
  const entries = Array.from(patterns.entries());
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    // Generate embeddings for batch
    const texts = batch.map(([_, pattern]) =>
      patternToEmbeddingText(pattern)
    );
    const embeddings = await embedder.generateBatch(texts);

    // Create and store records
    const records = batch.map(([id, pattern], idx) => ({
      id,
      vector: embeddings[idx],
      model: embedder.getModelName(),
      version: 1,
      createdAt: Date.now(),
      entityType: 'pattern' as const,
      domain: extractDomain(pattern.urlPattern),
    }));

    await vectorStore.addBatch(records);
    stats.indexed += batch.length;
  }

  return stats;
}
```

## Query Pipeline

### Similarity Search Flow

```
1. Input: URL or content string
          |
          v
2. Generate query embedding
   embedder.generateEmbedding(query)
          |
          v
3. Search LanceDB with filters
   vectorStore.searchFiltered(embedding, {
     entityType: 'pattern',
     domain: targetDomain  // optional scoping
   }, { limit: 10, minScore: 0.7 })
          |
          v
4. Get full pattern records from SQLite
   results.map(r => store.get('patterns', r.id))
          |
          v
5. Rank by combined score:
   - Vector similarity (0.7 weight)
   - Confidence score (0.2 weight)
   - Recency bonus (0.1 weight)
          |
          v
6. Return top N patterns with similarity scores
```

### Integration with LearningEngine

```typescript
// In LearningEngine
class LearningEngine {
  private semanticMatcher?: SemanticPatternMatcher;

  async findPattern(url: string): Promise<LearnedPattern | null> {
    // 1. Try exact match first (fast path)
    const exactMatch = this.findExactPattern(url);
    if (exactMatch) return exactMatch;

    // 2. Try template matching (current approach)
    const templateMatch = this.findTemplateMatch(url);
    if (templateMatch && templateMatch.confidence > 0.8) {
      return templateMatch;
    }

    // 3. Try semantic similarity (new)
    if (this.semanticMatcher) {
      const similar = await this.semanticMatcher.findSimilar(url, {
        minSimilarity: 0.75,
        limit: 3
      });

      if (similar.length > 0) {
        // Best semantic match might be more relevant
        const best = similar[0];
        if (best.similarity > 0.85 ||
            (templateMatch && best.similarity > templateMatch.confidence)) {
          return best.pattern;
        }
      }
    }

    return templateMatch; // Fall back to template match
  }
}
```

## Storage Layout

### Directory Structure

```
data/
+-- llm-browser.db           # SQLite (EmbeddedStore)
+-- vectors/                  # LanceDB directory
    +-- patterns.lance/       # Pattern embeddings
    +-- skills.lance/         # Skill embeddings
    +-- content.lance/        # Content cache embeddings
```

### Sizing Estimates

| Metric | Value |
|--------|-------|
| Embedding dimensions | 384 (all-MiniLM-L6-v2) |
| Bytes per embedding | 1,536 (384 x 4 bytes) |
| Metadata per record | ~200 bytes |
| Total per record | ~1.8 KB |
| 10,000 patterns | ~18 MB |
| 100,000 patterns | ~180 MB |

## Configuration

### Environment Variables

```bash
# Enable vector storage (optional feature)
LLM_BROWSER_VECTOR_STORAGE=true

# Custom path for vector database
LLM_BROWSER_VECTOR_DB_PATH=./data/vectors

# Embedding model override (default: all-MiniLM-L6-v2)
LLM_BROWSER_EMBEDDING_MODEL=all-MiniLM-L6-v2

# Minimum similarity for matches (0.0-1.0)
LLM_BROWSER_MIN_SIMILARITY=0.75
```

### Initialization

```typescript
// In server initialization
async function initializeVectorStorage(options: ServerOptions) {
  if (!options.enableVectorStorage) {
    return null; // Vector storage is optional
  }

  try {
    const embedder = await EmbeddingProvider.create();
    const vectorStore = new VectorStore({
      dbPath: options.vectorDbPath || './data/vectors',
      dimensions: embedder.getModelDimensions()
    });
    await vectorStore.initialize();

    return new SemanticPatternMatcher(
      embedder,
      vectorStore,
      getEmbeddedStore()
    );
  } catch (error) {
    logger.warn('Vector storage unavailable, falling back to exact matching');
    return null;
  }
}
```

## Error Handling

### Graceful Degradation

Vector storage is an enhancement, not a requirement. The system degrades gracefully:

```typescript
async findPattern(url: string): Promise<LearnedPattern | null> {
  // Exact/template matching always works
  const match = this.findExactOrTemplateMatch(url);

  // Semantic search is optional enhancement
  if (this.semanticMatcher) {
    try {
      return await this.findWithSemanticFallback(url, match);
    } catch (error) {
      logger.warn('Semantic search failed, using template match', { error });
      return match;
    }
  }

  return match;
}
```

### Model Loading Failures

```typescript
class EmbeddingProvider {
  private static instance: EmbeddingProvider | null = null;
  private static loadError: Error | null = null;

  static async create(): Promise<EmbeddingProvider> {
    if (this.loadError) {
      throw this.loadError; // Don't retry failed loads
    }

    if (!this.instance) {
      try {
        this.instance = new EmbeddingProvider();
        await this.instance.initialize();
      } catch (error) {
        this.loadError = error;
        throw error;
      }
    }

    return this.instance;
  }
}
```

## Testing Strategy

### Unit Tests

1. **VectorStore** - CRUD operations, search, filtering
2. **SemanticPatternMatcher** - Indexing, similarity search
3. **EmbeddingProvider** - Model loading, embedding generation

### Integration Tests

1. Full pipeline: pattern creation -> indexing -> similarity search
2. Migration: existing patterns -> vector index
3. Cross-tenant isolation in vector space

### Benchmarks

1. Search latency at various collection sizes
2. Embedding generation throughput
3. Memory usage under load

## Rollout Plan

### Phase 1: Core Infrastructure (V-001)
- Install LanceDB
- Create VectorStore class
- Basic CRUD operations
- Unit tests

### Phase 2: Embedding Integration (V-002)
- Connect EmbeddingProvider to VectorStore
- Implement ingestion pipeline
- Auto-index new patterns
- Migration utility for existing patterns

### Phase 3: Query Integration (V-003)
- SemanticPatternMatcher implementation
- LearningEngine integration
- Fallback logic
- Performance tuning

### Phase 4: Extended Features (V-004)
- Skill similarity search
- Error pattern matching
- Content deduplication
- Analytics/reporting

## Dependencies

### New Runtime Dependencies

```json
{
  "optionalDependencies": {
    "@lancedb/lancedb": "^0.4.0"
  }
}
```

### Existing Dependencies Used

```json
{
  "optionalDependencies": {
    "@xenova/transformers": "^2.17.0"
  }
}
```

## Alternatives Considered

### SQLite with VSS Extension

**Pros:** Single database, ACID transactions
**Cons:** Less mature, complex setup, lower performance at scale

### Faiss via Python Bridge

**Pros:** Very fast, battle-tested
**Cons:** Python dependency, complex deployment, memory-only or manual persistence

### Qdrant (External Service)

**Pros:** Excellent performance, rich features
**Cons:** External service, not embedded, operational complexity

### Chroma

**Pros:** Easy Python API, good for prototyping
**Cons:** Python-first, Node.js support limited

**Decision:** LanceDB offers the best balance of:
- Native Node.js support
- Embedded (no external service)
- Good performance
- Active development
- Apache Arrow foundation (efficient)

## Success Metrics

1. **Search Quality**: >90% relevant results in top-3
2. **Latency**: <50ms for similarity search (10k patterns)
3. **Coverage**: 100% of patterns indexed
4. **Reliability**: Graceful degradation when unavailable
5. **Memory**: <200MB additional for 100k patterns

## Open Questions

1. **Model selection**: Should we support multiple embedding models?
2. **Incremental updates**: How to handle pattern updates efficiently?
3. **Tenant isolation**: Separate tables or metadata filtering?
4. **Caching**: Should we cache recent query embeddings?

---

## Appendix A: LanceDB API Reference

```typescript
import * as lancedb from '@lancedb/lancedb';

// Connect to database
const db = await lancedb.connect('./data/vectors');

// Create table with schema
const table = await db.createTable('patterns', [
  { id: 'p1', vector: new Float32Array(384), entityType: 'pattern' }
]);

// Add records
await table.add([
  { id: 'p2', vector: embedding, entityType: 'pattern' }
]);

// Search
const results = await table.search(queryVector)
  .limit(10)
  .where("entityType = 'pattern'")
  .execute();

// Delete
await table.delete("id = 'p1'");
```

## Appendix B: Embedding Text Templates

```typescript
function patternToEmbeddingText(pattern: LearnedPattern): string {
  const parts = [
    pattern.urlPattern,
    pattern.method || 'GET',
    pattern.description || '',
    pattern.contentMapping
      ? Object.keys(pattern.contentMapping).join(' ')
      : ''
  ];
  return parts.filter(Boolean).join(' ');
}

function skillToEmbeddingText(skill: Skill): string {
  const stepSummary = skill.steps
    .slice(0, 5)
    .map(s => s.description || s.action)
    .join('. ');
  return `${skill.name} ${skill.description || ''} ${stepSummary}`;
}
```
