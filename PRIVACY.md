# Privacy Policy

**Last Updated: April 12, 2026**

InboxKey is a local-only browser extension. No servers are operated, no data is collected, and no information leaves the device. This document describes what data is accessed, where it is stored, and how it can be removed.

## What InboxKey accesses

InboxKey accesses email and SMS data solely to detect verification codes and magic links. All processing happens on the device. Nothing is transmitted externally.

### Gmail (read-only)

When a Gmail account is connected, InboxKey uses Chrome's built-in OAuth system (`chrome.identity.getAuthToken()`) to request read-only access under the `gmail.readonly` scope. Only recent messages (approximately the last 10 minutes) are queried. InboxKey cannot send, delete, or modify emails, and does not access contacts, calendar, or files.

Authentication is handled entirely by Chrome via the Identity API with PKCE. No client secrets are stored in the extension. Token caching and refresh are managed by Chrome automatically.

### IMAP (via InboxBridge)

For providers like Yahoo Mail, ProtonMail Bridge, Yandex Mail, and custom IMAP servers, InboxKey communicates with InboxBridge, a separate companion app that runs locally on the device. InboxBridge connects directly to the mail server. There is no relay, proxy, or backend operated by InboxKey.

IMAP credentials are stored in the operating system keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service), not in the browser.

### Google Messages (SMS)

When a Google Messages account is connected, InboxKey opens the Google Messages for Web interface (`messages.google.com`) in a browser tab and reads conversation list previews to detect SMS verification codes. No Google Messages API is used. The tab is opened on demand and closed automatically when no longer needed.

### Web page fields

InboxKey scans input fields on web pages to detect verification code prompts. Field attributes (name, id, autocomplete, placeholder, nearby text) are analyzed locally. No page content is sent anywhere.

## What InboxKey stores

All storage is local to the browser profile and the device. InboxKey does not operate a sync service.

| Data | Storage location | Retention |
|------|-----------------|-----------|
| Connected account state | `chrome.storage.local` | Until the account is disconnected |
| Verification codes | `chrome.storage.session` | Cleared on browser close |
| Magic links | `chrome.storage.local` | Short-lived (cleared periodically) |
| Extension settings | `chrome.storage.local` | Until reset or uninstall |
| IMAP credentials | OS keychain (via InboxBridge) | Until the account is disconnected or InboxBridge is uninstalled |

Encryption at rest for browser storage is planned but not yet shipped.

## What InboxKey does not do

- Operate servers or databases
- Collect analytics, telemetry, or usage statistics
- Track browsing activity
- Display or serve advertisements
- Share data with third parties
- Send crash reports
- Store advertising identifiers

There is no data to share, sell, or disclose because no data leaves the device.

## Permissions

InboxKey requests the following Chrome permissions:

| Permission | Purpose |
|-----------|---------|
| `gmail.readonly` | Read-only access to Gmail messages for code detection |
| `storage` | Local extension settings and cached state |
| `alarms` | Session polling timers (MV3 service worker keepalive) |
| `tabs` | Opening Google Messages tab for SMS, opening settings pages |
| `identity` | Chrome OAuth for Gmail authentication |
| `notifications` | Informing the user about extension state (e.g., after an update) |
| `nativeMessaging` | Communication with InboxBridge for IMAP support |
| `scripting` | Reading Google Messages conversation previews for SMS codes |
| `activeTab` | Detecting verification fields on the current page |

No host permissions beyond `https://*/*` and `http://*/*` are requested.

## Removing data

- **Disconnect an account:** open InboxKey Settings, find the account, and click Disconnect. This removes the account record from extension storage. For IMAP accounts, InboxBridge also removes the credential from the OS keychain.
- **Uninstall InboxBridge:** open InboxKey Settings and use the Uninstall InboxBridge flow. This removes all IMAP credentials from the OS keychain and deletes stored account state.
- **Uninstall the extension:** removing InboxKey from Chrome deletes all `chrome.storage.local` and `chrome.storage.session` data for the extension.

After these steps, no InboxKey data remains on the device.

## Source availability

All InboxKey source code is publicly available at [github.com/slmnsrf/inboxkey](https://github.com/slmnsrf/inboxkey) under the PolyForm Noncommercial 1.0.0 license. Security audits and code review are welcome.

## Changes to this policy

Updates to this policy are committed to the GitHub repository with a visible diff history. The "Last Updated" date at the top reflects the most recent revision.

## Contact

For questions about this policy or about how InboxKey handles data:

- **Email:** inboxbridge.extension@gmail.com
- **GitHub Issues:** [github.com/slmnsrf/inboxkey/issues](https://github.com/slmnsrf/inboxkey/issues)
