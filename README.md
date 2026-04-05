# InboxKey

**Privacy-first email verification code autofill and magic-link opener for Chrome.**

Verification codes and magic links are detected in your email and filled automatically on websites. Everything is processed locally on your device. No servers, no tracking, no data leaves your browser.

---

## Why this exists

Every login, every signup, every password reset: check your email, find the code, copy it, paste it. Over and over.

InboxKey does that for you. It reads your email, finds the code, fills it in. Locally, on your device.

This is a hobby project by one developer. No company, no investors, no agenda. Built it for myself, decided to publish it for everyone.

---

## How it works

1. You visit a website that asks for a verification code
2. InboxKey detects the input field and starts watching your email
3. When the code arrives, it gets filled automatically
4. A brief confirmation appears, then it gets out of your way

For magic login links, the popup shows a safe preview. You decide whether to open it.

All of this happens on your device. The extension reads your recent emails (read-only), extracts codes and links locally, and never sends anything anywhere.

---

## Privacy and trust

Email access is sensitive. There's no way around that. Here's how InboxKey handles it:

- **Local-only processing.** No servers. No cloud. No API calls to anywhere except your own email provider.
- **Read-only access.** The extension can read emails but cannot send, delete, or modify anything.
- **No tracking.** No analytics, no telemetry, no usage data collection. Zero.
- **No ads.** No advertising, no tracking pixels, no third-party scripts.
- **Encryption at rest.** Stored codes are encrypted with AES-256-GCM in your browser's local storage.
- **Open-source.** Every line of code is right here. Review it, audit it, build it yourself.

The privacy policy is in [PRIVACY.md](PRIVACY.md) and the security model is documented in [SECURITY.md](SECURITY.md). These aren't boilerplate -- they describe exactly what happens and what doesn't.

---

## Email providers

| Provider | How it connects | Status |
|----------|----------------|--------|
| **Gmail** | Chrome's built-in OAuth (chrome.identity) | Supported |
| **IMAP** (Yahoo, ProtonMail, Fastmail, Outlook, custom servers) | Via [InboxBridge](#inboxbridge) companion app | Supported |
| **Google Messages** (SMS codes) | Local tab connection | Supported |

### Gmail notes

Gmail uses Chrome's built-in identity system. You need to be signed in to Chrome with your Google account. Other Chromium-based browsers (Brave, Edge) may not work with Gmail -- that's a Chrome API limitation, not an InboxKey one.

### InboxBridge

IMAP email providers (Yahoo, ProtonMail, Fastmail, or your own mail server) need a small companion app called InboxBridge. Chrome extensions can't make direct IMAP connections due to browser security restrictions, so InboxBridge acts as a local bridge.

- Written in Rust
- Credentials stored in your OS keychain (never on disk)
- Communicates with the extension via Chrome's Native Messaging API (stdin/stdout, no network)
- Runs only when the extension needs it, then exits

Download InboxBridge from [GitHub Releases](https://github.com/slmnsrf/inboxkey/releases).

---

## Installation

### Chrome Web Store

Coming soon.

### From source

```bash
git clone https://github.com/slmnsrf/inboxkey.git
cd inboxkey

# Install dependencies
pnpm install

# Build the extension
cd extension
npm run build

# Load in Chrome:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the extension/build/chrome-mv3-prod/ directory
```

---

## Permissions

| Permission | Why |
|------------|-----|
| `identity` | Authenticate with Gmail via Chrome's OAuth |
| `storage` | Store encrypted codes locally |
| `tabs` | Detect when you're on a page with a verification field |
| `scripting` | Fill codes into input fields |
| `nativeMessaging` | Communicate with InboxBridge for IMAP accounts |
| `notifications` | Notify when a code is found but auto-fill isn't possible |

No access to history, bookmarks, downloads, or browsing data.

---

## Project structure

This is a monorepo:

```
inboxkey/
  extension/            # The Chrome extension (React + TypeScript)
  packages/
    extraction-core/    # Shared OTP/magic-link detection logic
  apps/
    reviewer/           # Dev tool for labeling test data
  inboxbridge/          # Rust native messaging host for IMAP
```

### Tech stack

- **Extension framework:** Plasmo (Manifest V3)
- **UI:** React 18, TypeScript
- **Crypto:** Web Crypto API (native browser implementation)
- **Storage:** chrome.storage.local (encrypted)
- **Testing:** Vitest, Playwright
- **IMAP bridge:** Rust, async-imap, tokio

---

## Development

All extension commands run from the `extension/` directory:

```bash
cd extension

npm run dev          # Start development server
npm run build        # Production build (includes locale copy)
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run typecheck    # TypeScript type checking
```

See [development.md](development.md) for the full guide.

---

## License

Apache-2.0. See [LICENSE](LICENSE).

Open-source under a permissive license because transparency is the only way to earn trust when an extension reads your email.

---

## Support

This is a free, open-source project maintained by one person in their spare time. If InboxKey saves you a few seconds every day and you want to support it, a coffee goes a long way:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow.svg)](https://buymeacoffee.com/inboxkey)

No pressure. Completely optional. The extension is free forever regardless.

---

[Source Code](https://github.com/slmnsrf/inboxkey) | [Privacy Policy](PRIVACY.md) | [Security](SECURITY.md) | [Issues](https://github.com/slmnsrf/inboxkey/issues)
