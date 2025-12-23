# Contributing to LLM Browser

Thank you for your interest in contributing to LLM Browser! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8+ (comes with Node.js)

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/llm-browser.git
   cd llm-browser
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. (Optional) Install Playwright for full browser rendering:
   ```bash
   npm install playwright
   npx playwright install chromium
   ```

5. Build the project:
   ```bash
   npm run build
   ```

6. Run tests:
   ```bash
   npm test
   ```

## Project Structure

```
llm-browser/
  packages/
    core/           # Core SDK (@llm-browser/core)
    mcp/            # MCP server package
  src/              # Main MCP server source
  tests/            # Test suites
  docs/             # Documentation
  website/          # Landing page
```

## How to Contribute

### Reporting Bugs

1. Check if the bug is already reported in [Issues](https://github.com/anthropics/llm-browser/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Node.js version and OS
   - Whether Playwright is installed

### Suggesting Features

1. Check existing issues and the [BACKLOG.md](docs/BACKLOG.md)
2. Create an issue with the "enhancement" label
3. Describe the use case and proposed solution

### Pull Requests

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code style

3. Add tests for new functionality

4. Run tests and ensure they pass:
   ```bash
   npm test
   ```

5. Commit with a clear message:
   ```bash
   git commit -m "feat: add new feature description"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation only
   - `test:` Adding/updating tests
   - `refactor:` Code change that neither fixes a bug nor adds a feature
   - `chore:` Maintenance tasks

6. Push and create a PR:
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style

- TypeScript with strict mode
- ESM modules (`.js` extensions in imports)
- Prefer async/await over callbacks
- Document public APIs with JSDoc
- Keep functions focused and small

### Import Order

1. Node.js built-in modules
2. External dependencies
3. Internal modules (relative imports)

### Naming Conventions

- `camelCase` for variables and functions
- `PascalCase` for classes and types
- `UPPER_SNAKE_CASE` for constants
- Descriptive names over abbreviations

## Testing

We use Vitest for testing.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Writing Tests

- Test files: `*.test.ts` in `tests/` directory
- Mirror the source structure
- Test both success and error cases
- Mock external dependencies

## Areas We Need Help With

- **Test Coverage**: Adding tests for untested modules
- **Documentation**: Improving inline docs and examples
- **Performance**: Optimizing content extraction and rendering
- **Compatibility**: Testing with different sites and frameworks
- **Bug Fixes**: Addressing issues in the tracker

## Questions?

- Open a [Discussion](https://github.com/anthropics/llm-browser/discussions)
- Check existing documentation in `/docs`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
