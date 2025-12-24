# Human Verification Patterns

**Status:** Design Document
**Updated:** 2025-12-24

## Philosophy

Unbrowser is **machine-first, not human-first**. The user is an AI agent, not a human.

However, **humans need to verify that AI agents are doing the right thing**. This document describes patterns for human verification and skill authoring **without scope creep into human browser recording**.

---

## Why Not Human Browser Recording?

### The Question
> "Should we add a feature where humans record workflows in a browser to teach the AI?"

### The Answer: No (Scope Creep)

**Reasons:**
1. **Mission conflict**: Project is explicitly "NOT an AI-enhanced browser for humans"
2. **Architecture mismatch**: Would require browser extension, visual UI, human action capture
3. **Maintenance burden**: Two code paths (human workflows vs AI workflows)
4. **Competitive analysis**: Anthropic Chrome extension already does this - we differentiate by being faster

**Core philosophy:**
> "Browser Minimizer" - Learn to skip rendering for 10x speed

Human recording would slow this down and muddy the focus.

---

## Alternative: Human-in-the-Loop Verification

### Pattern 1: Manual Skill Authoring

**Already supported!** Humans can write skills directly:

```typescript
import { ProceduralMemory } from '@unbrowser/core';

const memory = new ProceduralMemory();

// Human authors a skill (no browser recording needed)
memory.addManualSkill({
  name: 'extract_hn_story',
  description: 'Extract story details from HN item page',
  domain: 'news.ycombinator.com',
  urlPattern: '/item\\?id=',
  steps: [
    {
      action: 'extract',
      selector: '.titleline > a',
      field: 'title',
    },
    {
      action: 'extract',
      selector: '.score',
      field: 'points',
    },
    {
      action: 'extract',
      selector: '.age',
      field: 'age',
    },
  ],
});
```

**Benefits:**
- ✅ No browser recording infrastructure needed
- ✅ Clear, declarative skill definition
- ✅ Version control friendly (skills are code)
- ✅ Can be automated, tested, shared

### Pattern 2: Post-Browse Verification

**Verify results after AI browses, not during:**

```typescript
// AI browses and records workflow
const result = await browser.browse(url, {
  recordWorkflow: true,
  useSkills: true
});

// Human reviews the result
const humanApproved = await reviewResult(result);

if (humanApproved) {
  // Positive feedback strengthens the skill
  memory.provideFeedback(result.learning.skillApplied, {
    rating: 'positive',
    comment: 'Correctly extracted all required fields',
    context: { url, timestamp: Date.now() }
  });
} else {
  // Negative feedback triggers rollback or correction
  memory.provideFeedback(result.learning.skillApplied, {
    rating: 'negative',
    correction: 'Should use selector .story-title instead of .titleline',
    context: { url, timestamp: Date.now() }
  });
}
```

**Benefits:**
- ✅ Leverages existing SkillFeedback system
- ✅ Human reviews outputs, not processes
- ✅ Faster than recording (review vs re-do)
- ✅ Can be batched/automated

### Pattern 3: Skill Validation Suite

**Test skills before deployment:**

```typescript
// Define test cases
const testCases = [
  {
    url: 'https://news.ycombinator.com/item?id=12345',
    expected: {
      title: 'Example Story Title',
      points: '123',
      age: '2 hours ago'
    }
  },
  // ... more test cases
];

// Validate skill
async function validateSkill(skillId: string, testCases: TestCase[]) {
  const results = [];

  for (const testCase of testCases) {
    const result = await browser.browse(testCase.url, {
      useSkills: true,
      skillFilter: [skillId]  // Force use of this skill
    });

    const passed = deepEqual(result.extracted, testCase.expected);
    results.push({ url: testCase.url, passed, actual: result.extracted });
  }

  return {
    skillId,
    totalTests: testCases.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results
  };
}

// Human reviews validation report
const validationReport = await validateSkill('extract_hn_story', testCases);
console.log(validationReport);
```

**Benefits:**
- ✅ Automated regression testing
- ✅ Human defines expectations, machine validates
- ✅ CI/CD compatible
- ✅ Catches skill degradation over time

---

## Recommended Improvements

### 1. Better Skill Authoring Tools

**Problem:** Manual skill creation requires understanding internal types

**Solutions:**
- CLI tool: `unbrowser create-skill --domain example.com`
- Interactive prompts for skill parameters
- Skill templates library (forms, tables, pagination, etc.)
- Validation during authoring

**Example:**
```bash
$ unbrowser create-skill

? Skill name: extract_product_details
? Domain: shop.example.com
? URL pattern: /products/.+
? Page type: (detail)
  ❯ detail
    list
    form
    search

? Actions:
  ❯ extract .product-title → name
    extract .price → price
    extract .description → description
    [Add more actions]

✓ Skill created: extract_product_details.json
✓ Run validation: unbrowser validate extract_product_details.json
```

### 2. Skill Verification API

**Problem:** No built-in way to test skills before deployment

**Solutions:**
- `verifySkill(skillId, testUrls)` method
- Returns pass/fail with extracted data
- Human reviews results, not recordings
- Export validation reports

**Example:**
```typescript
const verification = await memory.verifySkill('extract_hn_story', [
  'https://news.ycombinator.com/item?id=12345',
  'https://news.ycombinator.com/item?id=67890',
]);

console.log(verification);
// {
//   skillId: 'extract_hn_story',
//   tested: 2,
//   succeeded: 2,
//   failed: 0,
//   results: [...]
// }
```

### 3. Skill Templates Library

**Problem:** Every user has to author common patterns

**Solutions:**
- Pre-built skill templates for common scenarios
- Community-contributed skill packs
- Domain-specific skill libraries

**Example:**
```typescript
import { skillTemplates } from '@unbrowser/skill-templates';

// Use a pre-built template
memory.addSkillFromTemplate('paginated_list', {
  domain: 'example.com',
  listSelector: '.results > .item',
  nextSelector: '.pagination .next',
  fields: {
    title: '.item-title',
    link: '.item-link',
  }
});
```

### 4. Feedback-Driven Learning

**Problem:** Skills degrade over time, need human correction

**Solutions:**
- Enhanced feedback system (already exists, needs better UX)
- Automatic rollback on negative feedback
- Feedback analytics dashboard
- "Suggest correction" mode

**Example:**
```typescript
// Skill applied but produced wrong result
memory.provideFeedback(skillId, {
  rating: 'negative',
  correction: {
    // What went wrong
    failedSelector: '.old-title-class',
    // What should be used instead
    suggestedSelector: '.new-title-class',
    // Why it failed
    reason: 'Site redesign changed class names'
  },
  autoRollback: true  // Rollback to previous version
});
```

---

## If You *Really* Need Human Recording...

### Separate Package Approach

If human browser recording is absolutely necessary, implement as **optional add-on**:

**Package:** `@unbrowser/human-trainer` (separate from core)

**Features:**
- Browser extension for recording human actions
- Outputs skills in ProceduralMemory format
- Optional dependency, not core
- Clear separation: AI-first core + human authoring tool

**Architecture:**
```
┌─────────────────────────────────────┐
│   @unbrowser/core (AI-first)        │
│   - Machine browsing                │
│   - Workflow recording              │
│   - Skill learning                  │
└─────────────────────────────────────┘
                 ↑
                 │ Outputs skills
                 │
┌─────────────────────────────────────┐
│   @unbrowser/human-trainer (opt-in)│
│   - Browser extension               │
│   - Human action recording          │
│   - Skill export                    │
└─────────────────────────────────────┘
```

**Guidelines:**
- ✅ Separate repo/package
- ✅ Optional dependency
- ✅ Outputs standard skill format
- ✅ Does not pollute core API
- ✅ Maintained independently

---

## Decision: No Human Recording in Core

**Reasons:**
1. ✅ Existing manual skill authoring works
2. ✅ Feedback system already supports correction
3. ✅ Would add significant complexity
4. ✅ Conflicts with "machine-first" philosophy
5. ✅ Competitive differentiation is speed, not human recording

**Instead:**
- Improve manual skill authoring tools
- Better verification/validation workflows
- Enhanced feedback mechanisms
- Community skill templates

**If needed later:**
- Separate optional package
- Keep core API clean
- Machine-first philosophy intact

---

## Implementation Priorities

See [BACKLOG.md](BACKLOG.md) for tasks:
- `SKILL-001`: CLI tool for skill authoring
- `SKILL-002`: Skill verification API
- `SKILL-003`: Skill templates library
- `SKILL-004`: Enhanced feedback system
- `SKILL-005`: Validation test framework

**Status:** All tasks in P2 (nice-to-have improvements)

---

## Summary

✅ **Do:** Improve human verification through better tooling
❌ **Don't:** Add human browser recording to core
🎯 **Focus:** Machine-first API with human oversight capabilities
