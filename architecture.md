# InboxKey Architecture

## Overview

InboxKey is a Manifest V3 Chrome/Chromium extension that keeps verification-code and magic-link flows fast, private, and local-only. All parsing, storage, and decision making happens in the browser. The extension exposes three user surfaces—Popup, Settings, and Mailboxes—and orchestrates watch sessions between content scripts and a background service worker to deliver 15-second autofill targets without ever contacting a remote server.

## Architecture Principles

- **Layered microkernel.** Presentation → Application services → Domain logic → Infrastructure. Cross-layer access only through typed contracts; shared utilities stay below 350 LOC per file.
- **Privacy-first zero trust.** No external servers, strict permission grants, encrypted-at-rest secrets, and explicit UI for open-source visibility plus “Buy me a coffee” support link.
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
│                                    │ Extractors • Provider adapters │
├────────────────────────────────────┤
│ Infrastructure                     │ Storage factory • KeyManager   │
│                                    │ Encryption • Migration         │
└────────────────────────────────────┘
```

### Presentation Layer
- Popup (default surface), Settings (options page), and Mailboxes (read-only view) share React hooks that subscribe to cached background state.
- UI components live under `extension/src/popup`, `options`, and `tabs`. Design tokens and accessibility wrappers come from `ui-ux-principles.md`.
- “Buy me a coffee”, open-source license/source links, and lock indicators are always visible per guardrails.

### Application Layer
- Services under `extension/src/lib/services` expose typed commands to the UI and content scripts: `PopupBridge`, `ClipboardService`, `LinkService`, `EmailPollingService`, and `LockService`.
- Message routing uses Plasmo messaging channels with schema validation; all cross-context calls pass through application services to enforce business rules and auditing.

### Domain Layer
- Detection (`lib/detection`, `lib/extraction`, `lib/matching`) scores candidate fields, extracts OTPs/magic links, and maps results to the active domain.
- Provider adapters (`lib/providers/gmail`, `lib/providers/outlook`, future InboxBridge) normalize mail APIs into a single polling contract.
- The watch-session controller coordinates timing windows, cache hydration, confidence scoring, and manual fallback data.

### Infrastructure Layer
- Crypto (`lib/crypto`) manages master key lifecycle, AES-256-GCM encryption, PBKDF2 derivation, and lock state.
- Storage (`lib/storage`) wraps `chrome.storage.local/session` and `indexedDB` with migrations, retention windows (codes 24h, links 7d), and selective encryption for sensitive fields.
- Shared utilities (`lib/utils`, `lib/cache`) provide memoized caches, logging, and delimited background tasks.

## Runtime Components

- **Background service worker (`extension/src/background`).** Handles lifecycle orchestration, provider auth, polling scheduler (0s/5s/10s cadence), token vault, tiered cache (in-memory → session → local), and messaging gateway. Maintains a lock-safe in-memory snapshot for instant popup responses.
- **Content scripts (`extension/src/contents`).** Detect verification prompts, open Port connections for 15-second watch sessions, autofill codes, trigger link opens, render reduced-motion-friendly status chips, and recover gracefully if the worker restarts.
- **Shared libraries (`extension/src/lib`).** Encapsulate detection heuristics, extraction, matching, and provider logic. All consumers import via `@/*` aliases to enforce layering.
- **UI surfaces.** React components consume application services, show lock/open-source/support state, and provide manual actions (“Copy last code”, “Open last magic link”) as fallbacks.

## Data & Control Flow

1. **Detection.** Content script scans the DOM for OTP/magic-link signals using weighted heuristics and exclusion rules (e.g., avoid TOTP prompts).
2. **Watch session.** Upon a match, the script opens a long-lived Port, the background worker starts polling (Gmail/Outlook adapters or InboxBridge) at 0/5/10 seconds, and both sides exchange incremental cache updates.
3. **Extraction & matching.** Candidate emails from the last 10 minutes are filtered by sender/domain affinity, parsed (plain text preferred, HTML sanitized), and scored by relevance to the active site.
4. **Action.** Highest-confidence result autofills the field or opens the magic link (same-tab by default, configurable). Manual popup actions surface the cached result with sender and timestamp metadata.
5. **Cleanup.** Sessions expire at 15 seconds, interim state persists for manual use, and retention policies enforce automated purges (codes 24 h, links 7 d).

## Security & Privacy

- **Local-only data path.** No remote services; OAuth tokens and parsed content never leave the device.
- **Encryption.** Sensitive records use AES-256-GCM with per-user master keys derived via PBKDF2-SHA256 (600k iterations). Non-sensitive metadata stays plaintext for quick lookups.
- **Lock mode.** User-defined password gates any read/write operation; exponential backoff counters deter brute force. “Reset extension” wipes keys, tokens, and caches without recovery.
- **Permissions.** Minimal manifest scopes: Gmail `gmail.readonly`, Outlook `Mail.Read`, `User.Read`, `offline_access`, identity, storage, and activeTab; all disclosed in Settings/About alongside license/source/support links.
- **Safety blocks.** The extension never auto-launches password reset links, warns on risky actions, and preserves focus-visible keyboard navigation throughout.

## Provider Integrations

- **Gmail.** Chrome Identity API with managed OAuth (PKCE, no client secret), message queries `newer_than:10m`. Tokens cached by Chrome; worker retries via exponential backoff on quota issues.
- **Outlook (Microsoft Graph).** `launchWebAuthFlow` PKCE exchange, scopes `Mail.Read`, `User.Read`, `offline_access`; polling throttled to 10k req/10 min limits.
- **InboxBridge (future optional).** Native helper communicates over Chrome Native Messaging when IMAP is required; obeys same encryption and lock model.

## Build & Tooling

- **Framework:** Plasmo v0.88 with React, Vite, and MV3 bundling.
- **Language:** TypeScript (ES2020 target, strict mode, `@/*` path aliases).
- **Commands:** `npm run dev`, `npm run build`, `npm run package` (executed inside `/extension` per `development.md`).
- **Output:** Production artifacts emitted to `extension/build/chrome-mv3-prod/`.

## Testing & Validation

- **Unit tests (Vitest + happy-dom).** Cover crypto primitives, detection heuristics, extraction pipelines, storage factories, and service orchestration.
- **E2E tests (Playwright).** Validate watch sessions, popup workflows, lock/unlock, magic-link handling, and performance metrics (≤50 ms popup open, 0.3 ms field detection).
- **QA-OPS policy.** Risk-based levels per `qa-ops.md`; security-sensitive changes trigger full regression plus threat review.

## Risks & Future Work

- Reliance on Chrome Identity keeps Gmail auth simple but limits cross-browser portability.
- MV3 service-worker lifespan remains fragile; continued monitoring of keep-alive patterns is required.
- Storage quotas (10 MB `chrome.storage.local`) demand aggressive cleanup and telemetry-free operation.
- Detection false positives need ongoing tuning with design-approved UX mitigations.
- Upcoming roadmap items: optional InboxBridge IMAP support, unified mailbox viewer, and service-worker sharding once Chromium APIs mature.
