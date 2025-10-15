# Privacy Policy

**Last Updated: April 11, 2026**

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
- Read every message in your inbox by default; InboxKey focuses on recent verification email scans

### Browser Data

InboxKey stores the following data locally in your browser:

- **Connected mailbox state** for accounts you add
- **Verification codes and magic links** needed for recent autofill and open actions
- **Extension settings** and per-site preferences
- **Temporary session state** used for popup and watch-session behavior

**Storage location:** `chrome.storage.local` and `chrome.storage.session`. For IMAP accounts, InboxBridge stores credentials in your operating system keychain.

**Retention:** Verification codes and magic links are treated as short-lived data. Current popup freshness windows are about 15 minutes.

## Data We Do NOT Collect

- Your email content for server-side collection or analytics
- Your browsing history
- Your location
- Your personal information (name, address, phone, etc.)
- Analytics or telemetry data
- Crash reports
- Usage statistics
- Advertising identifiers

## How We Use Your Data

1. **Code Detection**: We scan recent verification emails needed to detect active codes and magic links.

2. **Code Matching**: When a verification field is detected on a website, we match it with recent codes based on:
   - Domain similarity (for example, a code from `github.com` is ranked higher on `github.com`)
   - Recency (newer codes ranked higher)
   - Usage history (previously used codes for this site)

3. **Auto-fill**: If a match is found, the code is inserted into the field and the browser's native form autofill event is triggered.

4. **Storage**: InboxKey stores local state using Chrome storage APIs. Verification codes and magic links are short-lived session data. Additional encryption at rest is planned and not yet shipped.

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
- **Token handling**: Chrome manages the Gmail OAuth flow and token refresh behavior; InboxKey stores connected account state locally
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

### IMAP via InboxBridge

- **Used for**: Yahoo, Fastmail, Outlook IMAP, ProtonMail Bridge, and custom IMAP servers
- **How it runs**: InboxBridge is a local companion app that runs on your computer only
- **Credential storage**: IMAP credentials are stored in your operating system keychain by InboxBridge
- **Extension communication**: Chrome Native Messaging over a local channel
- **Network model**: InboxBridge connects directly to your mail server. There is no InboxKey-operated relay or backend.

**We never request access to:**
- Your contacts
- Your calendar
- Your files
- Your browsing history
- Any data beyond email messages

## Security Measures

### Local Storage

- **Storage APIs**: InboxKey stores local state in `chrome.storage.local` and `chrome.storage.session`
- **Short-lived verification data**: Codes and magic links are treated as temporary session data
- **Planned improvement**: Additional encryption at rest is planned and not yet shipped

### OAuth Security

- **Chrome Identity API**: Gmail uses Chrome's secure OAuth system (chrome.identity.getAuthToken())
- **PKCE**: Chrome automatically implements PKCE (Proof Key for Code Exchange)
- **No Client Secrets**: No client secrets stored in the extension; Chrome manages authentication
- **Token Refresh**: Handled automatically by Chrome for Gmail

### IMAP Credential Storage

- **OS keychain**: InboxBridge stores IMAP credentials in the operating system keychain
- **Local bridge only**: The extension talks to InboxBridge over a local Native Messaging channel
- **No backend relay**: IMAP traffic goes directly between your device and your mail server

## Your Rights

### Access

You can access all your data at any time:
- Click the extension icon to view codes and links
- Go to Settings to view connected accounts and preferences

### Deletion

You can delete your data at any time:
- **Individual codes**: Hover over a code and click "x" to delete
- **All data**: Open Settings > Security > Danger Zone and choose "Reset InboxKey"
- **Uninstall**: Uninstalling the extension deletes all local data

### Export

You can export your data:
- Codes are visible in the popup (manual copy)
- No automated export feature (future enhancement)

### Portability

Your InboxKey data stays local to the current browser profile. InboxKey uses `chrome.storage.local` and `chrome.storage.session`; it does not operate any sync service. IMAP credentials managed by InboxBridge stay in your operating system keychain.

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
- **GitHub Issues**: https://github.com/slmnsrf/inboxkey/issues
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

- GDPR (General Data Protection Regulation)
- CCPA (California Consumer Privacy Act)
- Chrome Web Store Developer Program Policies
- Google API Services User Data Policy

## Transparency

Our code is open-source and publicly auditable:

- **Repository**: https://github.com/slmnsrf/inboxkey
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

**TL;DR**: We do not operate servers or share your data. InboxKey processes verification emails locally on your device. No tracking. No ads.

**Questions?** Email privacy@inboxkey.dev or open a GitHub issue.
