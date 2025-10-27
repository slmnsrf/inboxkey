# InboxKey Architecture

**Version:** 0.0.1
**Last Updated:** 2025-10-26

---

## Core Architecture Principles

1. **Privacy-First:** All processing local, zero servers, zero telemetry
2. **Multi-Provider:** Gmail, Outlook, IMAP with provider-agnostic adapters
3. **Multi-Account:** Unlimited accounts per provider (except Gmail: 1 account due to Chrome API)
4. **Encrypted Storage:** AES-GCM for tokens, chrome.storage.session for ephemeral codes
5. **Zero-Trust UI:** Email validation on reconnect, account mismatch detection

---

## Provider System

### Supported Providers

| Provider | Auth Method | Account Limit | Credential Storage |
|----------|-------------|---------------|-------------------|
| **Gmail** | Chrome Identity API | **1 account** (platform limitation) | Chrome manages tokens |
| **Outlook** | PKCE OAuth 2.0 | **Unlimited** (UI default: 10) | AES-GCM encrypted in chrome.storage.local |
| **IMAP** | Native Bridge | **Unlimited** | OS keychain via InboxBridge native app |

### Gmail Limitation

Gmail is limited to **1 account** due to Chrome Identity API architecture:
- `chrome.identity.getAuthToken()` is tied to Chrome user's primary Google account
- No PKCE support without client secret (Google requires it even with PKCE)
- Multi-account Gmail requires backend relay server (violates privacy-first principle)

### Outlook Multi-Account

Outlook supports **unlimited accounts** via PKCE OAuth 2.0:
- `chrome.identity.launchWebAuthFlow()` with PKCE (no client secret)
- Each account gets unique mailbox ID and encrypted tokens
- UI default limit: 10 accounts (configurable, prevents UX clutter)

### IMAP Multi-Account

IMAP supports **unlimited accounts** via InboxBridge native app:
- Credentials stored in OS keychain (macOS Keychain, Windows Credential Manager)
- Extension stores only account ID reference, no passwords
- Supports Yahoo, ProtonMail, FastMail, custom IMAP servers

---

## Storage Architecture

### Mailbox Schema

```typescript
interface Mailbox {
  id: string                // UUID v4
  providerId: 'gmail' | 'outlook' | 'imap-bridge'
  email: string

  // OAuth providers (gmail, outlook)
  accessToken?: string      // AES-GCM encrypted
  refreshToken?: string     // AES-GCM encrypted
  tokenExpiresAt?: number   // Unix timestamp (ms)

  // IMAP provider
  imapServer?: string       // e.g., "imap.gmail.com"
  imapPort?: number         // e.g., 993
  imapAccountId?: string    // OS keychain reference
  imapUsername?: string     // Optional, defaults to email

  addedAt: number           // Unix timestamp (ms)
  lastSyncedAt: number      // Unix timestamp (ms)
}
```

### Duplicate Prevention

**Rule:** Same email allowed across **different** providers, blocked within **same** provider.

```typescript
// Storage validation (plaintext-storage.ts:106)
if (mailboxes.some((m) =>
  m.email === mailbox.email &&
  m.providerId === mailbox.providerId
)) {
  throw new ValidationError(
    `Mailbox with email ${mailbox.email} already exists for provider ${mailbox.providerId}`
  )
}
```

**Allowed:**
- ✅ Multiple Outlook accounts with different emails (e.g., work@outlook.com, personal@hotmail.com)
- ✅ Same email across different providers (e.g., user@gmail.com via Gmail API + user@gmail.com via IMAP)

**Blocked:**
- ❌ Duplicate email on same provider (e.g., two Gmail accounts with user@gmail.com)

---

## Message Handlers (Background Script)

### OAuth Account Management

```typescript
// STORE_MAILBOX: Add/update OAuth account (gmail, outlook)
{
  type: "STORE_MAILBOX",
  provider: "gmail" | "outlook",
  email: string,
  tokens: {
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  }
}
```

### IMAP Account Management

```typescript
// STORE_IMAP_MAILBOX: Add IMAP account via InboxBridge
{
  type: "STORE_IMAP_MAILBOX",
  accountId: string,      // InboxBridge account ID
  email: string,
  server: string,         // IMAP server hostname
  port: number,           // IMAP port (usually 993)
  label: string           // Custom account label (optional)
}
```

### Account Removal

```typescript
// REMOVE_MAILBOX: Remove any account type
{
  type: "REMOVE_MAILBOX",
  mailboxId: string       // UUID of mailbox to remove
}
```

---

## UI Architecture

### Account Management Views

**Gmail:** Single-slot card (1 account max)
- Connect/Disconnect buttons
- Status indicator (connected/disconnected)
- Last synced timestamp
- Microcopy: "Only one Gmail account can be connected."

**Outlook:** Row-based multi-account list
- Scrollable list (max 6 visible, 60px rows, 8px gap)
- Each row: email, last synced, reconnect/remove buttons
- Account counter badge
- Add button (disabled at limit)
- Empty state with onboarding message

**IMAP:** Row-based multi-account list
- Same pattern as Outlook
- Add button opens modal with provider presets
- InboxBridge installation check

### Reconnect Flow with Email Validation

**Problem:** User with multiple Outlook accounts could reconnect wrong account.

**Solution:** Email validation before token storage.

```typescript
// AccountsPanel.tsx:246-300
const handleReconnectOutlook = async (mailboxId: string) => {
  const mailbox = mailboxes.find((mb) => mb.id === mailboxId)
  const expectedEmail = mailbox.email  // What we expect

  const tokens = await authenticateOutlook()
  const actualEmail = await fetchOutlookProfile(tokens.accessToken)

  // Validate email match (case-insensitive)
  if (actualEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
    showToast(
      `Account mismatch. Expected ${expectedEmail} but got ${actualEmail}.`,
      'error',
      6000
    )
    return  // Early exit, no token storage
  }

  // Only store if emails match
  await storeMailbox(...)
}
```

---

## Data Flow

### OAuth Authentication Flow

```
User clicks "Add Outlook Account"
  → AccountsPanel.handleConnect('outlook', 'connect')
  → authenticateOutlook() via chrome.identity.launchWebAuthFlow
  → PKCE challenge generated, state stored in chrome.storage.session
  → User authenticates with Microsoft
  → Authorization code returned
  → Token exchange with PKCE verifier
  → fetchOutlookProfile(accessToken) to get email
  → Background: STORE_MAILBOX message
  → Storage: Encrypt tokens with AES-GCM
  → Storage: Add to mailboxes array
  → UI: Reload mailboxes, show success toast
```

### Session Polling (Multi-Account)

```
Watch session starts (user visits login page)
  → SessionController.createSession(tabId, url)
  → StorageFactory.getMailboxes() → [mailbox1, mailbox2, ...]
  → createAdaptersFromMailboxes([...]) → [adapter1, adapter2, ...]
  → Poll all adapters simultaneously every 5-10s
  → Aggregate codes from all mailboxes
  → Score codes by domain affinity, recency
  → Show highest-scoring code in session chip
  → Auto-fill if automation level permits
```

**Key:** Each mailbox gets its own adapter instance. No shared state. Polling is parallel.

---

## Security Boundaries

### Token Encryption

**Algorithm:** AES-GCM 256-bit
**Key Derivation:** PBKDF2 (100,000 iterations)
**Storage:** chrome.storage.local (encrypted ciphertext only)
**Decryption:** In-memory only, keys cleared on lock/logout

### Account Isolation

Each mailbox is isolated:
- ✅ Separate encryption keys per token
- ✅ Independent OAuth refresh flows
- ✅ No cross-account data leakage
- ✅ Removal of one account doesn't affect others

### OAuth Scopes

**Gmail:** `https://www.googleapis.com/auth/gmail.readonly`
**Outlook:** `Mail.Read`, `User.Read`, `offline_access`
**IMAP:** Read-only IMAP access (no SMTP, no delete)

All providers are **read-only**. Extension cannot send emails, delete messages, or modify mailbox state.

---

## Performance

### Popup Load Time

**Target:** <200ms for options page, <100ms for popup

**Optimization:**
- Popup cache (chrome.storage.session)
- Pre-warmed mailbox count and recent items
- Lazy-load account details on Accounts tab
- Virtualized lists for 10+ accounts

### Polling Throttle

**Gmail/Outlook API limits:** 10,000 requests per 10 minutes
**IMAP no enforced limit** (respect server rate limits)

**InboxKey throttle:**
- 0-20s: Every 5s (dense polling for fast providers)
- 20-120s: Every 10s (sparse polling for slow providers)
- Max session duration: 120s (configurable, default 30s)

With 10 mailboxes and 30s session:
- Polls: 6 (0s, 5s, 10s, 15s, 20s, 30s)
- Total requests: 60 (well within 10k limit)

---

## Component Structure

### UI Components

```
src/ui/components/
├── AccountsPanel.tsx          # Main accounts management view
├── accounts/
│   ├── types.ts               # Shared types
│   ├── ProviderSlotCard.tsx   # Gmail single-slot card
│   ├── OutlookAccountsSection.tsx   # Outlook multi-account list
│   ├── OutlookAccountRow.tsx        # Outlook account row
│   ├── ImapAccountsSection.tsx      # IMAP multi-account list
│   ├── ImapAccountRow.tsx           # IMAP account row
│   └── AddImapAccountModal.tsx      # IMAP add/edit form
```

### Provider Adapters

```
src/lib/providers/
├── provider-interface.ts      # Common interface
├── gmail/
│   ├── gmail-provider.ts      # Gmail API implementation
│   └── chrome-auth.ts         # Chrome Identity API
├── outlook/
│   ├── outlook-provider.ts    # Microsoft Graph API
│   ├── chrome-auth.ts         # PKCE + launchWebAuthFlow
│   ├── outlook-auth.ts        # PKCE logic
│   └── config.ts              # OAuth client ID
└── imap-bridge/
    ├── imap-bridge-adapter.ts # InboxBridge native messaging
    └── native-client.ts       # chrome.runtime.connectNative
```

### Storage Layer

```
src/lib/storage/
├── storage-interface.ts       # IStorage interface
├── plaintext-storage.ts       # Implementation (encrypted via WebCrypto)
├── storage-factory.ts         # Singleton factory
└── schema.ts                  # Mailbox, Settings, StoredCode types
```

---

## Files Modified (Session 2025-10-26)

### Created

- `src/ui/components/accounts/OutlookAccountsSection.tsx` (180 LOC)
- `src/ui/components/accounts/OutlookAccountRow.tsx` (80 LOC)
- `architecture.md` (560 LOC) - **This document**

### Modified

- `src/lib/storage/plaintext-storage.ts` (+28 LOC)
  - **Changed:** Duplicate check from global to provider-specific (line 106)
  - **Changed:** validateMailbox() split by provider type (line 199-236)
  - **Impact:** Enables multi-account per provider + IMAP validation fix

- `src/background/index.ts` (+49 LOC)
  - **Added:** STORE_IMAP_MAILBOX message handler (line 239-242, 613-655)
  - **Impact:** IMAP accounts can now be saved

- `src/ui/components/AccountsPanel.tsx` (+53 LOC)
  - **Added:** handleReconnectOutlook with email validation (line 246-300)
  - **Added:** handleRemoveOutlook for multi-account removal (line 303-325)
  - **Changed:** Duplicate check only for Gmail (line 170-179)
  - **Impact:** Multi-account Outlook support with account mismatch protection

- `_locales/en/messages.json` (+21 keys)
  - **Added:** Connection status, toast notifications, error messages
  - **Impact:** Silent failures now surface with clear error messages

---

## Architectural Decisions

### ADR-001: Provider-Specific Duplicate Check

**Status:** Implemented (2025-10-26)

**Context:**
Original storage layer prevented ANY duplicate email across ALL providers. This blocked multi-account Outlook and prevented same email via different providers (e.g., Gmail API + IMAP).

**Decision:**
Changed duplicate check to be provider-specific: `m.email === mailbox.email && m.providerId === mailbox.providerId`

**Consequences:**
- ✅ Enables unlimited Outlook accounts with different emails
- ✅ Allows same email via different providers (rare but valid use case)
- ✅ Still prevents duplicate email on same provider
- ✅ No storage migration required (existing data unaffected)

**Code:** `src/lib/storage/plaintext-storage.ts:106`

### ADR-002: Email Validation on Reconnect

**Status:** Implemented (2025-10-26)

**Context:**
User with multiple Outlook accounts could click "Reconnect" on work@outlook.com but sign in with personal@outlook.com. Tokens would be stored incorrectly, causing account confusion.

**Decision:**
Add email validation before token storage. Fetch profile with new tokens, compare with expected email (case-insensitive), reject if mismatch.

**Consequences:**
- ✅ Prevents wrong-account reconnection
- ✅ Clear error message guides user to correct account
- ✅ No data corruption from mismatched tokens
- ❌ Adds one extra API call (fetchProfile) per reconnect
- ❌ User must retry if they pick wrong account

**Code:** `src/ui/components/AccountsPanel.tsx:246-300`

### ADR-003: Missing IMAP Message Handler

**Status:** Fixed (2025-10-26)

**Context:**
IMAP account addition sent `STORE_IMAP_MAILBOX` message, but background script had no handler. Accounts failed to save silently.

**Decision:**
Add `STORE_IMAP_MAILBOX` handler that creates IMAP-specific mailbox record (no OAuth fields, includes imapServer/Port/AccountId).

**Consequences:**
- ✅ IMAP accounts now save successfully
- ✅ Consistent pattern with STORE_MAILBOX for OAuth
- ✅ Proper validation of IMAP-specific fields

**Code:** `src/background/index.ts:239-242, 613-655`

### ADR-004: Provider-Specific Storage Validation

**Status:** Fixed (2025-10-26)

**Context:**
PlaintextStorage.validateMailbox() hardcoded OAuth validation (checked for accessToken) without checking provider type. IMAP accounts failed with "Access token cannot be empty".

**Decision:**
Split validation by provider type:
- IMAP: Validate imapServer, imapPort, imapAccountId (skip OAuth fields)
- OAuth: Validate accessToken, refreshToken, tokenExpiresAt (skip IMAP fields)

**Consequences:**
- ✅ IMAP accounts pass validation correctly
- ✅ OAuth accounts still validated for required tokens
- ✅ Clear error messages per provider type
- ✅ Dual validation layers: validateMailboxBeforeWrite() + validateMailbox()

**Code:** `src/lib/storage/plaintext-storage.ts:199-236`

---

## Testing Strategy

### Multi-Account Testing

**Gmail (1 account):**
- ✅ Connect 1st account → Success
- ✅ Try to connect 2nd account → Error: "This account is already connected"

**Outlook (unlimited):**
- ✅ Connect account A → Success
- ✅ Connect account B → Success
- ✅ Connect account C → Success
- ✅ Reconnect account A with account B credentials → Error: "Account mismatch"
- ✅ Remove account B → Accounts A and C remain

**IMAP (unlimited):**
- ✅ Add Yahoo account → Success
- ✅ Add ProtonMail account → Success
- ✅ Remove Yahoo → ProtonMail remains

### Regression Testing

- ✅ Storage: Existing single-account data loads correctly
- ✅ Adapters: Session polling works with multiple accounts
- ✅ Encryption: Tokens remain encrypted after multi-account addition
- ✅ UI: Gmail slot remains single-account (microcopy visible)

---

## Future Considerations

### Potential Enhancements

1. **Account Groups/Labels**
   - User-defined labels (e.g., "Work", "Personal")
   - Filter codes by account group

2. **Account Sync Priority**
   - Poll work accounts more frequently during work hours
   - Adaptive polling based on code arrival patterns

3. **Cross-Account Code Search**
   - Search codes across all accounts
   - "Show all codes from work@outlook.com"

4. **Account Health Dashboard**
   - Last successful sync per account
   - Token expiry warnings
   - API quota usage

### Known Limitations

1. **Gmail Multi-Account:**
   Not possible without backend relay (violates privacy-first principle)

2. **UI Scalability:**
   Scrollable lists tested up to 10 accounts. 50+ accounts may need virtualization.

3. **Polling Performance:**
   10 accounts × 6 polls = 60 API calls per session. Within limits, but may need throttling at 50+ accounts.

4. **Account Removal UX:**
   No undo after account removal. Consider soft-delete with 30-day retention.

---

**End of Architecture Document**
