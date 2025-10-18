# Security Policy

**InboxKey** is a privacy-first Chrome extension that processes all email data locally on your device. This document outlines our security policy, vulnerability disclosure process, and security architecture.

## Table of Contents

- [Supported Versions](#supported-versions)
- [Security Update Policy](#security-update-policy)
- [Reporting a Vulnerability](#reporting-a-vulnerability)
- [Security Features](#security-features)
- [Security Best Practices for Users](#security-best-practices-for-users)
- [Known Security Considerations](#known-security-considerations)
- [Security Audit History](#security-audit-history)

---

## Supported Versions

We release security updates for the following versions:

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| 0.0.x   | :white_check_mark: | Alpha - Active development |
| < 0.0.1 | :x:                | Not supported |

**Note**: InboxKey is currently in alpha. Once we reach 1.0.0, we will support the current major version and one previous major version.

---

## Security Update Policy

### Release Schedule

- **Critical security fixes**: Released within 24-48 hours of discovery
- **High-priority fixes**: Released within 7 days
- **Medium/low priority**: Included in next scheduled release

### Notification Process

Security updates are announced through:

1. **GitHub Security Advisories**: [github.com/inboxkey/inboxkey/security/advisories](https://github.com/inboxkey/inboxkey/security/advisories)
2. **Release notes**: Marked with `[SECURITY]` prefix
3. **Chrome Web Store update**: Automatic for all users (typically within 24 hours)

---

## Reporting a Vulnerability

### How to Report

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly:

**Email**: security@inboxkey.dev (PGP key below)

**What to include**:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)
- Your name/contact for credit (optional)

### Response Timeline

| Stage | Timeline | Description |
|-------|----------|-------------|
| **Initial response** | 24 hours | We acknowledge receipt of your report |
| **Triage** | 72 hours | We assess severity and confirm the issue |
| **Fix development** | 7-30 days | Depends on severity and complexity |
| **Public disclosure** | 30-90 days | After fix is released and deployed |

### Responsible Disclosure Guidelines

**We ask that you**:
- Give us reasonable time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it
- Do not access, modify, or delete other users' data
- Make a good faith effort to avoid privacy violations and data destruction

**We promise to**:
- Respond promptly to your report
- Keep you informed about our progress
- Credit you in the security advisory (unless you prefer to remain anonymous)
- Not pursue legal action against good-faith security researchers

### Scope

**In scope**:
- InboxKey Chrome extension (all versions)
- OAuth flows and token handling
- Encryption implementation
- Content script injection and XSS
- Local storage security
- Permissions and privacy violations

**Out of scope**:
- Social engineering attacks
- Denial of service attacks
- Issues in third-party dependencies (report to upstream)
- Issues requiring physical access to the user's device
- Browser vulnerabilities (report to Chromium/Chrome)

### PGP Key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[To be added - PGP key for security@inboxkey.dev]
-----END PGP PUBLIC KEY BLOCK-----
```

---

## Security Features

### Local-Only Processing

**No external servers**: All email processing, code extraction, and storage happens locally on your device. InboxKey never sends your email data to external servers.

**What this means**:
- Your verification codes never leave your device
- No cloud storage or sync
- No analytics or telemetry
- No third-party tracking

### Encryption at Rest

**AES-256-GCM**: Industry-standard authenticated encryption
- **Key length**: 256 bits
- **Mode**: GCM (Galois/Counter Mode) with authentication
- **Tag length**: 128 bits (prevents tampering)
- **IV length**: 96 bits (random per encryption operation)

**PBKDF2 Key Derivation**: Password-based key derivation
- **Algorithm**: PBKDF2-SHA256
- **Iterations**: 100,000 (OWASP 2023 minimum recommendation)
- **Salt length**: 256 bits (random, unique per installation)
- **Key derivation time**: ~300-500ms (intentionally slow to resist brute-force)

**Encrypted fields**:
- Verification codes
- Magic links
- OAuth access tokens
- OAuth refresh tokens

**Plaintext fields** (for indexing/filtering):
- Email sender names
- Timestamps
- Domain matches
- Settings and preferences

### OAuth2 Security

**Gmail (via Chrome Identity API)**:
- Uses `chrome.identity.getAuthToken()` for OAuth
- Automatic PKCE (Proof Key for Code Exchange)
- Token refresh managed by Chrome
- Requires user to be signed in to Chrome
- Read-only scope: `https://www.googleapis.com/auth/gmail.readonly`

**Outlook (Manual PKCE)**:
- OAuth 2.0 with PKCE flow
- Read-only scope: `https://graph.microsoft.com/Mail.Read`
- Offline access for token refresh
- Tokens encrypted at rest when locked

**Token storage**:
- Access tokens: Encrypted when password protection is enabled
- Refresh tokens: Encrypted when password protection is enabled
- Tokens cleared from memory when locked
- No tokens in plaintext logs (production mode)

### Chrome Manifest V3 Compliance

**Modern security architecture**:
- Service worker background script (no persistent background page)
- No remote code execution (no `eval()` or inline scripts)
- Minimal permissions requested
- Content Security Policy enforced

**Permissions**:
```json
{
  "permissions": [
    "storage",    // Local encrypted storage
    "alarms",     // Auto-lock timer
    "tabs",       // Detect active tab for autofill
    "identity"    // Gmail OAuth via chrome.identity
  ],
  "host_permissions": [
    "https://*/*" // Content scripts for autofill
  ]
}
```

**We do NOT request**:
- `history` - We don't track your browsing
- `bookmarks` - We don't access your bookmarks
- `cookies` - We don't read your cookies
- `webRequest` - We don't intercept network traffic
- `debugger` - We don't debug other extensions

### Message Passing Security

**chrome.runtime.sendMessage**: All communication between extension components uses Chrome's secure message passing API
- No `window.postMessage` (prevents page-to-extension communication)
- Content scripts isolated from page context
- Background service worker validates all messages

**Current limitation**: Message sender origin validation not yet implemented (see [SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md))

### Web Crypto API

**Browser-native cryptography**:
- No custom crypto implementations
- All encryption uses `crypto.subtle` (Web Crypto API)
- Random number generation via `crypto.getRandomValues()`
- Keys marked as non-extractable (cannot be exported from memory)

---

## Security Best Practices for Users

### 1. Enable Password Protection

**Recommended**: Enable password protection in Settings > Security

When enabled:
- All codes and tokens are encrypted at rest
- Extension locks after inactivity (default: 15 minutes)
- Requires password to unlock and view codes

**Password requirements**:
- Currently: 6 digits (0-9)
- Recommendation: Use a strong, unique PIN
- Do NOT reuse this PIN elsewhere

**Future improvement**: We plan to require 8+ alphanumeric characters (see [SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md))

### 2. Use Strong PINs

**Weak PINs to avoid**:
- `000000`, `111111`, `123456`
- Birthdays, phone numbers, addresses
- Common patterns: `112233`, `121212`

**Strong PIN characteristics**:
- No repeating digits
- No sequential digits
- No personal information
- Unique to InboxKey

### 3. Keep Extension Updated

**Enable automatic updates** (default in Chrome):
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Verify "Update extensions automatically" is checked

**Check for updates manually**:
1. Open `chrome://extensions`
2. Click "Update" button (top left)

### 4. Review Connected Accounts

**Regularly audit** which email accounts are connected:
1. Open InboxKey settings
2. Go to "Accounts" tab
3. Review connected Gmail/Outlook accounts
4. Remove accounts you no longer use

**Revoke access** if you no longer need InboxKey:
- Gmail: [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
- Outlook: [account.microsoft.com/privacy](https://account.microsoft.com/privacy)

### 5. Lock When Idle

**Configure auto-lock timeout**:
1. Settings > Security > Auto-lock
2. Recommended: 5-15 minutes
3. Shorter timeout = more secure, less convenient

**Manual lock**:
- Click the lock icon in the popup
- Keyboard shortcut: (to be implemented)

### 6. Verify Extension Source

**Only install from official sources**:
- Chrome Web Store: [chrome.google.com/webstore/detail/inboxkey/...](https://chrome.google.com/webstore/detail/inboxkey/)
- GitHub releases: [github.com/inboxkey/inboxkey/releases](https://github.com/inboxkey/inboxkey/releases)

**Verify extension ID**: `[TO BE ADDED AFTER CHROME WEB STORE PUBLICATION]`

**Check for signs of tampering**:
- Extension icon should match official branding
- Name should be exactly "InboxKey"
- Publisher should be "InboxKey Team"

---

## Known Security Considerations

We believe in transparency. Here are known security limitations and our plans to address them:

### 1. 6-Digit PIN Vulnerability

**Issue**: Current PIN requirement is only 6 numeric digits (1 million possible combinations)

**Risk**: Offline brute-force attack is theoretically possible if attacker:
1. Gains access to user's computer
2. Extracts encrypted data and salt from `chrome.storage.local`
3. Performs offline dictionary attack

**Mitigations in place**:
- PBKDF2 with 100,000 iterations (~300ms per attempt)
- Brute-force entire keyspace: ~11 days on modern CPU
- Requires physical/remote access to victim's device

**Planned fix**: Increase minimum password length to 8+ alphanumeric characters (see [SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md))

**Timeline**: Q1 2025

### 2. No Password Recovery Mechanism

**Issue**: If you forget your password, your data is permanently lost

**Risk**: User frustration and data loss

**Design decision**: This is intentional for security
- We do not have access to your data
- We cannot recover your password
- No "forgot password" backdoor

**Mitigation**: Clear warnings during password setup

**User action**: Write down your password in a secure location (password manager, physical safe)

### 3. Auto-Lock Timer Limitations

**Issue**: Service worker may restart, clearing in-memory auto-lock timer

**Risk**: Extension may not auto-lock after configured timeout if service worker restarts

**Current behavior**:
- Timer set using `setTimeout()` in service worker
- Timer cleared on service worker termination
- Extension remains unlocked until manual lock or next unlock

**Planned fix**: Use `chrome.alarms` API for persistent timers (see [SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md))

**Timeline**: Q1 2025

### 4. Verification Data Storage

**Issue**: Encrypted verification data stored in `chrome.storage.local` could be used for offline password attacks

**Risk**: Attacker with device access can extract verification data and attempt offline brute-force

**Current mitigation**: PBKDF2 iterations make brute-force slow

**Planned improvement**: Explore client-side challenge-response or hardware token integration (Q2 2025)

### 5. Console Logging in Development

**Issue**: Development builds may log sensitive data to console

**Risk**: Information disclosure in developer tools

**Mitigation**:
- Production builds strip all `console.*` calls
- Sensitive data never logged in production
- Regular audits of logging statements

**Action required**: Remove all sensitive logging from production (see [SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md))

### 6. Memory Wipe Limitations

**Issue**: JavaScript cannot guarantee memory is wiped after key is cleared

**Context**: When extension locks, we set `masterKey = null`, but JavaScript garbage collection is non-deterministic

**Risk**: Master key may remain in memory until garbage collection runs

**Mitigation**:
- Use non-extractable CryptoKey objects (cannot be exported)
- Rely on Chrome's memory isolation
- Service worker restart clears all memory

**Limitation**: JavaScript does not provide secure memory wiping primitives

---

## Security Audit History

### Internal Security Audit

**Date**: October 2024

**Scope**: Comprehensive security review of alpha version (0.0.x)

**Findings**:
- **Critical**: OAuth client ID exposed in git history ([OAUTH_CREDENTIAL_ROTATION.md](docs/OAUTH_CREDENTIAL_ROTATION.md))
- **High**: PIN strength insufficient (6 digits)
- **High**: Missing sender origin validation in message handlers
- **Medium**: Auto-lock timer not persistent across service worker restarts
- **Low**: No explicit CSP in manifest.json (Chrome provides default)

**Status**: Remediation in progress (see [SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md))

### External Security Audit

**Status**: Pending

**Plans**: We plan to commission a third-party security audit before 1.0 release

**Scope**: Full source code audit, penetration testing, cryptography review

**Timeline**: Q2 2025 (target)

**Auditor**: To be determined

---

## Additional Security Documentation

For more detailed security information, see:

- **[OAUTH_CREDENTIAL_ROTATION.md](docs/OAUTH_CREDENTIAL_ROTATION.md)** - Critical OAuth credential rotation guide
- **[SECURITY_IMPROVEMENTS.md](docs/SECURITY_IMPROVEMENTS.md)** - Planned security improvements and roadmap
- **[SECURITY_ARCHITECTURE.md](docs/SECURITY_ARCHITECTURE.md)** - Detailed security architecture documentation
- **[TESTING_SECURITY.md](docs/TESTING_SECURITY.md)** - Security testing guide and checklist

---

## Contact

**Security issues**: security@inboxkey.dev (PGP key above)

**General questions**: hello@inboxkey.dev

**GitHub**: [github.com/inboxkey/inboxkey](https://github.com/inboxkey/inboxkey)

**Discord**: [discord.gg/inboxkey](https://discord.gg/inboxkey)

---

**Last updated**: October 18, 2024

**Version**: 0.0.1-alpha
