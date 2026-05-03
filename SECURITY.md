# Security Policy

**Last Updated:** April 12, 2026

InboxKey is a local-only browser extension. This document covers how to report vulnerabilities, what the extension and companion app do today, and which security limitations are still open.

## Supported Versions

| Component | Version | Supported |
| --- | --- | --- |
| InboxKey (extension) | 0.0.x | Yes |
| InboxBridge (companion app) | 1.1.x | Yes |

Only the latest release of each component receives security fixes. Upgrade to the latest version before reporting issues.

## Reporting a Vulnerability

Do not report security issues in public GitHub issues.

Report through:

- **Email:** inboxbridge.extension@gmail.com
- **GitHub Security Advisories:** https://github.com/slmnsrf/inboxkey/security/advisories

Please include:

- a short description of the issue
- steps to reproduce
- expected impact
- logs or screenshots if they do not expose personal data
- contact info for follow-up if you want credit

Response times vary based on severity. No public PGP key is available; use the email address above or GitHub Security Advisories for encrypted disclosure.

## Security Model

### Local-only processing

InboxKey does not operate a backend server. Email parsing, verification-code extraction, matching, and autofill decisions happen entirely on the device.

Network traffic goes directly between the device and the selected mail provider. InboxKey does not proxy, relay, or store email through any InboxKey-operated service.

### Provider access

- **IMAP (via InboxBridge):** a local Native Messaging companion app connects directly to the mail server for all providers, including Gmail. Credentials are stored in the operating system keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service), not in the browser.
- **Google Messages (SMS):** reads conversation list previews from the Google Messages for Web tab (`messages.google.com`) via `chrome.scripting.executeScript()`. No Google Messages API is used.

### Storage

| Data | Location | Retention |
| --- | --- | --- |
| Connected mailbox state, settings, domain preferences | `chrome.storage.local` | Until disconnected or uninstalled |
| Popup cache, recent codes and links, session state | `chrome.storage.session` | Cleared on browser close |
| IMAP credentials | OS keychain (via InboxBridge) | Until disconnected or InboxBridge uninstalled |

Application-level encryption at rest for extension storage is planned but not yet shipped. This is documented in the architecture and privacy policy.

### Permissions

The extension manifest requests:

| Permission | Purpose |
| --- | --- |
| `storage` | Local settings and cached state |
| `alarms` | MV3 service-worker keepalive and session polling timers |
| `tabs` | Opening Google Messages tab for SMS, opening settings pages |
| `notifications` | Extension state notifications (e.g., after an update) |
| `nativeMessaging` | Communication with InboxBridge for IMAP support |
| `scripting` | Reading Google Messages conversation previews for SMS codes |

Host permissions: `https://*/*` and `http://*/*` (content script injection for verification field detection).

Not requested: `history`, `bookmarks`, `cookies`, `webRequest`, `debugger`.

### Transparency

InboxKey is source-available under PolyForm Noncommercial 1.0.0. The repository is public at https://github.com/slmnsrf/inboxkey. Production builds embed a short Git commit hash, and the About UI links that hash back to the source tree for that build.

Builds are not byte-for-byte reproducible. The embedded Git hash helps trace a build back to source but is not the same as deterministic reproducible builds.

## Security Best Practices for Users

- Keep Chrome and the operating system updated.
- Install InboxKey only from this repository or official release artifacts.
- Review connected accounts regularly and remove unused ones.
- Use OS-level protections on shared devices (full-disk encryption, screen lock, separate user accounts).
- If using InboxBridge, download it from the [official release page](https://github.com/slmnsrf/inboxkey/releases) and keep it updated.
- Verify the build source and commit hash when side-loading from source.

## Known Security Considerations

### No encryption at rest

Extension state in `chrome.storage.local` is stored without additional application-level encryption. This is documented in the architecture and privacy policy and remains planned future work.

### Device compromise is high impact

If the local device, browser profile, or operating system account is compromised, locally stored data can be exposed. InboxKey reduces remote exposure by not operating a backend, but it cannot protect against a fully compromised device.

### No lock mode

The extension does not ship a password or lock screen feature. On shared machines, rely on OS account protections rather than assuming the extension has a separate local lock.

### Development builds may log more detail

Development builds and local debugging may log more operational detail than production builds. Do not use development builds for sensitive everyday browsing.

## Security Updates

Security fixes are communicated through:

- GitHub Security Advisories
- Release notes in the repository
- Chrome Web Store listing, if and when published

## Contact

- **Security issues:** inboxbridge.extension@gmail.com
- **GitHub Security Advisories:** https://github.com/slmnsrf/inboxkey/security/advisories
- **Repository:** https://github.com/slmnsrf/inboxkey
