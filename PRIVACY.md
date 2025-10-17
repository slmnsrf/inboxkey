# Privacy Policy

**Last Updated: October 2025**

## Overview

InboxKey is a privacy-first browser extension. We process everything locally on your device and never send your data to external servers.

## Our Commitment

1. **Local-only processing** - All code detection and storage happens on your device
2. **No tracking** - We don't collect analytics, telemetry, or usage data
3. **No servers** - We don't operate any backend servers or databases
4. **No ads** - No advertising, tracking pixels, or third-party scripts
5. **Open-source** - All code is publicly auditable on GitHub

## Data We Access

### Email Data

InboxKey requires read-only access to your email to detect verification codes and magic links. Specifically:

- **Subject lines** - To identify emails containing codes
- **Email body text** - To extract codes and links
- **Sender information** - To associate codes with websites/services
- **Received timestamp** - To sort codes by recency

**We can't:**
- Send emails from your account
- Delete or modify your emails
- Access attachments or images
- Read emails older than 30 days (by default)

### Browser Data

InboxKey stores the following data locally in your browser:

- **Verification codes** (encrypted with AES-256-GCM)
- **Magic links** (encrypted)
- **Email account tokens** (OAuth tokens, encrypted)
- **Extension settings** (lock password hash, auto-lock timeout, etc.)
- **Per-site preferences** (auto-fill on/off for specific domains)

**Storage location:** `chrome.storage.local` (browser-managed, encrypted at rest)

**Retention:** Codes and links are automatically deleted after 7 days.

## Data We Do NOT Collect

- ❌ Your email content (not stored permanently)
- ❌ Your browsing history
- ❌ Your location
- ❌ Your personal information (name, address, phone, etc.)
- ❌ Analytics or telemetry data
- ❌ Crash reports
- ❌ Usage statistics
- ❌ Advertising identifiers

## How We Use Your Data

1. **Code Detection**: We scan recent emails (last 30 days) for verification codes matching common patterns (4-8 digits, alphanumeric codes).

2. **Code Matching**: When a verification field is detected on a website, we match it with recent codes based on:
   - Domain similarity (e.g., code from `github.com` → field on `github.com`)
   - Recency (newer codes ranked higher)
   - Usage history (previously used codes for this site)

3. **Auto-fill**: If a match is found, the code is inserted into the field and the browser's native form autofill event is triggered.

4. **Storage**: Codes are encrypted with AES-256-GCM before being stored in `chrome.storage.local`. The encryption key is derived from your password (if set) or a random device key.

## Data Sharing

**We don't share your data with anyone.** Period.

- No third-party services
- No analytics providers
- No advertising networks
- No data brokers
- No government requests (we have no data to share)

## OAuth & Third-Party Access

### Gmail API

InboxKey uses Chrome's built-in OAuth system (chrome.identity.getAuthToken()) for simplified and secure authentication.

- **Scope**: `https://www.googleapis.com/auth/gmail.readonly`
- **What it allows**: Read-only access to email messages
- **Authentication method**: Chrome Identity API (managed by Chrome)
- **Token storage**: Tokens encrypted and stored locally by extension; Chrome also caches tokens
- **Token refresh**: Handled automatically by Chrome (no manual refresh needed)
- **Requirements**: Users must be signed in to Chrome with their Google account
- **Browser compatibility**: Gmail OAuth currently requires Chrome browser

**How it works:**
1. You click "Connect Gmail" in InboxKey
2. Chrome shows Google's OAuth consent screen
3. Chrome securely manages the token exchange (using PKCE)
4. Chrome caches and automatically refreshes your token
5. InboxKey receives only the access token needed to read emails

**What Chrome manages automatically:**
- PKCE (Proof Key for Code Exchange) security
- Token caching and refresh
- Secure token storage
- No client secrets needed

### Microsoft Graph API (Outlook)

- **Scope**: `https://graph.microsoft.com/Mail.Read`
- **What it allows**: Read-only access to email messages
- **Token storage**: OAuth tokens encrypted and stored locally
- **Token expiration**: Tokens refresh automatically; no permanent access

**We never request access to:**
- Your contacts
- Your calendar
- Your files
- Your browsing history
- Any data beyond email messages

## Security Measures

### Encryption

- **Algorithm**: AES-256-GCM (AEAD cipher)
- **Key Derivation**: PBKDF2-SHA256 with 600,000+ iterations
- **Nonce**: Random 96-bit IV for each encryption
- **Authentication**: MAC tag for tampering detection

### Password Protection (Optional)

- **Hashing**: Your password is never stored; only a PBKDF2 hash
- **Lock Mode**: Extension locks after configurable inactivity
- **Rate Limiting**: Failed unlock attempts trigger exponential backoff
- **No Recovery**: If you forget your password, all data is permanently lost (by design)

### OAuth Security

- **Chrome Identity API**: Gmail uses Chrome's secure OAuth system (chrome.identity.getAuthToken())
- **PKCE**: Chrome automatically implements PKCE (Proof Key for Code Exchange)
- **No Client Secrets**: No client secrets stored in extension - Chrome manages authentication
- **Token Storage**: Tokens encrypted before storage in extension
- **Token Refresh**: Handled automatically by Chrome (Gmail) or extension (Outlook)
- **Token Revocation**: Disconnecting an account revokes all tokens

## Your Rights

### Access

You can access all your data at any time:
- Click the extension icon to view codes and links
- Go to Settings to view connected accounts and preferences

### Deletion

You can delete your data at any time:
- **Individual codes**: Hover over a code and click "×" to delete
- **All data**: Settings → Security → Danger Zone → "Reset InboxKey"
- **Uninstall**: Uninstalling the extension deletes all local data

### Export

You can export your data:
- Codes are visible in the popup (manual copy)
- No automated export feature (future enhancement)

### Portability

Your data is stored in standard Chrome storage format and can be backed up using Chrome's sync feature (if enabled).

## Children's Privacy

InboxKey is not intended for children under 13. We don't knowingly collect data from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.

**Major changes will be announced via:**
- Extension update notes
- GitHub repository (changelog)
- Chrome Web Store listing

## Contact Us

If you have questions about this Privacy Policy:

- **Email**: privacy@inboxkey.dev
- **GitHub Issues**: https://github.com/inboxkey/inboxkey/issues
- **Discord**: https://discord.gg/inboxkey

## Legal Basis (GDPR)

For users in the European Economic Area:

- **Legitimate Interest**: We process data to provide the extension's core functionality (code detection and auto-fill)
- **Consent**: You consent to data processing by installing and using the extension
- **Data Minimization**: We only access data necessary for functionality
- **Purpose Limitation**: Data is only used for code detection and auto-fill

**Your GDPR Rights:**
- Right to access
- Right to erasure (deletion)
- Right to object to processing
- Right to data portability

To exercise these rights, contact us at privacy@inboxkey.dev.

## Compliance

InboxKey complies with:

- ✅ GDPR (General Data Protection Regulation)
- ✅ CCPA (California Consumer Privacy Act)
- ✅ Chrome Web Store Developer Program Policies
- ✅ Google API Services User Data Policy

## Transparency

Our code is open-source and publicly auditable:

- **Repository**: https://github.com/inboxkey/inboxkey
- **License**: Apache-2.0
- **Security Audits**: Welcome and encouraged

## Data Breach Notification

In the unlikely event of a data breach:

1. We'll notify affected users within 72 hours
2. Details will be posted on our GitHub repository
3. We'll provide guidance on mitigation steps

**However**, since we don't store data on servers, a breach would require:
- Compromise of your local device, OR
- Compromise of your browser's storage

In both cases, you should change your email passwords and revoke OAuth tokens immediately.

---

**TL;DR**: We don't collect, store, or share your data. Everything happens locally on your device. No servers. No tracking. No ads.

**Questions?** Email privacy@inboxkey.dev or open a GitHub issue.
