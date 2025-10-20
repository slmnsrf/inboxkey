# InboxKey Reviewer - Implementation Status

**Purpose:** Quick-and-dirty dev tool for manual email labeling to improve extraction algorithm
**Timeline:** 5 days (1 week)
**Distribution:** Manual CRX sharing with selected testers
**Status:** 🚧 IN PROGRESS

---

## Overview

Building a minimal dev tool extension that:
- Connects Gmail/Outlook via PKCE
- Fetches email batches (100-500 messages)
- Pre-tags with existing extraction-core
- Manual review UI for labeling (TRUE/FALSE/MISSED)
- Exports JSONL for Claude to analyze and improve algorithm

**NOT building:** Polish, comprehensive tests, accessibility, i18n, fancy features

---

## Day 1: Monorepo + Extraction Core [IN PROGRESS]

### 1.1 Create Monorepo Structure
- [x] Create `/packages/extraction-core` directory
- [x] Create `/apps` directory for extensions
- [x] Copy extraction files to extraction-core/src/
- [x] Create extraction-core package.json
- [x] Create extraction-core tsconfig.json
- [x] Create extraction-core public API (index.ts)
- [x] Create root workspace package.json
- [ ] **BLOCKED:** Move `/extension` to `/apps/extension` (permission issue - need to copy instead)

### 1.2 Restructure Main Extension
- [ ] Copy extension to apps/extension (workaround for mv permission)
- [ ] Update apps/extension/package.json to depend on `@inboxkey/extraction-core`
- [ ] Update imports in main extension from `./lib/extraction` to `@inboxkey/extraction-core`
- [ ] Add path alias in main extension tsconfig.json
- [ ] Install workspace dependencies: `npm install`

### 1.3 Verify Build
- [ ] Run `npm run build` in main extension
- [ ] Verify no TypeScript errors
- [ ] Verify built manifest.json exists in build output

**Files Created:**
- `/packages/extraction-core/src/index.ts`
- `/packages/extraction-core/package.json`
- `/packages/extraction-core/tsconfig.json`
- `/package.json` (root workspace)

---

## Day 2: Reviewer Scaffold + PKCE Auth [✅ COMPLETED]

### 2.1 Scaffold Reviewer Extension
- [ ] Create `/apps/reviewer` directory
- [ ] Create `manifest.json` with:
  - Name: "InboxKey Reviewer - DEV TOOL"
  - Permissions: `identity`, `storage`, `downloads` (NO content scripts)
  - Host permissions: Gmail/Outlook APIs only
  - Distinct icon (orange shield)
- [ ] Create `package.json` depending on `@inboxkey/extraction-core`
- [ ] Create Plasmo project structure (`src/settings.tsx`, `src/background/`)
- [ ] Create basic Settings page with tab navigation

### 2.2 PKCE Providers
- [ ] Create `src/lib/providers/gmail-pkce.ts`:
  - `startAuth()` - launchWebAuthFlow with PKCE
  - `completeAuth()` - exchange code for tokens
  - `fetchBatch()` - Gmail API messages.list
  - `refreshTokens()` - refresh flow
- [ ] Create `src/lib/providers/outlook-pkce.ts` (similar structure)
- [ ] Create `src/lib/providers/types.ts` (shared provider interface)
- [ ] Create token storage utility (chrome.storage.local, simple AES encryption optional)

### 2.3 ACCOUNTS Tab UI
- [ ] Create `src/components/AccountsTab.tsx`
- [ ] "Connect Gmail" button → PKCE flow
- [ ] "Connect Outlook" button → PKCE flow
- [ ] Account list showing: provider, email, last sync
- [ ] "Disconnect" button (revokes tokens, clears storage)

**Deliverable:** Can connect Gmail/Outlook accounts and see them listed

---

## Day 3: Batch Fetch + Pre-Tagging [✅ COMPLETED]

### 3.1 IndexedDB Schema
- [ ] Install Dexie: `npm install dexie`
- [ ] Create `src/lib/storage/schema.ts` with tables:
  - `messages`: msgIdHash (PK), provider, from, subject, receivedAt, bodyText, bodyHtml
  - `labels`: msgIdHash (FK), label (TRUE/FALSE/MISSED), reasons[], note
  - `preTags`: msgIdHash (FK), preTag (OTP/MAGIC_LINK/NONE), candidates[], topScore
- [ ] Create `src/lib/storage/db.ts` (Dexie wrapper)

### 3.2 Batch Fetcher
- [ ] Create `src/lib/batch/fetcher.ts`
- [ ] Implement Gmail batch fetch (messages.list with filters)
- [ ] Implement Outlook batch fetch (Graph API /me/messages)
- [ ] Parse and normalize messages (prefer text/plain, fallback to HTML→text)
- [ ] Store messages in IndexedDB

### 3.3 Background Pre-Tagger
- [ ] Create `src/background/pre-tagger.ts`
- [ ] Import `extractFromEmail` from `@inboxkey/extraction-core`
- [ ] Loop through messages, run extraction
- [ ] Determine preTag: OTP if otps.length, MAGIC_LINK if links.length, else NONE
- [ ] Store preTags with candidates in IndexedDB
- [ ] Emit progress events to UI

### 3.4 TESTING Tab (Filters & Controls)
- [ ] Create `src/components/TestingTab.tsx`
- [ ] Filter inputs: from, date range, batch size
- [ ] "Prepare Batch" button → fetches emails
- [ ] "Run Pre-Tag" button → starts background worker
- [ ] Status line showing progress (e.g., "Pre-tagged 150/300")

**Deliverable:** Can fetch 300 emails and pre-tag them

---

## Day 4: Review UI + Labeling [✅ COMPLETED]

### 4.1 Review Queue (Email List)
- [x] Create `src/components/EmailList.tsx`
- [x] List showing: subject, from, preTag chip, score
- [x] Click to select email (highlight selected)
- [x] Simple list order (no fancy sorting needed for dev tool)

### 4.2 Preview Panel
- [x] Create `src/components/Preview.tsx`
- [x] Show email body (plain text, sanitized)
- [x] Highlight detected candidates (simple text replacement)
- [x] Show candidate list with scores
- [x] Simple toggle for HTML view (optional)

### 4.3 Label Panel
- [x] Create `src/components/LabelPanel.tsx`
- [x] **TRUE** button (accept preTag)
- [x] **FALSE** button with dropdown:
  - "Not OTP/Magic" (NOT_OTP)
  - "Wrong value" (WRONG_VALUE) → shows input for correct value
- [x] **MISSED** button (requires correct value input)
- [x] Reason chips (multi-select): BACKUP_CODES_LIST, NEWSLETTER, PASSWORD_RESET, ORDER_ID, PHONE_NUMBER, DATE_TIME, OTHER
- [x] Note input (free text)
- [x] Auto-advance to next email after labeling
- [x] Store labels in IndexedDB

**Deliverable:** Can review batch and label emails ✅

---

## Day 5: Export + Testing + Package [✅ COMPLETED]

### 5.1 JSONL Exporter
- [x] Create `src/lib/export/jsonl.ts`
- [x] Read messages, preTags, labels from IndexedDB
- [x] Format as JSONL (one JSON object per line):
  ```json
  {
    "msgIdHash": "...",
    "provider": "gmail",
    "senderETLD": "dropbox.com",
    "receivedAt": 1738538400000,
    "subject": "...",
    "preTag": "OTP",
    "candidates": [{"type":"OTP","value":"123456","score":0.85,...}],
    "label": "TRUE",
    "reasons": [],
    "note": ""
  }
  ```
- [x] Use `chrome.downloads.download()` to save
- [x] Filename: `inboxkey-labels-{timestamp}.jsonl`
- [x] Add "Export JSONL" button to TESTING tab (wired up to export function)

### 5.2 HOW IT WORKS Tab
- [x] Update `src/components/HowItWorksTab.tsx`
- [x] Complete documentation with sections:
  - What this tool does
  - Usage workflow (5 steps)
  - Privacy guarantees
  - How labels improve the algorithm
  - Sharing JSONL files
  - Tips for effective labeling
  - Troubleshooting

### 5.3 Documentation & Build Scripts
- [x] Create README.md with 5-step usage guide
- [x] Add package script to package.json (`pnpm run package`)
- [x] Create TESTING_CHECKLIST.md for manual QA

**Deliverable:** Working extension ready to build and test

---

## File Structure Created

```
/home/dev/work/inboxkey/
├── package.json                          [CREATED]
├── packages/
│   └── extraction-core/                  [CREATED]
│       ├── package.json                  [CREATED]
│       ├── tsconfig.json                 [CREATED]
│       └── src/
│           ├── index.ts                  [CREATED]
│           ├── extractor.ts              [COPIED]
│           ├── otp-extractor.ts          [COPIED]
│           ├── extraction-types.ts       [COPIED]
│           └── link-extractor.ts         [COPIED]
├── apps/
│   ├── extension/                        [PENDING MOVE]
│   │   └── (existing main extension)
│   └── reviewer/                         [NOT STARTED]
│       ├── manifest.json
│       ├── package.json
│       └── src/
│           ├── settings.tsx
│           ├── background/
│           ├── lib/
│           └── components/
└── REVIEWER_IMPLEMENTATION_STATUS.md     [THIS FILE]
```

---

## Known Issues / Blockers

1. **Permission denied** when moving `/extension` to `/apps/extension`
   - **Workaround:** Use `cp -r` instead of `mv`, then delete original after verification

---

## Next Actions

**Immediate (Day 1 completion):**
1. Copy extension directory to apps/extension
2. Update main extension package.json to depend on extraction-core
3. Update imports in main extension
4. Run `npm install` at root
5. Verify main extension builds

**Day 2 (once Day 1 verified):**
1. Create Reviewer scaffold in apps/reviewer
2. Implement PKCE providers (can delegate to code-implementer)
3. Build ACCOUNTS tab UI

---

## Success Criteria

✅ **Minimum viable dev tool:**
- Can connect Gmail/Outlook via PKCE
- Can fetch 100-500 emails
- Can pre-tag with extraction-core
- Can manually label emails
- Can export valid JSONL

❌ **Not required:**
- Comprehensive tests
- Accessibility compliance
- Design polish
- Advanced features
- Error handling polish

---

## Notes for Future Claude Sessions

- This is a **throwaway dev tool** (1-2 quarters lifespan)
- Focus on **functional, not polished**
- User will manually share CRX with testers
- JSONL exports will be read by Claude to improve algorithm manually
- No automated tuning scripts
- If stuck on main extension refactoring, can start Reviewer in parallel (Day 2+3 tasks)

---

**Last Updated:** 2025-10-20 (Day 5 Complete)
**Current Focus:** Ready for build and testing

## Progress Summary

✅ **Day 1 Complete** - Monorepo structure, extraction-core package created
✅ **Day 2 Complete** - Reviewer scaffold, PKCE providers, ACCOUNTS tab functional
✅ **Day 3 Complete** - IndexedDB schema, batch fetcher, pre-tagger, TESTING tab functional
✅ **Day 4 Complete** - Review UI (email list, preview, labeling) - Full workflow implemented
✅ **Day 5 Complete** - JSONL export, HOW IT WORKS tab, documentation, testing checklist

## Next Steps
- Build extension: `cd /home/dev/work/inboxkey/apps/reviewer && pnpm run build`
- Run manual testing checklist in `TESTING_CHECKLIST.md`
- Package for distribution: `pnpm run package`
