# Testing Guide

Quick guide for testing the Unbrowser MCP Server without full Claude Desktop setup.

## Quick Start

### 1. Build the project
```bash
npm run build
```

### 2. Use the dogfood tool
```bash
# Show usage
node dogfood.js

# Browse a URL
node dogfood.js browse https://example.com

# Check what you've learned
node dogfood.js stats
```

## Dogfood Tool Commands

### Browse a URL
```bash
node dogfood.js browse <url>

# Examples:
node dogfood.js browse https://news.ycombinator.com
node dogfood.js browse https://example.com
node dogfood.js browse http://localhost:3456
```

**Returns:**
- Page title and URL
- Network requests captured
- Console messages
- Discovered API patterns
- Page content (markdown)

### Call API Directly
```bash
node dogfood.js api-call <url> [method]

# Examples:
node dogfood.js api-call http://localhost:3456/api/products
node dogfood.js api-call https://api.github.com/users/octocat GET
```

**Returns:**
- Response status
- Response body
- Request duration

### View Knowledge Base Stats
```bash
node dogfood.js stats
```

**Returns:**
- Total domains with learned patterns
- Total API patterns discovered
- Patterns that can bypass rendering
- Top domains by usage

### View Learned Patterns
```bash
node dogfood.js patterns <domain>

# Examples:
node dogfood.js patterns localhost
node dogfood.js patterns github.com
node dogfood.js patterns news.ycombinator.com
```

**Returns:**
- All learned API patterns for the domain
- Confidence scores
- Bypass capability
- Authentication type

### List Saved Sessions
```bash
node dogfood.js sessions
```

**Returns:**
- All saved browser sessions
- Profile names
- Last used timestamps
- Authentication status

## End-to-End Testing

### Full Learning Component Test

This tests the entire learning workflow:

```bash
# Run the comprehensive test
node test-learning.js
```

**What it tests:**
1. Browse page and capture network traffic
2. Discover API patterns
3. Store in knowledge base
4. Retrieve learned patterns
5. Execute direct API calls

### Test with Local Server

```bash
# Terminal 1: Start test HTTP server
node test-server.js

# Terminal 2: Browse it
node dogfood.js browse http://localhost:3456

# Terminal 3: Check what was learned
node dogfood.js stats
node dogfood.js patterns localhost

# Terminal 4: Try direct API call (bypass browser)
node dogfood.js api-call http://localhost:3456/api/products
```

## Manual MCP Testing

If you want to test MCP protocol directly:

```bash
# Start server
node dist/index.js

# In another terminal, send JSON-RPC requests via stdin
# Example: List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

## Testing with Real Websites

```bash
# Test with Hacker News
node dogfood.js browse https://news.ycombinator.com

# Test with a site that has APIs
node dogfood.js browse https://api.github.com

# Check learned patterns
node dogfood.js stats
```

## Verify Files Created

After running tests, check these files:

```bash
# Knowledge base (learned patterns)
cat knowledge-base.json | jq '.'

# Sessions (if any were saved)
ls -la sessions/

# Built output
ls -la dist/
```

## Clean Start

To test from a fresh state:

```bash
# Remove learned patterns
rm knowledge-base.json

# Remove saved sessions
rm -rf sessions/

# Rebuild
npm run build

# Run tests
node test-learning.js
```

## Common Issues

### "Executable doesn't exist" error
```bash
# Install Playwright browsers
npx playwright install chromium
```

### Node version error
```bash
# Check version (need 20+)
node --version

# If using asdf
asdf local nodejs 22.12.0
```

### Build errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Port already in use
```bash
# Kill process on port 3456
lsof -ti:3456 | xargs kill -9
```

## Continuous Testing

Watch mode for development:

```bash
# Terminal 1: Watch and rebuild on changes
npm run dev

# Terminal 2: Run tests when needed
node dogfood.js browse https://example.com
```

## Test Coverage

Current test status:

✅ **Fully Tested:**
- Browser automation (Playwright)
- Network request interception
- Console log capture
- API pattern discovery
- Confidence scoring
- Knowledge base persistence
- Pattern retrieval
- Direct API execution
- Session management (basic)

⚠️ **Needs More Testing:**
- Complex authentication flows
- JS-heavy sites with dynamic APIs
- Session expiration handling
- Rate limiting
- Error recovery

🔜 **Not Yet Implemented:**
- Change detection
- Action recording/replay
- Visual debugging
- Batch operations

## Next Steps

1. **Test with real sites:**
   ```bash
   node dogfood.js browse https://your-favorite-site.com
   ```

2. **Check learning:**
   ```bash
   node dogfood.js stats
   node dogfood.js patterns <domain>
   ```

3. **Test optimization:**
   ```bash
   # First visit: slow (full render)
   node dogfood.js browse https://site.com

   # Second visit: should use learned patterns
   node dogfood.js api-call https://site.com/api/endpoint
   ```

4. **Report issues:**
   - Check console output for errors
   - Verify knowledge-base.json contains patterns
   - Test with different types of websites

## Integration Testing

To test with actual Claude Desktop:

1. Build the project: `npm run build`
2. Add to Claude Desktop config
3. Restart Claude Desktop
4. Try commands like "Browse example.com"

See README.md for full Claude Desktop setup instructions.
