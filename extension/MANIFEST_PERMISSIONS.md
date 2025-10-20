# Manifest Permissions Justification

This document explains why each permission is required, per Chrome Web Store policy.

## storage
**Why:** Store user settings, connected accounts, and encrypted session data
**Data Flow:** Extension storage API (local only)
**User Benefit:** Settings persist across sessions; no re-login required
**Privacy Impact:** All data stored locally; encrypted at rest
**Alternatives Considered:** LocalStorage (insufficient security)

## alarms
**Why:** Schedule email polling at 0s, 5s, 10s intervals during watch sessions
**Data Flow:** Chrome alarms API (no data transmission)
**User Benefit:** Timely OTP/magic link detection without manual refresh
**Privacy Impact:** None (scheduling only)
**Alternatives Considered:** setInterval (unreliable in MV3 service workers)

## tabs
**Why:** Open magic links in secure context; detect active tab for watch sessions
**Data Flow:** Read active tab URL; open new tabs
**User Benefit:** One-click magic link opening; context-aware code detection
**Privacy Impact:** Only reads URL when user explicitly starts watch session
**Alternatives Considered:** None (tabs API required for URL access)

## identity
**Why:** OAuth authentication for Gmail and Microsoft accounts
**Data Flow:** Chrome identity API → OAuth providers (Google, Microsoft)
**User Benefit:** Secure, passwordless authentication; no credentials stored
**Privacy Impact:** OAuth tokens stored locally; managed by Chrome
**Alternatives Considered:** Manual OAuth (worse UX, same permissions needed)

## notifications
**Why:** Notify users of successful code detection; alert on errors
**Data Flow:** Chrome notifications API (local only)
**User Benefit:** Visual feedback without checking extension; error awareness
**Privacy Impact:** Notification content is minimal (e.g., "Code detected ✓")
**Alternatives Considered:** None (required for background notifications)

## nativeMessaging
**Why:** Communicate with InboxBridge native app for IMAP email access
**Data Flow:** Extension ↔ InboxBridge (local stdin/stdout, no network)
**User Benefit:** Support for Yahoo, Fastmail, and custom IMAP providers
**Privacy Impact:** No additional data collection; credentials stored in OS keychain (not extension)
**Alternatives Considered:** Cloud proxy (violates privacy-first promise); WebSockets (cannot connect to IMAP servers)
**Security:** Native Messaging manifest whitelists exact extension ID; only InboxKey can connect

---

**Last Updated:** 2025-10-20
**Required By:** Chrome Web Store Developer Program Policies § 4.8.12
