# InboxKey Architecture

-- Changes made to this file must always be concise! Max. 350 LOC.

## Overview

InboxKey is a Manifest V3 Chrome/Chromium extension that keeps verification-code and magic-link flows fast, private, and local-only. All parsing, storage, and decision making happens in the browser. The extension exposes three user surfaces—Popup, Settings, and Mailboxes—and orchestrates watch sessions between content scripts and a background service worker to deliver 15-second autofill targets without ever contacting a remote server.

## Repository Structure (Monorepo)

```
/home/dev/work/inboxkey/
├── extension/                    # Main InboxKey extension (production)
│   ├── src/
│   │   ├── contents/            # Content scripts (injected into web pages)
│   │   │   ├── index.ts             # Detection orchestration & initialization
│   │   │   ├── watch-session.ts     # Session lifecycle & Port communication
│   │   │   ├── autofill.ts          # Safe code injection & validation
│   │   │   ├── code-fetcher.ts      # Code retrieval coordination
│   │   │   ├── badge-manager.ts     # Visual feedback badges
│   │   │   ├── session-chip.ts      # Session status UI
│   │   │   ├── notification.ts      # User notifications
│   │   │   └── submit-button-finder.ts # Auto-submit logic
│   │   ├── background/          # Service worker (MV3)
│   │   │   ├── index.ts             # Main worker, message routing
│   │   │   ├── session-controller.ts # Watch session orchestration
│   │   │   ├── session-poller.ts    # MV3-resilient alarm-based polling
│   │   │   ├── popup-handler.ts     # Popup bridge
│   │   │   └── popup-cache.ts       # In-memory cache for popup
│   │   ├── lib/
│   │   │   ├── detection/       # Field detection engine
│   │   │   │   ├── field-detector.ts    # Dual-tier orchestration (592 LOC)
│   │   │   │   ├── tier1-fast.ts        # Fast attribute matching (~0.14ms)
│   │   │   │   ├── tier2-deep.ts        # Deep context analysis (~0.45ms)
│   │   │   │   ├── signal-classifier.ts # Layer 5 (Tier 1): Delivery channel detection (681 LOC)
│   │   │   │   ├── url-pattern-validator.ts # Layer 3 (Tier 1): URL pattern validation
│   │   │   │   ├── patterns.ts          # Detection patterns & keywords
│   │   │   │   ├── context-validator.ts # Multilingual validation (21 langs)
│   │   │   │   ├── types.ts             # Shared type definitions (TextSources, ChannelClassification)
│   │   │   │   ├── cooldown-registry.ts # Field cooldown tracking
│   │   │   │   └── split-input-detector.ts # Split-input group detection (183 LOC)
│   │   │   ├── matching/        # Code matching (v2 algorithm)
│   │   │   │   ├── code-matcher.ts      # Best match selection (458-pt scoring)
│   │   │   │   ├── domain-affinity.ts   # Domain scoring (0-100 pts)
│   │   │   │   ├── recency-scorer.ts    # Time-based scoring (0-250 pts)
│   │   │   │   ├── shape-matcher.ts     # Pattern matching (0-8 pts)
│   │   │   │   └── scoring-config.ts    # Scoring thresholds
│   │   │   ├── providers/       # Email provider adapters
│   │   │   │   ├── provider-interface.ts
│   │   │   │   ├── gmail/           # Gmail API + PKCE OAuth
│   │   │   │   ├── outlook/         # Microsoft Graph + PKCE OAuth
│   │   │   │   └── imap-bridge/     # IMAP Bridge (native messaging)
│   │   │   ├── services/        # Application services
│   │   │   │   ├── email-polling-service.ts
│   │   │   │   ├── provider-adapter.ts
│   │   │   │   └── ...
│   │   │   ├── storage/         # Storage layer
│   │   │   │   ├── schema.ts
│   │   │   │   ├── domain-preferences.ts
│   │   │   │   └── ...
│   │   │   ├── crypto/          # Encryption (AES-256-GCM)
│   │   │   └── utils/           # Shared utilities
│   │   ├── popup/               # Popup UI (React)
│   │   ├── options/             # Settings page (React)
│   │   └── tabs/                # Mailboxes page (React)
│   ├── build/                   # Build output
│   └── package.json
├── packages/
│   └── extraction-core/          # Shared extraction logic (source of truth)
│       ├── src/
│       │   ├── extraction/      # OTP and magic link extraction
│       │   │   ├── extractor.ts     # Main extraction entry point
│       │   │   ├── otp-extractor.ts # OTP detection (v2.3 algorithm)
│       │   │   └── extraction-types.ts # Patterns, keywords, constants
│       │   ├── matching/        # Matching utilities (copied from extension)
│       │   │   ├── shape-matcher.ts    # Expected shape bias
│       │   │   ├── domain-affinity.ts  # Domain matching
│       │   │   ├── recency-scorer.ts   # Time-based scoring
│       │   │   └── scoring-config.ts   # Scoring configuration
│       │   └── index.ts         # Public API exports
│       └── package.json         # @inboxkey/extraction-core
└── apps/
    └── reviewer/                 # InboxKey Reviewer dev tool
        ├── src/                 # Reviewer UI and logic
        ├── build/               # Build output
        └── package.json
```

**Key Architecture Decision:**
- `extraction-core` is a shared package containing pure extraction logic (OTP/magic-link detection and matching utilities)
- **Source of truth:** Main extension's production-tested extraction algorithm was migrated to extraction-core (2025-10-21)
- Both main extension and Reviewer import from `@inboxkey/extraction-core` via npm workspace protocol
- This ensures algorithm improvements benefit both tools with zero code drift
- Extraction core has NO Chrome API dependencies (pure TypeScript) and can be used in any context
- Note: `/extension/src/lib/matching/` remains in place as it contains extension-specific code (code-matcher.ts) still used by session-controller and popup-cache
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
│                                    │ LinkService                    │
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
- "Buy me a coffee" and privacy status ("Local-only • No servers") are always visible per guardrails.
- Popup footer includes per-domain toggle ("Active on this site: ON/OFF") with warning message when extension is disabled on current domain.

### Application Layer
- Services under `extension/src/lib/services` expose typed commands to the UI and content scripts: `PopupBridge`, `ClipboardService`, `LinkService`, and `EmailPollingService`.
- Message routing uses Plasmo messaging channels with schema validation; all cross-context calls pass through application services to enforce business rules and auditing.

### Domain Layer
- **Extraction Core (`@inboxkey/extraction-core`):** Pure TypeScript package with OTP/magic-link detection logic and matching utilities (shape-matcher, domain-affinity, recency-scorer). Shared between main extension and Reviewer. Contains the v2.3 extraction algorithm migrated from production (2025-10-21).
- Detection (`lib/detection`) scores candidate fields on the page. Matching (`lib/matching`) contains extension-specific code like code-matcher.ts used by session-controller and popup-cache.
- Provider adapters (`lib/providers/gmail`, `lib/providers/outlook`, `lib/providers/imap-bridge`) normalize mail APIs into a single polling contract. InboxBridge (IMAP) is implemented and protocol-tested as of 2025-10-20.
- The watch-session controller coordinates timing windows, cache hydration, confidence scoring, and manual fallback data.

### Infrastructure Layer
- Crypto (`lib/crypto`) manages master key lifecycle, AES-256-GCM encryption, and PBKDF2 derivation.
- Storage (`lib/storage`) wraps `chrome.storage.local/session` and `indexedDB` with migrations, retention windows (codes 24h, links 7d), and selective encryption for sensitive fields.
- **Domain Preferences (`lib/storage/domain-preferences`):** Per-domain toggle allowing users to enable/disable InboxKey on specific sites. Uses eTLD+1 extraction for domain matching. Preferences stored in `chrome.storage.local` with a global default setting (`domainsEnabledByDefault`). Content scripts check domain state before executing autofill or watch session logic. UI toggle appears in popup footer with visual warning when disabled.
- Shared utilities (`lib/utils`, `lib/cache`) provide memoized caches, logging, and delimited background tasks.

## Runtime Components

- **Background service worker (`extension/src/background`).** Handles lifecycle orchestration, provider auth, polling scheduler (0s/5s/10s cadence), token vault, tiered cache (in-memory → session → local), and messaging gateway. Maintains an in-memory snapshot for instant popup responses.
- **Content scripts (`extension/src/contents`).** Detect verification prompts, open Port connections for 15-second watch sessions, autofill codes, trigger link opens, render reduced-motion-friendly status chips, and recover gracefully if the worker restarts.
- **Shared libraries (`extension/src/lib`).** Encapsulate detection heuristics, matching, and provider logic. All consumers import via `@/*` aliases to enforce layering.
- **Extraction Core (`packages/extraction-core`).** Pure extraction logic imported by both main extension and Reviewer. No Chrome APIs.
- **UI surfaces.** React components consume application services, show open-source/support state, and provide manual actions ("Copy last code", "Open last magic link") as fallbacks.

## Detection & Triggering System

### Field Detection

**Dual-Tier Detection Engine** (`extension/src/lib/detection/`)

- **Tier 1 (Fast <0.14ms) - 6-Layer Defense-in-Depth:**
  1. Cooldown registry (skip recently checked fields)
  2. Password attribute validation (reject `type=password`, 21-language custom attributes)
  3. URL pattern validation (reject setup/configuration pages via `SETUP_URL_PATTERNS`)
  4. Autocomplete + attribute matching (`one-time-code`, `name/id` patterns: `code|otp|token|pin|mfa`)
  5. Signal classifier (reject authenticator/SMS fields; Option 7 hybrid detection for email+authenticator scenarios)
  6. Context validation (multilingual negative keywords: `SETUP_PAGE_PATTERNS`, password/login detection in 21 languages)
- **Tier 2 (Deep ~0.45ms):** Label analysis (4 sources), placeholder text, nearby text with proximity scoring, form context, split-input group detection

**Trigger Strategy** (`extension/src/contents/index.ts`)

1. Page load detection (`DOMContentLoaded`)
2. Dynamic detection (`MutationObserver` for SPAs, 50ms debounce for rapid injections)

**Split-Input Group Detection:** Identifies when multiple separate inputs form a single logical field (e.g., Steam's 5 maxlength=1 fields). Groups are collapsed to a representative field (first input) to start ONE session per group instead of one per input.

**Domain Control:** Per-domain toggle via eTLD+1 extraction (`lib/utils/domain.ts`)

### Watch Session Flow

```
Field Detected → Port Connection (keep-alive 8s) → START_SESSION →
Background Polling (0s, 5s, 10s) → extraction-core → V2 Matcher →
SESSION_CODE_FOUND → Autofill (validated) → Complete
```

**Key Files:**
- `contents/watch-session.ts` - Session lifecycle & Port communication
- `background/session-controller.ts` - Orchestration & state management
- `background/session-poller.ts` - MV3-resilient alarm-based polling

### V2 Code Matching

**Scoring System** (`lib/matching/code-matcher.ts`) - 458-point maximum:

- **Domain Affinity (0-100):** Exact match 100, alias 75, subdomain 50, token 25
- **Recency (0-250):** Exponential decay `250 * e^(-age/120s)`, favors <5min
- **Session Boost (0-100):** 100pts if email arrived within 10s of session start
- **Shape Match (0-8):** Length/charset tiebreaker

Minimum threshold: 100 points

### Autofill Safety

**Pre-fill Validation** (`contents/autofill.ts`):
- Domain enabled check, field in DOM, not readonly/disabled, visible, non-zero dimensions
- Dispatches `input`, `change`, `keydown`, `keyup` events for framework reactivity
- Optional auto-submit with password-reset link protection

**Split-Input Distribution:** Detects split-input groups (e.g., 5 separate maxlength=1 fields) and distributes codes character-by-character ("12345" → "1" "2" "3" "4" "5"). Focuses last filled input and applies visual feedback to each input. Handles edge cases: code shorter/longer than input count.

### Layer 5 (Tier 1): Delivery Channel Signal Classifier

Integrated within Tier 1 (<0.05ms), distinguishes email-based codes (InboxKey can help) from authenticator/SMS codes:

- **21-language keyword detection:** EMAIL_PATTERNS, SMS_PATTERNS, AUTHENTICATOR_PATTERNS covering Latin, Cyrillic, Arabic, Devanagari, CJK character sets
- **Option 7 - Hybrid Channel Detection:** Scans ALL patterns (no short-circuit) to build `allChannels` array and `channelConfidences` object
  - Authenticator + Email → DETECT as 'email' (confidence 0.85) - allows InboxKey to help when email codes available
  - Authenticator only → REJECT
  - SMS + Email → DETECT as 'email' (confidence 0.85)
  - SMS only → REJECT
  - Email only → DETECT (confidence 0.95)
- **Defense placement:** Runs AFTER attribute matching (Layer 4) but BEFORE context validation (Layer 6) to reject non-email channels early
- **Location:** `signal-classifier.ts:classifyDeliveryChannel()` called from `tier1-fast.ts:362,453,548`

## Data & Control Flow

1. **Detection.** Content script scans DOM using dual-tier detection (Tier 1: 6-layer defense with URL/context/signal validation; Tier 2: deep analysis for edge cases). Signal classifier (Layer 5) rejects authenticator/SMS-only fields; hybrid scenarios (email+authenticator) detect as email with lower confidence (0.85).
2. **Watch session.** Opens long-lived Port, background polls email providers at 0/5/10s, 8s keep-alive prevents worker termination.
3. **Extraction & matching.** Emails parsed by `extraction-core`, scored by V2 matcher (458-pt max), minimum 100pts threshold.
4. **Action.** Best match autofills after validation, or manual popup actions surface cached results with metadata.
5. **Cleanup.** 15s session expiry, retention: codes 24h, links 7d.

## Security & Privacy

- **Local-only data path.** No remote services; OAuth tokens and parsed content never leave the device.
- **Encryption.** Sensitive records use AES-256-GCM with per-user master keys derived via PBKDF2-SHA256 (600k iterations). Non-sensitive metadata stays plaintext for quick lookups.
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
- **E2E tests (Playwright).** Validate watch sessions, popup workflows, magic-link handling, and performance metrics (≤50 ms popup open, 0.3 ms field detection).
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


## Risks & Future Work

- Reliance on Chrome Identity keeps Gmail auth simple but limits cross-browser portability.
- MV3 service-worker lifespan remains fragile; continued monitoring of keep-alive patterns is required.
- Storage quotas (10 MB `chrome.storage.local`) demand aggressive cleanup and telemetry-free operation.
- Detection false positives need ongoing tuning with design-approved UX mitigations (Reviewer tool addresses this).
- Upcoming roadmap items: ✅ InboxBridge IMAP support (implemented 2025-10-20, protocol-tested), unified mailbox viewer, and service-worker sharding once Chromium APIs mature.
