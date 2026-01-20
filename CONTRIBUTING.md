# Contributing to browser-ai

Thank you for your interest in contributing to browser-ai! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and inclusive. We welcome contributions from everyone.

## Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** 8+
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/CohesiumAI/browser-ai.git
cd browser-ai

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Development Workflow

### Branch Naming

- `feature/*` — New features
- `fix/*` — Bug fixes
- `chore/*` — Maintenance tasks
- `docs/*` — Documentation updates

### Commit Messages

Follow conventional commits:

```
<type>[scope]: description

type: feat, fix, docs, chore, refactor, test, perf
scope: core, react, ui, providers-native, providers-webllm, providers-mock
```

Examples:
```
feat(core): add quota preflight check
fix(providers-webllm): handle model not found error
docs: update API reference
chore: upgrade dependencies
```

### Making Changes

1. **Create a branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes**
   - Follow existing code style
   - Add/update tests as needed
   - Update documentation if applicable

3. **Validate your changes**
   ```bash
   # Full verification (recommended)
   pnpm run verify
   
   # Or run individually:
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

4. **Add a changeset** (required for version bump + changelog)
   ```bash
   pnpm changeset
   ```
   Follow the prompts to:
   - Select affected packages
   - Choose bump type (patch/minor/major)
   - Write a summary of changes

5. **Commit and push**
   ```bash
   git add .
   git commit -m "feat(core): add new feature"
   git push origin feature/my-feature
   ```

6. **Open a Pull Request**

## Project Structure

```
browser-ai/
├── packages/
│   ├── core/                 # Core library (@cohesiumai/core)
│   ├── react/                # React hooks (@cohesiumai/react)
│   ├── ui/                   # UI components (@cohesiumai/ui)
│   ├── cli/                  # CLI tools (@cohesiumai/cli)
│   ├── providers-native/     # Chrome AI provider
│   ├── providers-webllm/     # WebLLM provider
│   ├── providers-webnn/      # WebNN provider
│   ├── providers-wasm/       # WASM fallback provider
│   ├── providers-mock/       # Mock provider for CI
│   └── modules/
│       ├── audio/            # ASR, VAD, TTS (@cohesiumai/modules-audio)
│       ├── ocr/              # Image & PDF OCR (@cohesiumai/modules-ocr)
│       ├── memory/           # Conversation context (@cohesiumai/modules-memory)
│       └── vlm/              # Vision-Language Model (@cohesiumai/modules-vlm)
├── examples/
│   ├── vite-text/            # Text generation demo
│   ├── vite-audio/           # Audio demo
│   ├── vite-ocr/             # OCR demo
│   ├── vite-memory/          # Memory demo
│   ├── vite-vlm/             # VLM demo
│   ├── vite-full/            # All modules combined
│   └── nextjs/               # Next.js SSR example
├── docs/                     # Documentation
├── .changeset/               # Changesets config
└── .github/workflows/        # CI & Release automation
```

## Coding Standards

### TypeScript

- Use **strict mode** (`"strict": true`)
- Avoid `any` — use `unknown` with type guards
- Export types from package entry points
- Document public APIs with JSDoc

### Code Style

- Use 2-space indentation
- Use single quotes for strings
- Add trailing commas
- Maximum line length: 100 characters

### Testing

- Write unit tests for new functionality
- Use the mock provider for CI tests
- Test edge cases and error conditions

```typescript
// Example test
import { describe, it, expect } from 'vitest';
import { createBrowserAI } from '@cohesiumai/core';
import { createMockProvider } from '@cohesiumai/providers-mock';

describe('BrowserAI', () => {
  it('initializes successfully', async () => {
    const ai = createBrowserAI({
      config: { providerPolicy: { order: ['mock'] } },
      providers: [createMockProvider()],
    });
    
    await ai.init();
    expect(ai.getState().name).toBe('READY');
  });
});
```

## Changesets & Versioning

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

### Adding a Changeset

Every PR that affects published packages should include a changeset:

```bash
pnpm changeset
```

This creates a markdown file in `.changeset/` describing your changes. Commit this file with your PR.

### Version Types

- **patch** — Bug fixes, internal changes (0.0.x)
- **minor** — New features, backwards-compatible (0.x.0)
- **major** — Breaking changes (x.0.0)

### What Happens on Merge

1. GitHub Actions detects changesets and opens a "Version Packages" PR
2. When merged, packages are automatically published to npm
3. GitHub Releases are created with changelogs

### When NOT to Add a Changeset

- Documentation-only changes
- Test-only changes
- Changes to examples (not published)
- Internal tooling changes

## Pull Request Guidelines

### Before Submitting

- [ ] Verification passes (`pnpm run verify`)
- [ ] Changeset added (if affecting published packages)
- [ ] Documentation updated (if applicable)

### PR Description

Include:
- **What** — Brief description of changes
- **Why** — Motivation/context
- **How** — Implementation approach
- **Testing** — How you tested the changes

### Review Process

1. Automated checks must pass
2. At least one maintainer approval required
3. Address review feedback
4. Squash and merge

## Reporting Issues

### Bug Reports

Include:
- browser-ai version
- Browser and version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Diagnostics snapshot (`ai.getDiagnostics()`)
- Console errors

### Feature Requests

Include:
- Use case description
- Proposed API/behavior
- Alternatives considered

## Architecture Decisions

Major architecture changes should be discussed in an issue first. Consider:

- Backwards compatibility
- Bundle size impact
- Performance implications
- Browser support

## Questions?

- Open a [Discussion](https://github.com/CohesiumAI/browser-ai/discussions)
- Check existing [Issues](https://github.com/CohesiumAI/browser-ai/issues)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
