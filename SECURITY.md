# Security Policy

**Last Updated:** April 11, 2026

InboxKey is a privacy-first Chrome extension. This document covers how to report vulnerabilities, what the current alpha release does today, and which security limitations are still open.

## Supported Versions

| Version | Supported | Notes |
| --- | --- | --- |
| 0.0.x | Yes | Current alpha line |
| Older versions | No | Upgrade to the latest 0.0.x build |

## Reporting A Vulnerability

Do not report security issues in public GitHub issues.

Report through:

- Email: security@inboxkey.dev
- GitHub Security Advisories: https://github.com/slmnsrf/inboxkey/security/advisories

Please include:

- a short description of the issue
- steps to reproduce
- expected impact
- logs or screenshots if they do not expose personal data
- contact info for follow-up if you want credit

Response goals:

- acknowledge receipt within 72 hours
- triage severity within 7 days
- ship or plan remediation based on severity and release risk

PGP:

- No public PGP key is published yet. Use the email address above or GitHub Security Advisories.

## Security Model

### Local-only Processing

InboxKey does not operate a backend server. Email parsing, verification-code extraction, matching, and autofill decisions happen on the user's device.

Network traffic goes directly between the user's device and the selected mail provider or local helper app. InboxKey does not proxy email through an InboxKey-owned service.

### Provider Access

Current provider paths:

- Gmail uses `chrome.identity.getAuthToken()` with the `https://www.googleapis.com/auth/gmail.readonly` scope.
- IMAP accounts use InboxBridge, a local Native Messaging companion app. IMAP credentials are stored in the operating system keychain by InboxBridge, not in the extension.
- Google Messages integration, when enabled, runs locally in the browser and reads message previews from the open Google Messages for Web tab.

### Storage Model

Current extension storage:

- `chrome.storage.local` stores connected mailbox state, settings, domain preferences, and related extension metadata.
- `chrome.storage.session` stores short-lived popup cache entries, recent verification codes and links, and session state.
- InboxBridge stores IMAP credentials in the operating system keychain.

Current limitation:

- Additional application-level encryption at rest for extension storage is planned but is not shipped in the current alpha release.

### Permissions

The current extension manifest requests:

- `storage`
- `alarms`
- `tabs`
- `identity`
- `notifications`
- `nativeMessaging`
- `scripting`
- `https://*/*` host permissions

These permissions are used for:

- local storage and session state
- MV3 alarms and background scheduling
- field detection and autofill on supported pages
- Gmail authentication
- optional InboxBridge communication
- optional Google Messages browser integration
- user-facing notifications

InboxKey does not request:

- `history`
- `bookmarks`
- `cookies`
- `webRequest`
- `debugger`

### Transparency

InboxKey is open source under Apache-2.0.

Current transparency mechanisms:

- the repository is public: https://github.com/slmnsrf/inboxkey
- production builds embed a short Git commit hash
- the About UI links that hash back to the source tree for that build

Important caveat:

- Builds are not currently byte-for-byte reproducible. The embedded Git hash helps users trace a build back to source, but it is not the same as deterministic reproducible builds.

## Security Best Practices For Users

- Keep Chrome and your operating system updated.
- Install InboxKey only from this repository or official project release artifacts.
- Review connected accounts regularly and remove ones you no longer use.
- Use OS-level protections on shared devices, such as full-disk encryption, screen lock, and separate user accounts.
- If you use InboxBridge, download it from the official release page and keep it updated.
- Verify the build source and commit hash if you are side-loading from source.

## Known Security Considerations

### 1. Alpha Status

InboxKey is still in alpha. Security hardening is ongoing, and documentation may change as the architecture settles.

### 2. No Additional Extension-level Encryption At Rest Yet

Extension state in `chrome.storage.local` is currently stored without additional application-level encryption. This is already called out in the architecture and privacy docs, and it remains planned future work.

### 3. Device Compromise Remains High Impact

If the local device, browser profile, or operating system account is compromised, locally stored data can be exposed. InboxKey reduces remote exposure by avoiding a backend, but it cannot protect against a fully compromised device.

### 4. No Lock Mode In The Current Release

The current alpha release does not ship a password or lock screen feature. On shared machines, rely on OS account protections rather than assuming the extension has a separate local lock.

### 5. Development Builds May Log More Detail

Development builds and local debugging may log more operational detail than production builds. Do not use development builds for sensitive everyday browsing without understanding that tradeoff.

### 6. Gmail Account Limit Is Browser-level

Gmail is currently limited to one account per Chrome profile because of the Chrome Identity API. That is a platform limitation, not an InboxKey backend decision.

## Security Updates

Security fixes are communicated through:

- GitHub Security Advisories
- release notes in the repository
- future store release notes if and when a Web Store listing goes live

## Contact

- Security issues: security@inboxkey.dev
- GitHub Security Advisories: https://github.com/slmnsrf/inboxkey/security/advisories
- Repository: https://github.com/slmnsrf/inboxkey
