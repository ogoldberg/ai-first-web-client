# Setup Instructions for Mac M2

## Quick Start

\`\`\`bash
# 1. Install dependencies
npm install

# 2. Install Chromium browser
npx playwright install chromium

# 3. Build the TypeScript code
npm run build

# 4. Test that it works
node dist/index.js
# You should see: "Unbrowser MCP Server running"
# Press Ctrl+C to stop
\`\`\`

## Configure Claude Desktop

1. **Find your config file:**
   \`\`\`bash
   # Open the config directory
   open ~/Library/Application\ Support/Claude/
   \`\`\`

2. **Edit \`claude_desktop_config.json\`:**

   If the file doesn't exist, create it:
   \`\`\`bash
   touch ~/Library/Application\ Support/Claude/claude_desktop_config.json
   \`\`\`

3. **Add the Unbrowser server:**
   \`\`\`json
   {
     "mcpServers": {
       "llm-browser": {
         "command": "node",
         "args": [
           "/Users/YOUR_USERNAME/path/to/ai-first-web-client/dist/index.js"
         ]
       }
     }
   }
   \`\`\`

   **Important:** Replace the path with your actual project path. To get the full path:
   \`\`\`bash
   cd /path/to/ai-first-web-client
   pwd
   \`\`\`

4. **Restart Claude Desktop**

5. **Verify it's working:**
   - Open Claude Desktop
   - Look for the tools icon (🔨)
   - You should see 6 new tools: browse, execute_api_call, save_session, etc.

## Test Your Setup

Try this in Claude Desktop:

\`\`\`
You: "Use the browse tool to fetch example.com"
\`\`\`

If everything is working, you should see:
- Page content in markdown
- Network requests
- Discovered API patterns (if any)

## Troubleshooting

### "Module not found" errors

\`\`\`bash
# Make sure you built the project
npm run build

# Check that dist/ directory exists
ls dist/
\`\`\`

### "Chromium not found" error

\`\`\`bash
# Install Chromium
npx playwright install chromium

# If that fails, try:
npx playwright install --force chromium
\`\`\`

### MCP server not showing up in Claude

1. Check your config file path is correct
2. Make sure the JSON is valid (use a JSON validator)
3. Restart Claude Desktop completely (Cmd+Q then reopen)
4. Check Claude Desktop logs:
   \`\`\`bash
   tail -f ~/Library/Logs/Claude/mcp*.log
   \`\`\`

### Permission errors

\`\`\`bash
# Make sure the built file is executable
chmod +x dist/index.js
\`\`\`

## Development Workflow

If you want to modify the code:

\`\`\`bash
# Terminal 1: Watch mode (auto-rebuild)
npm run dev

# Terminal 2: Test your changes
node dist/index.js

# After changes, restart Claude Desktop to use the updated version
\`\`\`

## What Gets Created

When you use the server, it will create:

- \`./sessions/\` - Saved browser sessions (cookies, localStorage)
- \`./knowledge-base.json\` - Learned API patterns

These are gitignored and won't be committed to the repo.

## Next Steps

Once it's working, try:

1. **Browse a simple page:**
   \`\`\`
   "Browse https://news.ycombinator.com and summarize the top stories"
   \`\`\`

2. **Discover APIs:**
   \`\`\`
   "Browse https://api.github.com and tell me what APIs you discovered"
   \`\`\`

3. **Session management:**
   \`\`\`
   "Browse https://github.com"
   (manually log in)
   "Save the session for github.com"
   "Now browse https://github.com/notifications"
   (should use saved session automatically)
   \`\`\`

4. **Check what you've learned:**
   \`\`\`
   "Show me the knowledge stats"
   \`\`\`

## Need Help?

If you run into issues:
1. Check the Claude Desktop logs (see Troubleshooting above)
2. Run the server manually and look for errors: \`node dist/index.js\`
3. Make sure Node.js version is >= 18: \`node --version\`
