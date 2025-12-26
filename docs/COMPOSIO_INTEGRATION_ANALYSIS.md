# Composio Skills Integration Analysis

**Date:** 2025-12-26
**Purpose:** Analyze how to integrate capabilities from Composio's awesome-claude-skills into Unbrowser

---

## Executive Summary

After analyzing the [Composio awesome-claude-skills repository](https://github.com/ComposioHQ/awesome-claude-skills), we identified four key opportunities to enhance Unbrowser:

1. **Progressive Disclosure Pattern** - Tiered knowledge loading system
2. **Pattern Library** - Pre-learned browsing skills as distributable packs
3. **Capability Absorption** - Integrate patterns from existing skills into Unbrowser
4. **Marketplace Presence** - Publish Unbrowser skill for discoverability

This document focuses on **absorbing capabilities INTO Unbrowser** rather than side-by-side integration.

---

## 1. Progressive Disclosure Pattern

### What It Is

The [Playwright skill](https://github.com/lackeyjb/playwright-skill) uses a three-tier knowledge system:

- **SKILL.md** - Core instructions (always loaded, ~100-200 lines)
- **API_REFERENCE.md** - Advanced features (loaded on-demand for complex tasks)
- **lib/helpers.js** - Utility functions (referenced when needed)

This prevents context bloat while keeping detailed knowledge accessible.

### How Unbrowser Can Apply It

#### Current State
Unbrowser has sophisticated learning systems but loads everything into memory:

```typescript
// ProceduralMemory loads all skills at once
class ProceduralMemory {
  private skills: Map<string, BrowsingSkill>; // All skills in memory
}

// LearningEngine loads all patterns
class LearningEngine {
  private entries: Map<string, EnhancedKnowledgeBaseEntry>; // All patterns
}
```

#### Proposed Enhancement

**Task: PROG-001 - Progressive Knowledge Loading**

Add a tiered loading system to ProceduralMemory and LearningEngine:

```typescript
// Tier 1: Always-loaded essentials (cookie banners, common patterns)
// Tier 2: Domain-specific skills (loaded when domain matches)
// Tier 3: Advanced/rare patterns (loaded on explicit need)

interface SkillTier {
  tier: 'essential' | 'domain-specific' | 'advanced';
  loadPriority: number;
  sizeEstimate: number; // KB
}

class ProceduralMemory {
  private essentialSkills: Map<string, BrowsingSkill>;      // Tier 1: Always loaded
  private domainSkillIndex: Map<string, string[]>;          // Tier 2: Lazy load by domain
  private advancedSkillIndex: Map<string, string[]>;        // Tier 3: Lazy load on demand

  async loadSkillsForDomain(domain: string): Promise<void> {
    // Load domain-specific skills only when needed
  }

  async loadAdvancedSkill(skillId: string): Promise<void> {
    // Load advanced skills on explicit request
  }
}
```

**Benefits:**
- Reduced memory footprint (load only what's needed)
- Faster startup (essential patterns only)
- Better scalability (handle 10,000+ patterns without bloat)

**Implementation:**
- Add `tier` field to `BrowsingSkill` type
- Modify `ProceduralMemory` to support lazy loading
- Create migration script to classify existing skills into tiers
- Update `SmartBrowser` to trigger tier-2/3 loading based on context

**Effort:** M (2-3 days)
**Priority:** P2

---

## 2. Pattern Library (Pre-learned Skill Packs)

### Concept

Like npm packages, but for browsing patterns. Users can install pre-learned skills for common verticals:

```bash
# Install LinkedIn profile extraction patterns
npm install @unbrowser/skills-linkedin

# Or via API
const client = createUnbrowser({ apiKey: '...' });
await client.installSkillPack('linkedin-profiles');
```

### Vertical-Specific Skill Packs

Based on Unbrowser's existing `SkillVertical` enum and Composio skills:

| Pack Name | Description | Based On | Skills Included |
|-----------|-------------|----------|-----------------|
| `e-commerce` | Product pages, pricing, inventory | Composio patterns | Product extraction, price monitoring, add-to-cart |
| `linkedin-profiles` | LinkedIn profile data | Lead Research skill | Profile scraping, company info, connections |
| `developer-platforms` | GitHub, NPM, PyPI | Existing site handlers | Repo data, package info, API discovery |
| `news-articles` | News sites, blogs | Article Extractor skill | Clean article text, author, publish date |
| `government-forms` | Gov websites, permits | Government vertical | Form extraction, requirements, fees, timelines |
| `job-postings` | Job boards | Recruitment vertical | Job details, requirements, salary, apply link |

### Implementation Plan

**Task: PACK-001 - Skill Pack Infrastructure**

1. **Export Format:**
```typescript
interface SkillPack {
  name: string;
  version: string;
  vertical: SkillVertical;
  skills: BrowsingSkill[];
  patterns: EnhancedApiPattern[];
  metadata: {
    author: string;
    description: string;
    compatibility: string; // Min Unbrowser version
    verified: boolean;     // Official Unbrowser pack
  };
}
```

2. **Distribution:**
```typescript
// Cloud API endpoint
POST /v1/skill-packs/install
{
  "packName": "linkedin-profiles",
  "version": "1.0.0"
}

// SDK method
await client.installSkillPack('linkedin-profiles', { version: '1.0.0' });

// MCP server support
await browser.installSkillPack('linkedin-profiles');
```

3. **Marketplace Integration:**
- Publish official packs to npm under `@unbrowser/skills-*`
- Host community packs registry at `packs.unbrowser.ai`
- Add skill pack browser to admin UI

**Effort:** L (4-5 days)
**Priority:** P2

---

## 3. Capability Absorption from Composio Skills

### Skill-by-Skill Analysis

#### A. Playwright Browser Automation Skill
**URL:** https://github.com/lackeyjb/playwright-skill

**What It Provides:**
- Visible browser with slow motion (debugging/teaching mode)
- Screenshot capture on every action
- Console output collection
- Custom Playwright script execution

**What Unbrowser Already Has:**
- Playwright integration (tier 3 renderer)
- Screenshot capability (via TieredFetcher)

**What to Absorb:**
- **Teaching/Debug Mode:** Run Playwright with visible browser + slow motion for debugging
- **Action-by-action screenshots:** Capture screenshot after each action in a workflow
- **Console log collection:** Save browser console output for troubleshooting

**Task: PLAY-001 - Enhanced Playwright Debug Mode**

```typescript
interface PlaywrightOptions {
  debugMode?: {
    visible: boolean;        // headless: false
    slowMotion: number;      // ms delay between actions
    screenshots: boolean;    // Capture after each action
    consoleLogs: boolean;    // Collect console output
  };
}

class TieredFetcher {
  async fetchWithPlaywright(url: string, options: PlaywrightOptions) {
    if (options.debugMode) {
      // Launch visible browser with slow motion
      // Capture screenshots after each navigation/click
      // Collect console logs
      return {
        content,
        debug: {
          screenshots: string[];  // Base64 images
          consoleLogs: string[];  // Console messages
          actionTrace: string[];  // "navigated to X", "clicked Y"
        }
      };
    }
  }
}
```

**Effort:** S (1 day)
**Priority:** P3 (nice-to-have for debugging)

---

#### B. Article Extractor Skill
**URL:** https://github.com/michalparkola/tapestry-skills-for-claude-code/tree/main/article-extractor

**What It Provides:**
- Article-specific extraction patterns
- Clean article text without ads/navigation
- Author, publish date, tags extraction

**What Unbrowser Already Has:**
- `ContentIntelligence` with framework extraction
- Structured data parsing (JSON-LD, OpenGraph)
- Site handlers for Medium, Dev.to

**What to Absorb:**
- **Article-specific heuristics:** Better "is this an article?" detection
- **Readability patterns:** Extract "main article content" more reliably

**Task: ART-001 - Enhanced Article Detection**

Add article-specific patterns to ContentIntelligence:

```typescript
class ContentIntelligence {
  detectArticle(html: string): ArticleMetadata | null {
    // Check for article indicators:
    // - <article> tag
    // - schema.org/Article JSON-LD
    // - OpenGraph article metadata
    // - Common CMS patterns (WordPress, Ghost, etc.)

    return {
      isArticle: boolean;
      author: string;
      publishDate: Date;
      modifiedDate: Date;
      tags: string[];
      category: string;
      mainContent: string;  // Clean article text
    };
  }
}
```

**Effort:** S (1 day)
**Priority:** P2 (improves content extraction quality)

---

#### C. FFUF Web Fuzzing Skill
**URL:** https://github.com/jthack/ffuf_claude_skill

**What It Provides:**
- API endpoint discovery via fuzzing common paths (`/api/*`, `/v1/*`, etc.)
- Parameter fuzzing for hidden query params
- Directory enumeration

**What Unbrowser Already Has:**
- API prediction via JavaScript analysis
- OpenAPI/GraphQL discovery
- Pattern-based API learning

**What to Absorb:**
- **Fuzzing-based discovery:** Complement pattern learning with brute-force discovery
- **Common API path wordlists:** Pre-defined paths to check

**Task: FUZZ-001 - API Fuzzing Discovery**

Add fuzzing-based discovery to complement existing pattern learning:

```typescript
class ApiDiscoveryOrchestrator {
  async discoverViaFuzzing(baseUrl: string): Promise<ApiEndpoint[]> {
    const commonPaths = [
      '/api', '/api/v1', '/api/v2',
      '/graphql', '/rest', '/v1',
      '/.well-known/openapi.json',
      '/swagger.json', '/docs'
    ];

    // Try each path, collect 200/301 responses
    // Learn successful patterns for future
    return endpoints;
  }
}
```

**Effort:** S (1 day)
**Priority:** P3 (nice-to-have, existing discovery is good)

---

#### D. Lead Research Assistant
**URL:** In Composio repository (skills/lead-research-assistant/)

**What It Provides:**
- Multi-page data gathering workflows
- Company information aggregation from multiple sources
- Contact detail extraction

**What Unbrowser Already Has:**
- Batch browse (`/v1/batch`)
- Session management
- ProceduralMemory for workflows

**What to Absorb:**
- **Multi-page workflows:** "Visit homepage, then /about, then /contact, aggregate results"
- **Cross-page data linking:** Merge data from multiple pages into single entity

**Task: WORK-001 - Multi-Page Workflow Orchestration**

This is already planned! See BACKLOG.md task **COMP-009 - Workflow Recording & Replay**:

```typescript
// Workflow: Extract company info
const workflow = await client.recordWorkflow(async (recorder) => {
  const homepage = await recorder.browse('https://example.com');
  const about = await recorder.browse('https://example.com/about');
  const contact = await recorder.browse('https://example.com/contact');

  return {
    name: homepage.content.structured?.companyName,
    description: about.content.text,
    email: contact.content.structured?.email,
  };
});

// Replay on different company
const result = await workflow.replay('https://another-company.com');
```

**Status:** Partially implemented (API endpoints exist, need SDK wrappers)
**Effort:** M (already in progress)
**Priority:** P1 (already planned as COMP-009)

---

## 4. Unbrowser Skill for Marketplace

See `UNBROWSER_SKILL.md` (created separately) for the complete skill definition to submit to awesome-claude-skills.

---

## Implementation Priorities

Based on effort vs. impact:

| Priority | Task ID | Description | Effort | Impact |
|----------|---------|-------------|--------|--------|
| **P1** | PACK-001 | Skill Pack Infrastructure | L | High - New distribution channel |
| **P2** | PROG-001 | Progressive Knowledge Loading | M | High - Scalability & performance |
| **P2** | ART-001 | Enhanced Article Detection | S | Medium - Better extraction quality |
| **P2** | Skill Submission | Submit Unbrowser skill to Composio | S | High - Marketing & discovery |
| **P3** | PLAY-001 | Playwright Debug Mode | S | Low - Nice for debugging |
| **P3** | FUZZ-001 | API Fuzzing Discovery | S | Low - Existing discovery is good |

---

## Next Steps

1. ✅ **Create Unbrowser skill** for awesome-claude-skills submission
2. **Implement PACK-001** - Enable skill pack distribution
3. **Apply PROG-001** - Add progressive disclosure to ProceduralMemory
4. **Enhance ART-001** - Improve article detection
5. **Submit to Composio** - PR to awesome-claude-skills repo

---

## References

- [Composio awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Claude Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)
- [Mikhail Shilkov's Skills Guide](https://mikhail.io/2025/10/claude-code-skills/)
- [Anthropic Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Unbrowser BACKLOG.md](./BACKLOG.md)
