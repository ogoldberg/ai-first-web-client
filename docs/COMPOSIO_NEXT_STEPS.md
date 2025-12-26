# Composio Integration - Implementation Plan

**Date:** 2025-12-26
**Status:** Ready for Implementation

---

## Summary

Analysis of [Composio's awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) repository revealed **4 high-value opportunities** to enhance Unbrowser by **absorbing capabilities from existing skills** (not side-by-side integration).

See [`COMPOSIO_INTEGRATION_ANALYSIS.md`](./COMPOSIO_INTEGRATION_ANALYSIS.md) for detailed analysis.

---

## Deliverables Created

### 1. ✅ Analysis Document
**File:** `docs/COMPOSIO_INTEGRATION_ANALYSIS.md`

Comprehensive analysis covering:
- Progressive disclosure pattern (tiered knowledge loading)
- Pattern library structure (distributable skill packs)
- Capability absorption roadmap (integrate 4 Composio skills into Unbrowser)
- Implementation priorities with effort estimates

### 2. ✅ Unbrowser Skill for Marketplace
**File:** `skills/unbrowser/SKILL.md`

Ready-to-submit skill definition following Anthropic's skill format:
- YAML frontmatter with name and description
- Comprehensive usage guide
- Code examples for all major features
- Troubleshooting section
- Performance comparison table

**Next step:** Submit PR to https://github.com/ComposioHQ/awesome-claude-skills

---

## Recommended Implementation Order

Based on impact vs. effort analysis:

### Phase 1: Quick Wins (1-2 weeks)

| Priority | Task | Effort | Impact | File |
|----------|------|--------|--------|------|
| **P1** | Submit Unbrowser skill to Composio | S (1-2 hours) | High | `skills/unbrowser/SKILL.md` |
| **P2** | Enhanced Article Detection (ART-001) | S (1 day) | Medium | `src/core/content-intelligence.ts` |
| **P3** | Playwright Debug Mode (PLAY-001) | S (1 day) | Low | `src/core/tiered-fetcher.ts` |

### Phase 2: Core Enhancements (2-3 weeks)

| Priority | Task | Effort | Impact | Files |
|----------|------|--------|--------|-------|
| **P1** | Progressive Knowledge Loading (PROG-001) | M (2-3 days) | High | `src/core/procedural-memory.ts`, `src/core/learning-engine.ts` |
| **P1** | Skill Pack Infrastructure (PACK-001) | L (4-5 days) | High | `packages/api/routes/skill-packs.ts`, `packages/core/skill-packs.ts` |

### Phase 3: Advanced Features (3-4 weeks)

| Priority | Task | Effort | Impact | Notes |
|----------|------|--------|--------|-------|
| **P2** | Multi-Page Workflow Orchestration (WORK-001) | M (already in progress) | Medium | Already planned as COMP-009 in BACKLOG.md |
| **P3** | API Fuzzing Discovery (FUZZ-001) | S (1 day) | Low | `src/core/api-discovery-orchestrator.ts` |

---

## Phase 1 Details: Quick Wins

### 1. Submit Unbrowser Skill to Composio ✅ Ready

**Task:** Create PR to add Unbrowser to awesome-claude-skills marketplace

**Steps:**
1. Fork https://github.com/ComposioHQ/awesome-claude-skills
2. Add entry to README.md under "Development & Code Tools":
   ```markdown
   - **Unbrowser** - https://github.com/ogoldberg/ai-first-web-client/tree/main/skills/unbrowser
   ```
3. Copy `skills/unbrowser/SKILL.md` to fork
4. Submit PR with title: "Add Unbrowser - Intelligent Web Browsing Skill"
5. PR description:
   ```markdown
   Adds Unbrowser, an intelligent web browsing API that:
   - Learns from browsing patterns to eliminate rendering overhead
   - Discovers APIs automatically for 10x faster extraction
   - Supports authenticated sessions and multi-step workflows
   - Provides both local MCP server and cloud API access

   The skill is ready to use via npm (`llm-browser`) or Claude Desktop MCP configuration.
   ```

**Effort:** 1-2 hours
**Impact:** High - Marketing & discovery channel
**Owner:** TBD
**Deadline:** Within 1 week

---

### 2. Enhanced Article Detection (ART-001)

**Task:** Improve article content extraction in ContentIntelligence

**Implementation:**

```typescript
// src/core/content-intelligence.ts

interface ArticleMetadata {
  isArticle: boolean;
  author?: string;
  publishDate?: Date;
  modifiedDate?: Date;
  tags?: string[];
  category?: string;
  mainContent?: string;
  wordCount?: number;
}

class ContentIntelligence {
  /**
   * Detect if page is an article and extract article-specific metadata
   */
  detectArticle($: CheerioAPI, url: string): ArticleMetadata {
    const indicators = {
      hasArticleTag: $('article').length > 0,
      hasArticleSchema: this.hasSchemaType($, 'Article'),
      hasOgArticle: $('meta[property="og:type"]').attr('content') === 'article',
      hasAuthor: $('meta[name="author"]').length > 0 || $('.author').length > 0,
      hasPublishDate: this.findPublishDate($) !== null,
      hasArticleStructure: this.detectArticleStructure($),
    };

    const isArticle = Object.values(indicators).filter(Boolean).length >= 3;

    if (!isArticle) {
      return { isArticle: false };
    }

    return {
      isArticle: true,
      author: this.extractAuthor($),
      publishDate: this.findPublishDate($),
      modifiedDate: this.findModifiedDate($),
      tags: this.extractTags($),
      category: this.extractCategory($),
      mainContent: this.extractMainArticleContent($),
      wordCount: this.countWords($),
    };
  }

  private extractMainArticleContent($: CheerioAPI): string {
    // Priority order for article content:
    // 1. <article> tag
    // 2. [itemprop="articleBody"]
    // 3. .post-content, .article-content, .entry-content (common CMS classes)
    // 4. Largest <div> with high text-to-HTML ratio

    const selectors = [
      'article',
      '[itemprop="articleBody"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      'main article',
    ];

    for (const selector of selectors) {
      const content = $(selector).first();
      if (content.length && this.getTextLength(content) > 200) {
        // Remove navigation, ads, related posts
        content.find('nav, aside, .related-posts, .advertisement').remove();
        return this.htmlToMarkdown(content.html() || '');
      }
    }

    // Fallback: Find largest content block
    return this.findLargestContentBlock($);
  }

  private detectArticleStructure($: CheerioAPI): boolean {
    // Articles typically have:
    // - Long-form text (>500 words)
    // - Paragraphs (<p> tags)
    // - Headings (<h1>, <h2>, etc.)
    // - Low link density (< 0.3 links per 100 words)

    const paragraphs = $('p').length;
    const headings = $('h1, h2, h3, h4').length;
    const wordCount = this.countWords($);
    const linkCount = $('a').length;
    const linkDensity = linkCount / (wordCount / 100);

    return (
      wordCount > 500 &&
      paragraphs > 5 &&
      headings > 2 &&
      linkDensity < 0.3
    );
  }
}
```

**Testing:**
- Add tests with known article sites (Medium, Dev.to, personal blogs)
- Verify metadata extraction accuracy
- Compare with existing extraction (should be more accurate)

**Effort:** 1 day
**Impact:** Medium - Better content extraction quality
**Owner:** TBD
**Deadline:** Within 2 weeks

---

### 3. Playwright Debug Mode (PLAY-001)

**Task:** Add teaching/debug mode to Playwright tier with visible browser, screenshots, and console logs

**Implementation:**

```typescript
// src/core/tiered-fetcher.ts

interface PlaywrightDebugOptions {
  visible?: boolean;        // Show browser window (headless: false)
  slowMotion?: number;      // ms delay between actions (default: 100)
  screenshots?: boolean;    // Capture after each action
  consoleLogs?: boolean;    // Collect console output
}

interface PlaywrightDebugResult {
  screenshots: Array<{
    action: string;
    timestamp: number;
    image: string;  // Base64
  }>;
  consoleLogs: Array<{
    type: 'log' | 'warn' | 'error';
    message: string;
    timestamp: number;
  }>;
  actionTrace: Array<{
    action: string;
    duration: number;
    success: boolean;
  }>;
}

class TieredFetcher {
  async fetchWithPlaywright(
    url: string,
    options: { debug?: PlaywrightDebugOptions }
  ): Promise<{ content: any; debug?: PlaywrightDebugResult }> {
    const debugResult: PlaywrightDebugResult = {
      screenshots: [],
      consoleLogs: [],
      actionTrace: [],
    };

    const browser = await playwright.chromium.launch({
      headless: !options.debug?.visible,
      slowMo: options.debug?.slowMotion ?? 100,
    });

    const page = await browser.newPage();

    // Collect console logs
    if (options.debug?.consoleLogs) {
      page.on('console', (msg) => {
        debugResult.consoleLogs.push({
          type: msg.type() as any,
          message: msg.text(),
          timestamp: Date.now(),
        });
      });
    }

    // Navigate with tracing
    const navStart = Date.now();
    await page.goto(url);
    debugResult.actionTrace.push({
      action: `navigate to ${url}`,
      duration: Date.now() - navStart,
      success: true,
    });

    // Capture screenshot after navigation
    if (options.debug?.screenshots) {
      const screenshot = await page.screenshot({ encoding: 'base64' });
      debugResult.screenshots.push({
        action: 'navigate',
        timestamp: Date.now(),
        image: screenshot as string,
      });
    }

    // ... rest of Playwright logic ...

    await browser.close();

    return {
      content: extractedContent,
      debug: options.debug ? debugResult : undefined,
    };
  }
}
```

**API Integration:**

```typescript
// packages/api/routes/browse.ts

POST /v1/browse
{
  "url": "https://example.com",
  "debug": {
    "visible": true,
    "slowMotion": 150,
    "screenshots": true,
    "consoleLogs": true
  }
}

// Response includes debug data
{
  "content": { ... },
  "debug": {
    "screenshots": [...],
    "consoleLogs": [...],
    "actionTrace": [...]
  }
}
```

**Effort:** 1 day
**Impact:** Low - Nice for debugging, not critical
**Owner:** TBD
**Deadline:** Within 2 weeks

---

## Phase 2 Details: Core Enhancements

### 4. Progressive Knowledge Loading (PROG-001)

**Task:** Add tiered loading to ProceduralMemory and LearningEngine

See detailed implementation in `COMPOSIO_INTEGRATION_ANALYSIS.md` section 1.

**Key changes:**
- Add `tier` field to `BrowsingSkill` type
- Modify `ProceduralMemory` to support lazy loading
- Create migration script to classify existing skills
- Update `SmartBrowser` to trigger tier loading

**Files:**
- `src/types/index.ts` (add tier field)
- `src/core/procedural-memory.ts` (lazy loading)
- `src/core/learning-engine.ts` (lazy loading)
- `src/core/smart-browser.ts` (trigger loading)
- `scripts/migrate-skill-tiers.ts` (migration)

**Effort:** 2-3 days
**Impact:** High - Scalability & performance
**Owner:** TBD
**Deadline:** Within 1 month

---

### 5. Skill Pack Infrastructure (PACK-001)

**Task:** Enable distribution and installation of pre-learned skill packs

See detailed implementation in `COMPOSIO_INTEGRATION_ANALYSIS.md` section 2.

**Components:**

1. **SkillPack Type** (`src/types/index.ts`)
2. **Export/Import** (`src/core/procedural-memory.ts`)
3. **API Endpoints** (`packages/api/routes/skill-packs.ts`)
4. **SDK Methods** (`packages/core/skill-packs.ts`)
5. **MCP Support** (`packages/mcp/skill-packs.ts`)

**Official Packs to Create:**
- `@unbrowser/skills-linkedin` - LinkedIn profile extraction
- `@unbrowser/skills-ecommerce` - Product pages, pricing
- `@unbrowser/skills-news` - Article extraction
- `@unbrowser/skills-github` - Repository data, API discovery

**Effort:** 4-5 days
**Impact:** High - New distribution channel
**Owner:** TBD
**Deadline:** Within 1 month

---

## Success Metrics

Track these metrics to measure success:

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| **Skill Downloads** (awesome-claude-skills) | 0 | 100 stars | 3 months |
| **Memory Footprint** (PROG-001) | ~50MB | <10MB | 1 month |
| **Article Extraction Accuracy** (ART-001) | 85% | 95% | 2 weeks |
| **Skill Pack Installs** (PACK-001) | 0 | 500 installs | 3 months |

---

## Next Actions

### Immediate (This Week)
- [ ] **Review** this plan with team
- [ ] **Assign** owners for Phase 1 tasks
- [ ] **Submit** Unbrowser skill PR to Composio

### Short Term (2 Weeks)
- [ ] **Implement** ART-001 (Enhanced Article Detection)
- [ ] **Implement** PLAY-001 (Playwright Debug Mode)
- [ ] **Start** PROG-001 design document

### Medium Term (1 Month)
- [ ] **Complete** PROG-001 (Progressive Loading)
- [ ] **Complete** PACK-001 (Skill Pack Infrastructure)
- [ ] **Release** first official skill pack (`@unbrowser/skills-linkedin`)

---

## References

- [Composio Integration Analysis](./COMPOSIO_INTEGRATION_ANALYSIS.md)
- [Unbrowser Skill Definition](../skills/unbrowser/SKILL.md)
- [Composio awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)
- [Unbrowser Backlog](./BACKLOG.md)
