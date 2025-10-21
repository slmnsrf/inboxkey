# InboxKey

**Privacy-first email verification code autofill and magic-link opener for Chrome.**

InboxKey automatically detects verification codes and magic login links in your email, then autofills them on websites—all processed locally on your device with no external servers.

## Features

- ✅ **Automatic code detection** - Finds 4-8 digit codes in Gmail and Outlook
- ✅ **Magic link detection** - Identifies and opens login links safely
- ✅ **Auto-fill** - Fills codes on websites within 15 seconds of arrival
- ✅ **Manual copy** - Popup shows last 5 codes for manual use
- ✅ **Privacy-first** - All processing local-only, no servers, no tracking
- ✅ **Multi-provider** - Supports Gmail and Outlook (IMAP coming soon)

## Installation

### From Chrome Web Store (Recommended)

1. Visit [Chrome Web Store - InboxKey](https://chrome.google.com/webstore/detail/inboxkey/...)
2. Click "Add to Chrome"
3. Follow the setup wizard to connect your email account

### From Source (Development)

```bash
# Clone repository
git clone https://github.com/inboxkey/inboxkey.git
cd inboxkey

# Install dependencies (monorepo)
npm install

# Build main extension
cd extension
npm run build

# Load in Chrome
1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select extension/build/chrome-mv3-prod/ directory
```

**Note**: This is a monorepo with multiple packages. See [Development](#development) section for full structure.

## Quick Start

### 1. First Launch

When you first open InboxKey, you'll see a setup wizard:

1. **Connect email** - Click "Connect Gmail" or "Connect Outlook"
2. **Grant permissions** - Allow read-only access to email

### 2. Using Auto-fill

1. Navigate to any website with a verification code field
2. InboxKey watches your email for 15 seconds
3. When a code arrives, it's automatically filled
4. A green highlight confirms the code was filled

### 3. Manual Copy

1. Click the InboxKey icon in your browser toolbar
2. View the last 5 codes and 3 magic links
3. Click "Copy" to copy a code to clipboard
4. Click "Open" to open a magic link

## Privacy & Security

### Local-Only Processing

- **No servers**: All code detection and storage happens on your device
- **No tracking**: We don't collect analytics, telemetry, or usage data
- **No ads**: No advertising, tracking pixels, or third-party scripts

### What Data We Access

- **Email subject lines** - To detect verification codes
- **Email body text** - To extract codes and links
- **Read-only access** - We can't send emails or modify your inbox

### Encryption

- **AES-256-GCM** - All codes encrypted before storage
- **Browser storage** - Data stays in chrome.storage.local (encrypted)

## Permissions Explained

InboxKey requires the following permissions:

| Permission | Why We Need It |
|------------|----------------|
| `identity` | To authenticate with Gmail via Chrome's OAuth system (chrome.identity.getAuthToken()) |
| `storage` | To store encrypted codes locally in your browser |
| `activeTab` | To detect verification fields on the current page |
| `scripting` | To auto-fill codes on websites |

**We never request `history`, `bookmarks`, or `browsingData` permissions.**

## Supported Email Providers

### Gmail ✅
- Chrome Identity API authentication (chrome.identity.getAuthToken())
- OAuth 2.0 with automatic PKCE and token refresh
- Read-only access via Gmail API
- Supports all Gmail accounts (personal, Workspace)
- **Requirement**: Users must be signed in to Chrome with their Google account
- **Browser**: Currently Chrome-only (other Chromium browsers may not work)

### Outlook ✅
- OAuth 2.0 authentication
- Read-only access via Microsoft Graph API
- Supports Outlook.com, Hotmail, Office 365

### IMAP 🔮 (Coming Soon)
- Support for Yahoo, ProtonMail, custom email servers
- Requires separate native helper app (InboxBridge)
- See [IMAP Setup Guide](docs/imap-setup.md)

## Troubleshooting

### Gmail connection issues

**Error: "Please sign in to Chrome with your Google account"**
- You must be signed in to Chrome with a Google account to use Gmail integration
- Go to Chrome Settings → Sign in to Chrome
- Sign in with the same Google account you want to use for InboxKey

**Error: "OAuth cancelled by user"**
- You clicked "Cancel" on the Google OAuth consent screen
- Try clicking "Connect Gmail" again and click "Allow" on the consent screen

**Gmail not connecting on Chromium browsers (Brave, Edge, etc.)**
- Gmail OAuth currently requires Google Chrome browser
- Other Chromium-based browsers may not work with chrome.identity.getAuthToken()
- Use Google Chrome for Gmail integration

**Token expired or authentication failed**
- Chrome automatically refreshes tokens, but sometimes re-authentication is needed
- Try disconnecting and reconnecting your Gmail account
- Make sure you're still signed in to Chrome

### Codes aren't being detected

1. Check that your email account is connected (click extension icon)
2. Verify the code is 4-8 digits or alphanumeric
3. Wait 15 seconds after the email arrives
4. Try manually copying from the popup

### Auto-fill isn't working

1. Ensure the field is visible on the page
2. Check that the field type is `text`, `tel`, or `number`
3. Try clicking the field before the code arrives
4. Verify the site isn't blocking the extension

### Need more help?

- [FAQ](docs/faq.md)
- [GitHub Issues](https://github.com/inboxkey/inboxkey/issues)
- [Discord Community](https://discord.gg/inboxkey)

## Development

### Project Structure (Monorepo)

This project uses npm workspaces to share code between the main extension and developer tools:

```
/home/dev/work/inboxkey/
├── extension/                    # Main InboxKey extension (production)
│   ├── src/
│   │   ├── background/           # Service worker
│   │   ├── contents/             # Content scripts
│   │   ├── lib/                  # Core libraries (crypto, storage, matching)
│   │   ├── providers/            # Email providers (Gmail, Outlook)
│   │   ├── ui/                   # React components (popup, options)
│   │   └── styles/               # Design tokens and CSS
│   ├── tests/                    # Unit, integration, E2E tests
│   ├── build/chrome-mv3-prod/    # Build output
│   └── .deprecated/              # Deprecated code (safe to delete after verification)
│
├── packages/
│   └── extraction-core/          # Shared extraction logic
│       ├── src/
│       │   ├── extraction/       # OTP and magic link extraction
│       │   │   ├── extractor.ts      # Main extraction entry point
│       │   │   ├── otp-extractor.ts  # OTP detection (v2.3 algorithm)
│       │   │   └── extraction-types.ts # Patterns, keywords, constants
│       │   ├── matching/         # Matching utilities
│       │   │   ├── shape-matcher.ts    # Expected shape bias
│       │   │   ├── domain-affinity.ts  # Domain matching
│       │   │   └── recency-scorer.ts   # Time-based scoring
│       │   └── index.ts          # Public API exports
│       └── package.json          # @inboxkey/extraction-core
│
└── apps/
    └── reviewer/                 # InboxKey Reviewer (dev tool)
        ├── src/                  # Review UI and batch processing
        ├── build/                # Build output
        └── README.md             # Reviewer usage guide
```

**Key Architecture:**
- `@inboxkey/extraction-core` is a shared package with pure extraction logic (OTP/magic-link detection and matching utilities)
- **Source of truth:** Main extension's production-tested v2.3 extraction algorithm (migrated 2025-10-21)
- Both main extension and Reviewer import from `@inboxkey/extraction-core` via npm workspace protocol to ensure zero code drift
- Extraction core has NO Chrome API dependencies (pure TypeScript) and can be used in any context
- Old extraction files moved to `/extension/.deprecated/` for reference (safe to delete after verification)
- See [architecture.md](architecture.md) for full system architecture

**Developer Tool:**
- **InboxKey Reviewer** (`apps/reviewer/`) - Internal dev tool for manual email labeling
- Used to generate labeled datasets for improving extraction algorithms
- Separate extension with unique ID (doesn't conflict with main extension)
- See `apps/reviewer/README.md` for usage

### Tech Stack

- **Framework**: Plasmo (Chrome extension framework)
- **UI**: React 18 + TypeScript
- **Crypto**: Web Crypto API (native)
- **Storage**: chrome.storage.local (encrypted)
- **Testing**: Vitest, Playwright, MSW
- **Build**: Parcel bundler

### Running Tests

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage report
pnpm test:coverage
```

### Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

### Phase 9: Accessibility & i18n ✅ (Complete)
- [x] Keyboard navigation
- [x] ARIA labels and screen reader support
- [x] WCAG AA contrast ratios
- [x] i18n infrastructure (15 languages planned)

### Phase 10: MVP Polish 🚧 (In Progress)
- [x] Performance budgets (<200ms popup load)
- [x] About & Trust section
- [ ] Per-site overrides (auto-fill/prompt/off)
- [ ] Error banners for token expiration
- [ ] Final accessibility audit

### Phase 11: Mailboxes UI 🔮 (Post-MVP)
- [ ] Unified mailbox viewer (read-only)
- [ ] Safe preview pane (no external images)
- [ ] Provider filtering

### Phase 12: IMAP Support 🔮 (Post-MVP)
- [ ] InboxBridge native helper app
- [ ] Yahoo, ProtonMail, custom servers
- [ ] OS keychain integration

## License

Apache-2.0 License - see [LICENSE](LICENSE) for details.

## Support

If InboxKey saves you time, consider buying me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow.svg)](https://buymeacoffee.com/inboxkey)

**Support is optional and never required.** InboxKey is free and open-source forever.

## Acknowledgments

- Built with [Plasmo](https://www.plasmo.com/)
- Icons from [Lucide](https://lucide.dev/)
- Inspired by [1Password](https://1password.com/) and [Bitwarden](https://bitwarden.com/)

---

**Made with ❤️ by the InboxKey team**

[GitHub](https://github.com/inboxkey/inboxkey) • [Discord](https://discord.gg/inboxkey) • [Twitter](https://twitter.com/inboxkey)
