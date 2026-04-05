# InboxKey

**Privacy-first email verification code autofill and magic-link opener for Chrome.**

Verification codes and magic links are detected in your email and filled automatically on websites. Everything is processed locally on your device. No servers, no tracking, no data leaves your browser.

<!-- TODO: Add screenshot or GIF of autofill in action -->

---

## Why this exists

Every login, every signup, every password reset: check your email, find the code, copy it, paste it. Over and over.

InboxKey does that for you. It reads your email, finds the code, fills it in. Locally, on your device.

This is a hobby project by one developer. No company, no investors, no agenda. Built it for myself, decided to publish it for everyone.

---

## Install

<!-- **[Install from Chrome Web Store](https://chrome.google.com/webstore/detail/inboxkey/...)** -->

Chrome Web Store listing is coming soon. For now, see [Building from source](#building-from-source) below.

---

## Setup

1. Connect your Gmail account (one click, read-only access)
2. Visit a website that asks for a verification code
3. InboxKey detects the field, watches your email, fills the code in

That's it.

### What about other email providers?

For most people, one Gmail account is enough. If you also use Yahoo, Outlook, ProtonMail, or others, you don't need to connect each one separately. Just set up a forwarding rule in those providers to forward verification emails to your Gmail. Filter by keywords like "code", "verify", "confirmation", "one-time". All your codes land in one inbox, InboxKey handles the rest.

If you prefer to connect other accounts directly without forwarding, there's an advanced option called [InboxBridge](#inboxbridge).

---

## Privacy and trust

Email access is sensitive. There's no way around that. Here's how InboxKey handles it:

- **Local-only processing.** No servers. No cloud. No API calls to anywhere except your own email provider.
- **Read-only access.** The extension can read emails but cannot send, delete, or modify anything.
- **No tracking.** No analytics, no telemetry, no usage data collection. Zero.
- **No ads.** No advertising, no tracking pixels, no third-party scripts.
- **Encryption at rest.** Stored codes are encrypted with AES-256-GCM in your browser's local storage.
- **Open-source.** Every line of code is right here. Review it, audit it, build it yourself.

Details in [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

---

## Support

This is a free, open-source project maintained by one person in their spare time. If InboxKey saves you a few seconds every day and you want to support it, a coffee goes a long way:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow.svg)](https://buymeacoffee.com/inboxkey)

No pressure. Completely optional. The extension is free forever regardless.

---

## License

Apache-2.0. See [LICENSE](LICENSE).

Open-source under a permissive license because transparency is the only way to earn trust when an extension reads your email.

---

<details>
<summary><strong>InboxBridge</strong></summary>

### What is it

InboxBridge is a small companion app that connects to IMAP email servers (Yahoo, ProtonMail, Fastmail, Outlook, custom servers) locally on your machine. It is entirely optional. Most users don't need it.

Chrome extensions cannot make IMAP connections due to browser security restrictions. InboxBridge acts as a local bridge between the extension and your mail server.

### Details

- Open-source, written in Rust
- Credentials stored in your OS keychain (never on disk)
- Communicates with the extension via Chrome's Native Messaging API (local stdin/stdout, no network)
- Runs only when the extension needs it, then exits

Download from [GitHub Releases](https://github.com/slmnsrf/inboxkey/releases).

</details>

<details>
<summary><strong>Building from source</strong></summary>

```bash
git clone https://github.com/slmnsrf/inboxkey.git
cd inboxkey

# Install dependencies
pnpm install

# Build the extension
cd extension
npm run build
```

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/build/chrome-mv3-prod/` directory

</details>

<details>
<summary><strong>Development</strong></summary>

### Project structure

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

### Commands

All commands run from the `extension/` directory:

```bash
cd extension

npm run dev          # Start development server
npm run build        # Production build (includes locale copy)
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run typecheck    # TypeScript type checking
```

See [development.md](development.md) for the full guide.

</details>

---

[Source Code](https://github.com/slmnsrf/inboxkey) | [Privacy Policy](PRIVACY.md) | [Security](SECURITY.md) | [Issues](https://github.com/slmnsrf/inboxkey/issues)
