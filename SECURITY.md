# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@browser-ai.dev** (or create a private security advisory on GitHub).

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity (critical: ASAP, high: 2 weeks, medium: 1 month)

## Security Best Practices

When using browser-ai:

1. **Keep dependencies updated** — Run `pnpm update` regularly
2. **Use strict privacy mode** — Set `privacyMode: 'strict'` when handling sensitive data
3. **Validate inputs** — Sanitize user inputs before passing to AI
4. **CSP headers** — Configure Content-Security-Policy appropriately for WebGPU/WASM

## Scope

This policy applies to:

- `@browser-ai/core`
- `@browser-ai/react`
- `@browser-ai/ui`
- `@browser-ai/providers-*`
- `@browser-ai/modules-*`
- `@browser-ai/cli`
