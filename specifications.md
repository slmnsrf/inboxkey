# specifications.md
> InboxKey - Email Code Autofill & Magic-Link Opener — Chrome/Chromium Extension  
> Status: Draft (MVP scope locked) • Owner: Core Team • License: MIT or Apache-2.0

## 0) One‑liner
A privacy-first, open‑source browser extension that **auto‑fills email-delivered verification codes** and **opens one‑time magic login links**—with a simple, UX‑first flow and zero servers.

---

## 1) Purpose & Goals

### Purpose
- Seamlessly handle **email-based** sign‑in confirmations: numeric/alphanumeric codes and single‑use magic links.
- Be **safe by default**: no server; process emails locally; clear opt‑ins and controls.
- Deliver a **fast**, **accessible**, and **predictable** UX.

### Primary Goals (MVP)
- Chrome MV3 extension; runs well on other Chromium browsers (Edge, Brave, Opera).  
- Providers: **Gmail (OAuth2)**, **Outlook/Microsoft (OAuth2)**; optional **Local Bridge (IMAP helper)**.  
- **Detection** of code fields or magic‑link prompts on page.  
- **Auto-fetch** and **auto-fill/open** within a strict **15‑second** window (poll every **5 seconds**).  
- Simple popup with:
  - **Copy Last Code**
  - **Open Last Magic Link**
  - **Mailboxes** (read‑only pool)
  - **Lock** (password‑protected)
  - **Settings**
- **“Buy me a coffee”** button in popup and settings.

### Non-Goals (MVP)
- SMS inboxes, authenticator apps, TOTP, push notifications.  
- App‑server features (no backend; all local).  
- Replying/sending emails.  
- Safari/Firefox shipping in MVP (may experiment later).

---

## 2) User Stories

- *As a user*, when a site asks for a verification code, I want the extension to **fill it automatically** if the matching email arrives within ~15 seconds.
- *As a user*, when a site supports passwordless sign‑in via **magic link**, I want the extension to **open the correct link** quickly, without me searching my inbox.
- *As a security‑conscious user*, I want a **Lock** mode requiring a password to access any email reading functions, with **no recovery**, and a **Reset** that wipes everything.
- *As a power user*, I want a **manual “Copy Last Code”** and **“Open Last Magic Link”** in the popup.
- *As a privacy‑minded user*, I want **local‑only processing**, clear permissions, and **no data exfiltration**.

---

## 3) Functional Specification

### 3.1 Page Detection Rules
**Trigger only if:**
- The page visibly requests a **verification code** and there is an actionable input field; or
- The page clearly indicates a **magic link** workflow (e.g., “We emailed you a login link” / “Click the link we sent”).

**Do NOT trigger if:**
- The page requests a TOTP/2FA app code (authenticator app) or hardware key.
- There is no input field; or the text suggests a non-email factor.

**Signals & Heuristics (scored):**
- Presence of inputs with labels/placeholder nearby keywords: `verification code`, `code`, `OTP`, `one-time`, `security code`, `PIN` (+ i18n variants).
- Page text includes “we emailed you”, “check your email”, “magic link”.
- Input shape: single field with maxLength 4–8; split fields (N boxes with maxLength=1).
- Exclusions: fields near “Authenticator app”, “TOTP”, “Google Authenticator”, “Authy”, “Yubikey”, “FIDO”.

### 3.2 Auto-Fetch & Fill/Open Flow
When detection fires:
1. **Start watch session** (15s total): poll connected mailboxes at **t=0s, 5s, 10s**.
2. For each poll, fetch **recent emails (last 10 minutes)**, shortlist by **brand/domain** and **keywords**, then:
   - **Extract OTP codes** (regex + keyword proximity).
   - **Extract Magic Links** (HTML link parsing + intent keywords).
3. **If a match is found**:
   - For **code**: autofill and blur/submit if the page does so on input.  
   - For **magic link**: **open** (default same tab; configurable to new tab).  
4. **If no match** by t=15s: show a small chip “No email found—open popup for manual options”.

**Manual fallback (popup):**
- **Copy Last Code** → copies best candidate from the recent polling cache and shows a toast with **Sender • Received • Code**.
- **Open Last Magic Link** → opens best candidate link and shows **Sender • Received** toast.

### 3.3 Popup: Actions & Pages
- **Home (default)**
  - Big buttons: **Copy Last Code**, **Open Last Magic Link**
  - Status line: “Watching on this tab: On/Off • Provider: Gmail/Outlook/IMAP”
  - “Buy me a coffee” button
  - Footer left: **Lock** (shows state); Footer right: **Settings**
- **Mailboxes** (opens in new tab)
  - Read‑only unified view of recent messages (subject, sender, time), filter by provider/folder
  - **No reply/delete/mark-as-read**
- **Settings** (new tab)
  - Providers: Connect/Disconnect, scope info
  - Behavior: Auto‑fill, Auto‑open links, domain allow/deny lists
  - Privacy: local processing, data retention (off), telemetry (off by default)
  - Advanced: Magic link open target (same tab/new tab), incognito support toggle
  - About: version, open-source links, **Buy me a coffee**

### 3.4 Lock Mode
- **Lock** disables all auto-reading and manual actions until unlocked.
- Unlock requires **user password**.
- **No recovery**. “Reset extension”:
  - Deletes all tokens, local caches, settings.
  - Prompts user to re-connect providers.
- Brute force protection:
  - PBKDF2(SHA‑256) with **large iteration count** and per‑user salt (stored).
  - Attempt counter with **exponential backoff** (e.g., 1, 2, 4, 8, 16 min).
  - Optional additional 2‑word phrase prompt to slow guessing.

---

## 4) Technical Specification

### 4.1 Architecture (MV3)

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser Extension (MV3)                      │
│                                                                  │
│  Content Script(s)                                               │
│   • Detect OTP/magic-link prompts on pages                       │
│   • Keep-alive Port to Service Worker during 15s watch           │
│   • Fill code fields / trigger link-open on command              │
│   • Minimal in-page chip for status & manual actions             │
│                                                                  │
│  Background Service Worker                                       │
│   • Provider auth (OAuth2) via chrome.identity                   │
│   • Token vault (encrypted in storage)                           │
│   • Polling scheduler (0s/5s/10s) during watch sessions          │
│   • Provider adapters: Gmail, Outlook, Local IMAP Bridge         │
│   • Parser: OTP extractor + Magic-link extractor                 │
│   • Matcher: map candidates to current site                      │
│                                                                  │
│  UI Pages                                                        │
│   • Popup (Home)                                                 │
│   • Options/Settings                                             │
│   • Mailboxes (unified, read-only)                               │
└──────────────────────────────────────────────────────────────────┘
```

**Keep‑alive design:** content script opens a **long‑lived Port** to the worker for the entire 15s session to mitigate MV3 worker eviction. All polls happen while the port is open. If the worker restarts, the content script re‑opens and resumes (idempotent fetches).

### 4.2 Provider Adapters

#### Gmail (OAuth2)
- **Auth**: `chrome.identity.launchWebAuthFlow` (PKCE). Redirect: `https://<EXT_ID>.chromiumapp.org/...`.
- **Scopes**: start with `gmail.readonly` (+ `openid email profile` if needed).
- **Fetching**:
  - `users.messages.list` with query:
    - `newer_than:10m (code OR verification OR "one-time" OR OTP OR "magic link" OR login) [brand/domain]`
  - Follow with `users.messages.get?format=metadata|full` for short‑listed IDs.
- **Parsing**:
  - Base64url decode parts; prefer `text/plain`, fall back to stripping `text/html`.

#### Outlook / Microsoft (Graph)
- **Auth**: OAuth2 (PKCE) via `launchWebAuthFlow`.
- **Scopes**: `Mail.Read` + `offline_access`.
- **Fetching**:
  - `/me/messages?$filter=receivedDateTime ge <now-PT10M>&$top=15`
  - Use `$search` or body contains keywords (subject/body).
- **Parsing**:
  - `body.contentType` and `body.content` (HTML → text); parse similar to Gmail.

#### Local Bridge (IMAP Helper) — Optional
- **Purpose**: enable any IMAP account **without** cloud servers.
- **Implementation**: Native Messaging app (Go/Rust).  
- **Responsibilities**:
  - Auth (IMAP creds or OAuth2 app passwords) stored in OS keychain.
  - Efficient fetch of recent messages (SEARCH SINCE) and fast body previews.
  - Optional **IMAP IDLE** for real‑time (beyond MVP requirement).
- **Protocol** (JSON over stdin/stdout):
  - `connect`, `listRecent({sinceMinutes})`, `getMessage({id})`, `disconnect`.
- **Security**:
  - Whitelisted extension ID; deny other clients.
  - No data leaves the device.

### 4.3 Matching & Extraction

#### Matching the right email to the current site
Score components (0–1):
- **Sender vs. site domain** (e.g., `no-reply@brand.com` vs. current tab `brand.com`).
- **Keyword proximity** around match (“verification code”, “is your code”, “magic link”).
- **Temporal proximity** (received < 10 min).
- **Expected format** (digits only if input is numeric; length N from page).
- **Brand hints** (page title/URL vs. email brand name).

Decision:
- If **score ≥ 0.75** → auto‑fill/open.
- If **0.5 ≤ score < 0.75** → show in‑page prompt list (user pick).
- Else ignore for auto actions; keep for popup.

#### OTP Extraction (examples; localized variants included)
- Numeric: `(?<!\d)(\d{4,8})(?!\d)`
- Grouped: `\b(\d{3,4}[-\s]\d{3,4})\b` → normalize to digits
- Alphanumeric: `\b([A-Z0-9]{4,10})\b` (reject all‑letters)
- **Windowing**: only accept candidates appearing within ±60 chars of keywords:
  - `code|verification|one[-\s]?time|otp|security|login`
- **Reject**: phone numbers, order numbers (≥9 digits), long IDs, unsubscribe tokens.

#### Magic Link Extraction
- From HTML: collect `<a href="...">` candidates.
- Rank higher if:
  - Link domain **matches** site domain or known brand domains.
  - Anchor text/alt text contains **login**, **sign in**, **magic link**, **verify**, **continue**.
  - URL contains tokens like `login_token`, `token`, `signin`, `session`, `verify`.
- **Never auto‑open** links that include **unsubscribe**/**preferences**/**support**.  
- **Never auto‑open** **password reset** links; require manual confirmation (security).

### 4.4 Autofill Engine (Content Script)
- **Single input**: set `.value`, dispatch `input`, `keyup`, `change`, optionally `Enter` if site listens.
- **Split inputs**: detect sequence; type each char with 10–40ms jitter; dispatch events per field.
- **Shadow DOM**: pierce roots via `shadowRoot` traversal.
- **Cross‑origin iframes**: not accessible (skip).
- **Safety**: never write into `type="password"` or fields near “authenticator/TOTP”.

### 4.5 Magic Link Opening
- Default **same tab** via `chrome.tabs.update({ url })` using the tabId of the detected page.
- Optional setting: open in **new tab** or **incognito** (if allowed).
- If link domain **mismatch** (not parent/child of current site): prompt user:
  - “Open login link to **otherbrand.com**? [Open] [Cancel]”
- Record last opened link in local cache for popup replay.

### 4.6 Polling & Session Control
- **Session length**: 15 seconds.  
- **Poll cadence**: 0s, 5s, 10s.  
- Each poll:
  - Query **recent** messages (<10 min).
  - Shortlist ≤ 15 candidates per provider.
  - Extract & match; stop early if confident match found.
- **Keep‑alive**: content script Port keeps worker live; on worker reload, resume.

### 4.7 Permissions (Manifest)
```json
{
  "permissions": ["storage", "identity", "scripting", "activeTab", "notifications"],
  "host_permissions": [
    "https://www.googleapis.com/*",
    "https://graph.microsoft.com/*",
    "<all_urls>"
  ],
  "optional_permissions": ["identity.email"], 
  "action": { "default_popup": "ui/popup.html" },
  "background": { "service_worker": "background/main.js", "type": "module" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/otpDetector.js"],
    "run_at": "document_idle"
  }]
}
```

### 4.8 Storage & Crypto
- **Token vault**: `chrome.storage.local` with **WebCrypto** encryption (AES‑GCM).
- Key handling:
  - Unlocked mode: random key sealed with extension‑scoped secret in memory.
  - **Lock mode**: key encrypted with **PBKDF2(SHA‑256)** derived from user password (≥600k iters) + salt.
- **No plaintext** tokens at rest.  
- **No email content** persisted beyond a small, in‑memory recent cache (and optional redacted log).

### 4.9 Data Structures (TypeScript)

```ts
type ProviderId = 'gmail' | 'outlook' | 'imap-bridge';

interface WatchSession {
  id: string;
  startedAt: number;      // epoch ms
  tabId: number;
  url: string;            // current page
  expected: { length?: number; charset?: 'digits'|'alnum' };
  polls: number;          // 0..3
  status: 'active'|'filled'|'timedout'|'canceled';
}

interface CandidateBase {
  provider: ProviderId;
  messageId: string;
  sender: string;
  received: number;       // epoch ms
  subject: string;
  score: number;          // 0..1
}

interface OTPCandidate extends CandidateBase {
  kind: 'otp';
  code: string;           // normalized
}

interface LinkCandidate extends CandidateBase {
  kind: 'magic-link';
  href: string;
  display: string;        // anchor text or source label
  domain: string;
}
```

---

## 5) UX Specification

### 5.1 In‑page Chip
- Appears bottom-right (non‑blocking) when detection begins:
  - “Watching email… (15s)”
  - Spinner; “Paste now” button (manual)
  - If match found: “Code filled” or “Opening link…”
  - If no match: “No email found—open popup”
- Keyboard:
  - `Ctrl/⌘+Shift+O` → paste best code (if any)
  - `Esc` → dismiss

### 5.2 Popup: Home
- Large buttons:
  - **Copy Last Code** (tooltip shows sender/time)
  - **Open Last Magic Link**
- Status: “Connected: Gmail ✓, Outlook ✗, IMAP ✓ • Auto actions: On”
- **Buy me a coffee** (opens donation URL)
- Footer: **Lock** (shows locked/unlocked) • **Settings**

### 5.3 Mailboxes
- Table: Date • From • Subject • Provider
- Filters: Provider, Folder (Inbox/All Mail/Custom)
- “Open message” reveals sanitized preview:
  - highlight detected **codes/links**
  - no external image loads
  - links disabled except magic‑link test (explicit button)

### 5.4 Settings (Key Options)
- **Auto‑fill codes**: On/Prompt/Off (global; per‑site overrides)
- **Auto‑open magic links**: On/Prompt/Off
- **Open magic links**: Same tab/New tab/Incognito
- **Allow/deny list**: domain patterns
- **Lock**: set/change password; wipe attempt counters
- **Telemetry (optional)**: Off by default; anonymous counts only
- **About**: version, open source link, **Buy me a coffee**

---

## 6) Security, Privacy, Compliance

- **Local‑only**: No servers. All email parsing runs on device.
- **Least privilege**:
  - Gmail: `gmail.readonly`
  - Outlook: `Mail.Read` + `offline_access`
- **Token security**: AES‑GCM at rest; never logged; minimized scope.
- **Lock Mode**: PBKDF2‑protected vault; exponential backoff on wrong attempts; no recovery; **Reset** wipes everything.
- **Anti‑phishing**:
  - Never auto‑open password reset links.
  - Prompt when link domain differs from current site/brand.
  - Disallow opening links to “unsubscribe”, “preferences” or support endpoints.
- **Data retention**:
  - In‑memory recent cache only (max ~25 items). Optional persistent cache is **off** in MVP.
- **Transparency**:
  - Clear privacy policy; scopes explained in‑app.
  - Open-source code for verification.
- **Regulatory/OAuth review**:
  - Public distribution with Gmail/Graph read scopes typically requires app verification. Our design avoids servers and minimizes data handling to reduce review surface.

---

## 7) Accessibility & Internationalization

- **A11y**: All controls keyboard accessible; ARIA roles; toast messages are polite live regions.
- **Localization**: OTP keywords for ≥15 languages; UI strings in resource bundles; RTL layouts supported.

---

## 8) Performance & Reliability

- No background polling. Sessions only when a page is detected.
- Poll bursts at 0/5/10s; cap results per provider.
- Handle MV3 worker eviction by keeping a Port open; session resumes on restart.
- Memory budget: <25MB typical; avoid large HTML bodies unless shortlisted.

---

## 9) Testing Strategy

### Unit
- OTP regexes and keyword windowing (fixtures across locales).
- Magic link ranking logic.
- Domain/brand matcher scoring.
- Crypto wrappers (mocked WebCrypto).

### Integration
- Provider adapters with mocked HTTP responses and MIME fixtures.
- Session controller (poll cadence, early exit).
- Fill engine against synthetic DOMs (single/split/shadow inputs).

### E2E
- Playwright:
  - Simulated sites with OTP/magic link flows (React/Vue/vanilla).
  - Scenarios: confident code, ambiguous codes, no code, magic link domain mismatch, lock mode.
- Manual verification on ~30 popular sites (internal checklist).

**Acceptance (MVP):**
- On 20 representative sites:
  - ≥90% success for auto‑fill when email arrives within 15s.
  - 0 false writes into password fields.
  - 0 automatic openings of password reset links.
- Lock mode blocks all actions until unlock; reset wipes all state.

---

## 10) Risks & Mitigations

- **MV3 worker eviction** → Keep‑alive Port; idempotent session; small polling window.
- **Ambiguous emails** → confidence thresholds + user prompt list.
- **Phishing via magic links** → strict domain checks; never auto‑open resets; user prompts.
- **OAuth app verification delays** → distribute dev builds; document local‑only processing to ease review.
- **Quota usage** → poll only during short sessions; limit candidates per poll; use keyword queries.

---

## 11) Open Source, Funding, and Community

- **License**: MIT or Apache‑2.0 (recommend Apache‑2.0 for patent grant).
- **Repo**:
  - `README`, `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`, `PRIVACY`.
  - CI: lint (ESLint), format (Prettier), test (Vitest/Playwright), build (Vite/Plasmo).
  - Signed releases; reproducible builds.
- **Funding**: “Buy me a coffee” (e.g., Ko‑fi/BuyMeACoffee) link in popup + settings.

---

## 12) Implementation Plan (MVP)

**Phase A — Scaffolding**
- Build system (Vite or Plasmo), TS config, Manifest V3.
- Popup/Options/Mailboxes skeleton UIs.
- Crypto module; storage adapter; lock mode scaffold.

**Phase B — Detection & Fill**
- Content script: detector (inputs, page text, shadow DOM).
- Fill engine (single/split inputs) + in‑page chip.
- Session controller wiring (Port keep‑alive; 0/5/10s polls).

**Phase C — Gmail Adapter**
- OAuth (PKCE) via `launchWebAuthFlow`.
- Query recent messages; parser; OTP and link extractors.
- Matcher + scoring; end‑to‑end autofill/open.

**Phase D — Outlook Adapter**
- OAuth + parity with Gmail.
- Unified provider abstraction.

**Phase E — Mailboxes & Popup Actions**
- Unified read‑only list; filters; preview with sanitized rendering.
- “Copy Last Code”, “Open Last Magic Link” + notifications.

**Phase F — Hardening**
- Domain allow/deny; password reset link guard; a11y; i18n seeds.
- Extensive test pass + docs; prepare store listing.

---

## 13) File/Folder Layout

```
/extension
  /src
    /background
      main.ts
      sessionController.ts
      matcher.ts
      otpExtractor.ts
      linkExtractor.ts
      /providers
        gmail.ts
        outlook.ts
        imapBridge.ts
      /auth
        gmailAuth.ts
        outlookAuth.ts
    /content
      otpDetector.ts
      fillEngine.ts
      chipUI.ts
    /ui
      popup.tsx
      options.tsx
      mailboxes.tsx
      components/*
    /shared
      crypto.ts
      storage.ts
      types.ts
      i18n.ts
  manifest.json
  vite.config.ts
  /test
    unit/*
    integration/*
    e2e/*
  README.md
  LICENSE
```

---

## 14) Pseudocode & Snippets

### 14.1 Watch Session (15s window)
```ts
async function startWatchSession(tabId: number, url: string, expected) {
  const session = createSession(tabId, url, expected);
  const polls = [0, 5000, 10000];

  for (const delay of polls) {
    await sleep(delay);
    const candidates = await pollProviders(session);
    const best = rankAndSelect(candidates, url, expected);

    if (best && best.score >= 0.75) {
      if (best.kind === 'otp') postToContent(tabId, { type: 'FILL_CODE', candidate: best });
      else if (best.kind === 'magic-link') openLink(tabId, best.href);
      session.status = 'filled';
      return;
    } else if (best) {
      // Offer choice chip in-page if score is moderate
      postToContent(tabId, { type: 'SHOW_LIST', candidates: candidates.slice(0, 5) });
    }
  }
  session.status = 'timedout';
  postToContent(tabId, { type: 'NO_MATCH' });
}
```

### 14.2 OTP Extraction (text)
```ts
function extractOTPs(text: string): string[] {
  const nearKeywords = /(code|verification|one[-\s]?time|otp|security|login)/i;
  const windows = findWindowsAroundKeywords(text, nearKeywords, 120); // +/-60 chars

  const codes = new Set<string>();
  for (const w of windows) {
    // numeric
    for (const m of w.matchAll(/(?<!\d)(\d{4,8})(?!\d)/g)) codes.add(m[1]);
    // grouped
    for (const m of w.matchAll(/\b(\d{3,4}[-\s]\d{3,4})\b/g)) codes.add(m[1].replace(/[-\s]/g, ''));
    // alnum
    for (const m of w.matchAll(/\b([A-Z0-9]{4,10})\b/g)) if (!/^[A-Z]{4,10}$/.test(m[1])) codes.add(m[1]);
  }
  return [...codes].filter(notPhoneNumberOrOrderId);
}
```

### 14.3 Magic Link Ranking
```ts
function rankLinks(links: string[], pageDomain: string, brandHints: string[]): LinkCandidate[] {
  const deny = /(unsubscribe|preferences|support|help|password[-_]?reset)/i;
  return links
    .filter(href => !deny.test(href))
    .map(href => {
      const domain = new URL(href).hostname;
      const domainMatch = sameOrSubdomain(domain, pageDomain) ? 0.5 : 0;
      const brandMatch = brandHints.some(b => domain.includes(b)) ? 0.3 : 0;
      const tokenHint = /login|signin|session|token|verify|magic/i.test(href) ? 0.2 : 0;
      return { href, domain, score: domainMatch + brandMatch + tokenHint };
    })
    .sort((a, b) => b.score - a.score);
}
```

---

## 15) Open Questions (to revisit post‑MVP)
- Should we add a **per‑site** default: Auto vs Prompt for magic links?
- Incognito behavior by default for magic links?
- Add **native IMAP IDLE** in the bridge for real‑time?
- Provide export/import of settings (encrypted)?

---

## 16) Appendix: Compliance Notes
- Public distribution with Gmail/Outlook read scopes typically requires OAuth app verification. Our **local‑only** design and clear privacy policy are intended to ease review. Avoid collecting PII/telemetry by default.
- If we **ever** transmit restricted data to servers, an external security assessment may be required. MVP will not.
