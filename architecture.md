# InboxKey Architecture

## Overview

InboxKey is a Manifest V3 Chrome/Chromium extension that keeps verification-code and magic-link flows fast, private, and local-only. All parsing, storage, and decision making happens in the browser. The extension exposes three user surfaces—Popup, Settings, and Mailboxes—and orchestrates watch sessions between content scripts and a background service worker to deliver 15-second autofill targets without ever contacting a remote server.

## Repository Structure (Monorepo)

```
/home/dev/work/inboxkey/
├── extension/                    # Main InboxKey extension (production)
│   ├── src/                     # Source code
│   ├── build/                   # Build output
│   └── package.json
├── packages/
│   └── extraction-core/          # Shared extraction logic
│       ├── src/
│       │   ├── extractor.ts     # Main extraction entry point
│       │   ├── otp-extractor.ts # OTP detection
│       │   ├── link-extractor.ts# Magic link detection
│       │   └── extraction-types.ts
│       └── package.json         # @inboxkey/extraction-core
└── apps/
    └── reviewer/                 # InboxKey Reviewer dev tool
        ├── src/                 # Reviewer UI and logic
        ├── build/               # Build output
        └── package.json
```

**Key Architecture Decision:**
- `extraction-core` is a shared package containing pure extraction logic (OTP/magic-link detection)
- Both main extension and Reviewer import from `@inboxkey/extraction-core`
- This ensures algorithm improvements benefit both tools with zero code drift
- Extraction core has NO Chrome API dependencies (pure TypeScript)
- Reviewer dev tool enables manual labeling of email batches to improve extraction accuracy

## Architecture Principles

- **Layered microkernel.** Presentation → Application services → Domain logic → Infrastructure. Cross-layer access only through typed contracts; shared utilities stay below 350 LOC per file.
- **Privacy-first zero trust.** No external servers, strict permission grants, encrypted-at-rest secrets, and explicit UI for open-source visibility plus "Buy me a coffee" support link.
- **Resilient MV3 runtime.** Every workflow tolerates service-worker restarts via idempotent requests, cached state, and defensive reconnect loops.
- **Accessibility and maintainability.** UI surfaces use the design system tokens, ARIA semantics, keyboard flows, and predictable component boundaries.

## Layered System

```
┌────────────────────────────────────┐
│ Presentation (React/Plasmo pages)  │ Popup • Settings • Mailboxes
├────────────────────────────────────┤
│ Application Services               │ PopupBridge • ClipboardService │
│                                    │ LinkService • LockService      │
├────────────────────────────────────┤
│ Domain Logic                       │ FieldDetector • CodeMatcher    │
│                                    │ @inboxkey/extraction-core      │
│                                    │ Provider adapters              │
├────────────────────────────────────┤
│ Infrastructure                     │ Storage factory • KeyManager   │
│                                    │ Encryption • Migration         │
└────────────────────────────────────┘
```

### Presentation Layer
- Popup (default surface), Settings (options page), and Mailboxes (read-only view) share React hooks that subscribe to cached background state.
- UI components live under `extension/src/popup`, `options`, and `tabs`. Design tokens and accessibility wrappers come from `ui-ux-principles.md`.
- "Buy me a coffee", open-source license/source links, and lock indicators are always visible per guardrails.

### Application Layer
- Services under `extension/src/lib/services` expose typed commands to the UI and content scripts: `PopupBridge`, `ClipboardService`, `LinkService`, `EmailPollingService`, and `LockService`.
- Message routing uses Plasmo messaging channels with schema validation; all cross-context calls pass through application services to enforce business rules and auditing.

### Domain Layer
- **Extraction Core (`@inboxkey/extraction-core`):** Pure TypeScript package with OTP/magic-link detection logic. Shared between main extension and Reviewer.
- Detection (`lib/detection`, `lib/matching`) scores candidate fields and maps extraction results to the active domain.
- Provider adapters (`lib/providers/gmail`, `lib/providers/outlook`, `lib/providers/imap-bridge`) normalize mail APIs into a single polling contract. InboxBridge (IMAP) is implemented and protocol-tested as of 2025-10-20.
- The watch-session controller coordinates timing windows, cache hydration, confidence scoring, and manual fallback data.

### Infrastructure Layer
- Crypto (`lib/crypto`) manages master key lifecycle, AES-256-GCM encryption, PBKDF2 derivation, and lock state.
- Storage (`lib/storage`) wraps `chrome.storage.local/session` and `indexedDB` with migrations, retention windows (codes 24h, links 7d), and selective encryption for sensitive fields.
- Shared utilities (`lib/utils`, `lib/cache`) provide memoized caches, logging, and delimited background tasks.

## Runtime Components

- **Background service worker (`extension/src/background`).** Handles lifecycle orchestration, provider auth, polling scheduler (0s/5s/10s cadence), token vault, tiered cache (in-memory → session → local), and messaging gateway. Maintains a lock-safe in-memory snapshot for instant popup responses.
- **Content scripts (`extension/src/contents`).** Detect verification prompts, open Port connections for 15-second watch sessions, autofill codes, trigger link opens, render reduced-motion-friendly status chips, and recover gracefully if the worker restarts.
- **Shared libraries (`extension/src/lib`).** Encapsulate detection heuristics, matching, and provider logic. All consumers import via `@/*` aliases to enforce layering.
- **Extraction Core (`packages/extraction-core`).** Pure extraction logic imported by both main extension and Reviewer. No Chrome APIs.
- **UI surfaces.** React components consume application services, show lock/open-source/support state, and provide manual actions ("Copy last code", "Open last magic link") as fallbacks.

## Data & Control Flow

1. **Detection.** Content script scans the DOM for OTP/magic-link signals using weighted heuristics and exclusion rules (e.g., avoid TOTP prompts).
2. **Watch session.** Upon a match, the script opens a long-lived Port, the background worker starts polling (Gmail/Outlook adapters or InboxBridge IMAP) at 0/5/10 seconds, and both sides exchange incremental cache updates.
3. **Extraction & matching.** Candidate emails from the last 10 minutes are filtered by sender/domain affinity, parsed (plain text preferred, HTML sanitized), and scored by `@inboxkey/extraction-core` for relevance to the active site.
4. **Action.** Highest-confidence result autofills the field or opens the magic link (same-tab by default, configurable). Manual popup actions surface the cached result with sender and timestamp metadata.
5. **Cleanup.** Sessions expire at 15 seconds, interim state persists for manual use, and retention policies enforce automated purges (codes 24 h, links 7 d).

## Security & Privacy

- **Local-only data path.** No remote services; OAuth tokens and parsed content never leave the device.
- **Encryption.** Sensitive records use AES-256-GCM with per-user master keys derived via PBKDF2-SHA256 (600k iterations). Non-sensitive metadata stays plaintext for quick lookups.
- **Lock mode.** User-defined password gates any read/write operation; exponential backoff counters deter brute force. "Reset extension" wipes keys, tokens, and caches without recovery.
- **Permissions.** Minimal manifest scopes: Gmail `gmail.readonly`, Outlook `Mail.Read`, `User.Read`, `offline_access`, identity, storage, and activeTab; all disclosed in Settings/About alongside license/source/support links.
- **Safety blocks.** The extension never auto-launches password reset links, warns on risky actions, and preserves focus-visible keyboard navigation throughout.

## Provider Integrations

- **Gmail.** Chrome Identity API with managed OAuth (PKCE, no client secret), message queries `newer_than:10m`. Tokens cached by Chrome; worker retries via exponential backoff on quota issues.
- **Outlook (Microsoft Graph).** `launchWebAuthFlow` PKCE exchange, scopes `Mail.Read`, `User.Read`, `offline_access`; polling throttled to 10k req/10 min limits.
- **InboxBridge (IMAP).** ✅ **Implemented and protocol-tested (2025-10-20).** Native Rust app (3.2MB binary) communicates over Chrome Native Messaging using JSON-RPC v1 protocol. Provides IMAP support for Yahoo Mail, custom mail servers, and other IMAP providers. Credentials stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). Protocol validation complete; IMAP server testing pending credentials. See `/inboxbridge/PROTOCOL.md` for specification.

## Build & Tooling

- **Framework:** Plasmo v0.88 with React, Vite, and MV3 bundling.
- **Language:** TypeScript (ES2020 target, strict mode, `@/*` path aliases).
- **Monorepo:** npm workspaces managing `extension`, `packages/extraction-core`, and `apps/reviewer`.
- **Commands (main extension):** `npm run dev`, `npm run build`, `npm run package` (executed inside `/extension` per `development.md`).
- **Commands (extraction-core):** `npm run build` (compiles to `dist/` for workspace consumers).
- **Commands (reviewer):** `cd apps/reviewer && pnpm run build` (dev tool only, not for public distribution).
- **Output:**
  - Main extension: `extension/build/chrome-mv3-prod/`
  - Reviewer: `apps/reviewer/build/chrome-mv3-prod/`

## Testing & Validation

- **Unit tests (Vitest + happy-dom).** Cover crypto primitives, detection heuristics, extraction pipelines, storage factories, and service orchestration.
- **E2E tests (Playwright).** Validate watch sessions, popup workflows, lock/unlock, magic-link handling, and performance metrics (≤50 ms popup open, 0.3 ms field detection).
- **QA-OPS policy.** Risk-based levels per `qa-ops.md`; security-sensitive changes trigger full regression plus threat review.

## Developer Tools

### InboxKey Reviewer (`apps/reviewer/`)

A companion dev tool extension for improving extraction accuracy through manual labeling:

**Purpose:** Generate labeled datasets to tune extraction algorithm

**Status:** Internal use only, not for public distribution

**Architecture:**
- Separate MV3 extension with unique extension ID (no conflicts with main extension)
- Shares `@inboxkey/extraction-core` for consistent extraction logic
- Uses same OAuth setup (Gmail/Outlook) but requires separate client credentials

**Workflow:**
1. Connect Gmail/Outlook accounts (read-only OAuth)
2. Fetch email batches (100-500 messages) with filters (date, sender, keywords)
3. Pre-tag using `@inboxkey/extraction-core`
4. Manual review UI (list → preview → label as TRUE/FALSE/MISSED)
5. Export JSONL with pre-tags + manual labels + reasons + notes

**Data Structure (JSONL export):**
```json
{
  "msgIdHash": "h123456",
  "provider": "gmail",
  "senderETLD": "dropbox.com",
  "receivedAt": 1729000000000,
  "subject": "Your verification code",
  "preTag": "OTP",
  "candidates": [{"type":"OTP","value":"123456","score":0.85}],
  "label": "TRUE",
  "falseReason": null,
  "correctValue": null,
  "reasons": [],
  "note": ""
}
```

**Key Benefit:** Enables data-driven algorithm improvements without modifying production extension. Claude AI analyzes JSONL exports to identify:
- False positives (preTag=OTP but label=FALSE) → Adjust deny patterns
- False negatives (preTag=NONE but label=MISSED) → Improve detection
- Scoring issues (correct preTag but low confidence) → Calibrate weights
- Common failure patterns → Add edge case handling

**Distribution:** Manual CRX sharing with selected testers. Requires OAuth setup per `apps/reviewer/OAUTH_SETUP.md`.

## Risks & Future Work

- Reliance on Chrome Identity keeps Gmail auth simple but limits cross-browser portability.
- MV3 service-worker lifespan remains fragile; continued monitoring of keep-alive patterns is required.
- Storage quotas (10 MB `chrome.storage.local`) demand aggressive cleanup and telemetry-free operation.
- Detection false positives need ongoing tuning with design-approved UX mitigations (Reviewer tool addresses this).
- Upcoming roadmap items: ✅ InboxBridge IMAP support (implemented 2025-10-20, protocol-tested), unified mailbox viewer, and service-worker sharding once Chromium APIs mature.
