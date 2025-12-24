# Unbrowser Skill Prompts

This directory contains Claude skill prompts that guide AI assistants in using Unbrowser MCP tools effectively.

## Available Skills

| Skill | File | Description |
|-------|------|-------------|
| Research Product | [research-product.md](research-product.md) | Research product info across retailers, compare prices |
| Monitor Changes | [monitor-changes.md](monitor-changes.md) | Track websites for content changes |
| Scrape Catalog | [scrape-catalog.md](scrape-catalog.md) | Extract product catalogs with pagination |
| Discover APIs | [discover-apis.md](discover-apis.md) | Find and document website APIs |
| Compare Sources | [compare-sources.md](compare-sources.md) | Cross-reference facts across multiple sources |

## How to Use

### With Claude Desktop

1. Copy the skill prompt content
2. Paste at the start of a conversation
3. Ask your question naturally

### With Claude API

Include the skill prompt in your system message:

```javascript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  system: researchProductPrompt, // Content from research-product.md
  messages: [
    { role: "user", content: "Research the Sony WH-1000XM5 headphones" }
  ],
  // ... MCP tool configuration
});
```

### As Project Knowledge

Add these files to your Claude Project's knowledge base for persistent access to the skills.

## Skill Structure

Each skill prompt includes:

1. **Objective**: What the skill accomplishes
2. **Input specification**: What the user provides
3. **Workflow**: Step-by-step tool usage
4. **Output format**: How to present results
5. **Error handling**: How to handle common issues
6. **Examples**: Sample interactions

## MCP Tool Requirements

These skills require the Unbrowser MCP server with these tools:

- `smart_browse` - Intelligent web browsing with learning
- `batch_browse` - Browse multiple URLs in parallel
- `execute_api_call` - Call discovered APIs
- `session_management` - Handle authentication sessions
- `api_auth` - Configure API authentication

## Creating New Skills

Use the YAML templates in `../` as reference for skill structure, then create a markdown prompt following the pattern in this directory.

Key elements:
- Clear objective statement
- Step-by-step workflow with tool calls
- Structured output format
- Error handling guidance
- Practical examples
