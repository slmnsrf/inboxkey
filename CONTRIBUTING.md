# Contributing to InboxKey

Thank you for your interest in contributing to InboxKey! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/inboxkey.git`
3. Install dependencies: `cd extension && pnpm install`
4. Build: `cd extension && npm run build`
5. Load the extension in Chrome: `chrome://extensions` > Developer mode > Load unpacked > select `extension/build/chrome-mv3-dev`

## Development Setup

**Prerequisites:**
- Node.js 18+
- pnpm (package manager)
- Chrome browser

**Monorepo structure:**
- `extension/` -- Chrome extension (Plasmo, React, TypeScript)
- `packages/extraction-core/` -- Email code extraction engine
- `inboxbridge/` -- Native messaging host for IMAP (Rust)
- `apps/reviewer/` -- Fine-tuning review tool

**Key commands (run from `extension/` directory):**
```bash
npm run dev          # Development server with hot reload
npm run build        # Production build (includes locale copy)
npm run type-check   # TypeScript validation
npm run test         # Run tests (Vitest)
npm run test:e2e     # End-to-end tests (Playwright)
```

## Pull Request Process

1. Create a feature branch from `main`: `git checkout -b feat/your-feature`
2. Make your changes with clear, focused commits
3. Ensure `npm run build` and `npm run type-check` pass with zero errors
4. Run tests: `npm run test`
5. Open a Pull Request against `main`

**PR guidelines:**
- Keep PRs focused on a single concern
- Write a clear description of what changed and why
- Include screenshots for UI changes
- Reference related issues (e.g., "Fixes #42")

## Commit Messages

Use conventional commit format:
```
feat: add Yahoo IMAP preset
fix: prevent stale code autofill during session
chore: update dependencies
docs: improve setup instructions
```

## Code Style

- TypeScript strict mode
- No `any` types in new code (use `unknown` + type guards)
- Prefer `const` over `let`
- Use existing design tokens for UI (no hardcoded colors/sizes)
- Keep files under ~350 lines when possible

## Privacy First

InboxKey is a privacy-first project. All contributions must:
- Process data locally only (no external API calls, no telemetry)
- Never log or store email content beyond what's needed for code extraction
- Never transmit user data anywhere

## Reporting Bugs

Use the [bug report template](https://github.com/slmnsrf/inboxkey/issues/new?template=bug_report.md) on GitHub Issues. Include:
- Steps to reproduce
- Expected vs actual behavior
- Chrome version and OS
- Console errors (if any)

## Suggesting Features

Use the [feature request template](https://github.com/slmnsrf/inboxkey/issues/new?template=feature_request.md) on GitHub Issues.

## Security Vulnerabilities

Do NOT report security vulnerabilities through public issues. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
