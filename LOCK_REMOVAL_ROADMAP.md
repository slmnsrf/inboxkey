# Lock/Unlock Feature Removal Roadmap

## Overview
Complete removal of password protection and lock/unlock functionality from InboxKey extension. Security tab will be repurposed as a trust-building informational page.

**Version:** v0.1.x → v0.2.0 (Breaking Change)
**Timeline:** 16-25 days
**Status:** 🟡 In Progress
**Started:** 2025-10-19

---

## Progress Tracking

### Overall Progress: 0% Complete (0/7 phases)

| Phase | Status | Progress | Files | Priority |
|-------|--------|----------|-------|----------|
| Phase 1: Storage Layer | 🔴 Not Started | 0/5 | 5 files | CRITICAL |
| Phase 2: Crypto Layer | 🔴 Not Started | 0/4 | 4 files | HIGH |
| Phase 3: Background SW | 🔴 Not Started | 0/3 | 3 files | HIGH |
| Phase 4: UI Components | 🔴 Not Started | 0/14 | 14 files | MEDIUM |
| Phase 5: Main UI | 🔴 Not Started | 0/3 | 3 files | MEDIUM |
| Phase 6: Migration | 🔴 Not Started | 0/4 | 4 files | CRITICAL |
| Phase 7: Tests & Docs | 🔴 Not Started | 0/20 | 20+ files | LOW |

**Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

---

## Phase 1: Storage Layer Refactor (CRITICAL PATH)
**Timeline:** 3-5 days | **Risk:** HIGH | **Priority:** P0

### Tasks

- [ ] **1.1** Update type definitions
  - [ ] Remove `EncryptedData` type from `/extension/src/lib/types.ts`
  - [ ] Remove `EncryptedMailbox` type
  - [ ] Remove `EncryptedStoredCode` type
  - [ ] Update `Mailbox` interface (direct string tokens)
  - [ ] Update `StoredCode` interface (direct string code)
  - **Status:** 🔴 Not Started

- [ ] **1.2** Simplify StorageFactory
  - [ ] Modify `/extension/src/lib/storage/storage-factory.ts`
  - [ ] Replace factory logic with single return statement
  - [ ] Always return `PlaintextStorage` instance
  - [ ] Remove encryption detection logic
  - **Status:** 🔴 Not Started

- [ ] **1.3** Delete EncryptedStorage
  - [ ] Delete `/extension/src/lib/storage/encrypted-storage.ts`
  - [ ] Delete `/extension/src/lib/storage/migration.ts`
  - [ ] Update imports in dependent files
  - **Status:** 🔴 Not Started

- [ ] **1.4** Update PlaintextStorage
  - [ ] Review `/extension/src/lib/storage/plaintext-storage.ts`
  - [ ] Remove encryption references in comments
  - [ ] Verify it becomes canonical implementation
  - **Status:** 🔴 Not Started

- [ ] **1.5** Update IStorage interface
  - [ ] Review interface definitions
  - [ ] Ensure no encryption-specific methods remain
  - **Status:** 🔴 Not Started

### Dependencies
- None (starting phase)

### Success Criteria
- ✓ All type definitions updated
- ✓ StorageFactory simplified to 3 lines
- ✓ Encrypted storage files deleted
- ✓ No compilation errors
- ✓ PlaintextStorage is sole implementation

---

## Phase 2: Crypto Layer Cleanup
**Timeline:** 2-3 days | **Risk:** MEDIUM | **Priority:** P0

### Tasks

- [ ] **2.1** Delete lock-state.ts
  - [ ] Delete `/extension/src/lib/crypto/lock-state.ts`
  - [ ] Remove imports in other files
  - **Status:** 🔴 Not Started

- [ ] **2.2** Refactor KeyManager
  - [ ] Open `/extension/src/lib/crypto/key-manager.ts`
  - [ ] Decision: Keep encryption utils OR delete entirely
  - [ ] Remove `initialize()` method
  - [ ] Remove `lock()` method
  - [ ] Remove `unlock()` method
  - [ ] Remove `isLocked()` method
  - [ ] Remove `isInitialized()` method
  - [ ] Remove `getMasterKey()` method
  - [ ] Remove `getSalt()` method
  - [ ] Remove `resetAutoLockTimer()` method
  - [ ] Remove auto-lock timer logic
  - [ ] Remove password verification logic
  - [ ] Keep: `deriveKey()`, `encrypt()`, `decrypt()` if useful
  - **Status:** 🔴 Not Started

- [ ] **2.3** Clean up error types
  - [ ] Modify `/extension/src/lib/crypto/errors.ts`
  - [ ] Remove `LockError` class
  - [ ] Remove `KeyDerivationError` class (if not used elsewhere)
  - [ ] Update exports
  - **Status:** 🔴 Not Started

- [ ] **2.4** Update crypto module exports
  - [ ] Review `/extension/src/lib/crypto/index.ts`
  - [ ] Remove lock-related exports
  - **Status:** 🔴 Not Started

### Dependencies
- Phase 1 complete (type definitions updated)

### Success Criteria
- ✓ Lock-state utilities deleted
- ✓ KeyManager refactored (or deleted)
- ✓ Error types cleaned up
- ✓ No compilation errors
- ✓ Crypto module simplified

---

## Phase 3: Background Service Worker Updates
**Timeline:** 2-3 days | **Risk:** MEDIUM | **Priority:** P0

### Tasks

- [ ] **3.1** Remove lock message handlers
  - [ ] Open `/extension/src/background/popup-handler.ts`
  - [ ] Remove `INITIALIZE_PASSWORD` handler
  - [ ] Remove `LOCK` handler
  - [ ] Remove `UNLOCK` handler
  - [ ] Remove `CHANGE_PASSWORD` handler
  - [ ] Remove `DISABLE_PASSWORD` handler
  - [ ] Remove `GET_LOCK_STATUS` handler
  - [ ] Modify `RESET_EXTENSION` handler (remove password check)
  - [ ] Remove lock state broadcasting
  - **Status:** 🔴 Not Started

- [ ] **3.2** Update background index
  - [ ] Open `/extension/src/background/index.ts`
  - [ ] Remove lock-related message listeners
  - [ ] Remove lock state initialization
  - **Status:** 🔴 Not Started

- [ ] **3.3** Remove lock checks in SessionController
  - [ ] Open `/extension/src/background/session-controller.ts`
  - [ ] Find `pollForCode()` method (around line 281-289)
  - [ ] Remove `keyManager.isLocked()` check
  - [ ] Remove conditional polling skip
  - **Status:** 🔴 Not Started

### Dependencies
- Phase 2 complete (KeyManager refactored)

### Success Criteria
- ✓ All lock message handlers removed
- ✓ Session controller always polls (no lock check)
- ✓ Background SW simplified
- ✓ No compilation errors
- ✓ Extension loads in Chrome

---

## Phase 4: UI Component Removal
**Timeline:** 3-4 days | **Risk:** LOW | **Priority:** P1

### Tasks

- [ ] **4.1** Delete security components
  - [ ] Delete `/extension/src/ui/components/security/LockScreen.tsx`
  - [ ] Delete `/extension/src/ui/components/security/SecuritySettings.tsx`
  - [ ] Delete `/extension/src/ui/components/security/PasswordSetup.tsx`
  - [ ] Delete `/extension/src/ui/components/security/ChangePasswordForm.tsx`
  - [ ] Delete `/extension/src/ui/components/security/AutoLockConfig.tsx`
  - [ ] Delete `/extension/src/ui/components/security/PasswordInput.tsx`
  - [ ] Delete `/extension/src/ui/components/security/PopupLockOverlay.tsx`
  - [ ] Delete `/extension/src/ui/components/LockedState.tsx`
  - **Status:** 🔴 Not Started

- [ ] **4.2** Delete context and hooks
  - [ ] Delete `/extension/src/ui/contexts/LockContext.tsx`
  - [ ] Delete `/extension/src/ui/hooks/useLockStatus.ts`
  - **Status:** 🔴 Not Started

- [ ] **4.3** Delete lock service
  - [ ] Delete `/extension/src/lib/services/lock-service.ts`
  - **Status:** 🔴 Not Started

- [ ] **4.4** Create new SecurityInfo component
  - [ ] Create `/extension/src/ui/components/security/SecurityInfo.tsx`
  - [ ] Implement trust-building content
  - [ ] Add privacy-first section
  - [ ] Add data security section
  - [ ] Add transparency section
  - [ ] Add permissions explanation
  - [ ] Add external links (source code, docs)
  - [ ] Create supporting components (Section, ActionLinks, etc.)
  - **Status:** 🔴 Not Started
  - **Requires:** UI-UX approval

- [ ] **4.5** Update security component exports
  - [ ] Update `/extension/src/ui/components/security/index.ts`
  - [ ] Remove old component exports
  - [ ] Add SecurityInfo export
  - **Status:** 🔴 Not Started

### Dependencies
- Phase 3 complete (Background SW updated)

### Success Criteria
- ✓ All lock UI components deleted
- ✓ SecurityInfo component created and approved by UI-UX
- ✓ No compilation errors
- ✓ Component exports updated

---

## Phase 5: Main UI Updates
**Timeline:** 2-3 days | **Risk:** LOW | **Priority:** P1

### Tasks

- [ ] **5.1** Update popup.tsx
  - [ ] Open `/extension/src/popup.tsx`
  - [ ] Remove `LockProvider` wrapper
  - [ ] Remove lock screen conditional rendering
  - [ ] Remove lock button from header
  - [ ] Remove lock icon indicator
  - [ ] Simplify to always show MainUI
  - **Status:** 🔴 Not Started

- [ ] **5.2** Update options.tsx
  - [ ] Open `/extension/src/options.tsx`
  - [ ] Replace SecuritySettings with SecurityInfo
  - [ ] Update tab label to "Security & Privacy"
  - [ ] Move "Reset Extension" to Advanced tab
  - [ ] Add confirmation dialog for reset (no password protection)
  - **Status:** 🔴 Not Started

- [ ] **5.3** Update Header component
  - [ ] Open header component file
  - [ ] Remove lock button
  - [ ] Remove lock status display
  - [ ] Update layout if needed
  - **Status:** 🔴 Not Started

### Dependencies
- Phase 4 complete (UI components removed/created)

### Success Criteria
- ✓ Popup never shows lock screen
- ✓ Options page shows SecurityInfo
- ✓ Reset button moved and protected
- ✓ No lock UI elements remain
- ✓ Extension functional in dev mode

---

## Phase 6: Data Migration Implementation (CRITICAL)
**Timeline:** 3-5 days | **Risk:** HIGH | **Priority:** P0

### Tasks

- [ ] **6.1** Create migration module
  - [ ] Create `/extension/src/lib/storage/migration-to-plaintext.ts`
  - [ ] Implement `hasEncryptedData()` detection
  - [ ] Implement `migrateFromEncryptedToPlaintext()`
  - [ ] Implement decryption logic with password
  - [ ] Implement plaintext save logic
  - [ ] Implement cleanup of lock storage keys
  - [ ] Add error handling and rollback
  - [ ] Add migration status tracking
  - **Status:** 🔴 Not Started

- [ ] **6.2** Create migration UI
  - [ ] Create `/extension/src/ui/components/migration/MigrationDialog.tsx`
  - [ ] Design one-time password prompt
  - [ ] Add progress indicator
  - [ ] Add error display
  - [ ] Add success confirmation
  - [ ] Add "skip migration" option (data loss warning)
  - **Status:** 🔴 Not Started
  - **Requires:** UI-UX approval

- [ ] **6.3** Integrate migration check on startup
  - [ ] Modify `/extension/src/background/index.ts`
  - [ ] Add `chrome.runtime.onStartup` listener
  - [ ] Add migration status check
  - [ ] Set badge if migration needed
  - [ ] Show notification for migration
  - **Status:** 🔴 Not Started

- [ ] **6.4** Add migration trigger in UI
  - [ ] Add migration check in popup mount
  - [ ] Show MigrationDialog if needed
  - [ ] Block other UI until migration complete
  - [ ] Add manual migration trigger in settings
  - **Status:** 🔴 Not Started

### Dependencies
- Phase 1 complete (Storage layer ready)
- Phase 2 complete (Can still decrypt with old KeyManager)

### Success Criteria
- ✓ Migration logic implemented and tested
- ✓ Migration UI approved by UI-UX
- ✓ Automatic migration check on startup
- ✓ Manual migration option available
- ✓ Rollback mechanism in place
- ✓ Zero data loss in testing

---

## Phase 7: Testing, Documentation & Cleanup
**Timeline:** 2-3 days | **Risk:** LOW | **Priority:** P2

### Tasks

- [ ] **7.1** Delete test files
  - [ ] Delete `/extension/tests/unit/lock-state.test.ts`
  - [ ] Delete `/extension/src/lib/services/__tests__/lock-service.test.ts`
  - [ ] Delete `/extension/tests/e2e/lock-unlock.test.ts`
  - [ ] Delete `/extension/tests/e2e/popup-locked.test.ts`
  - [ ] Delete `/extension/src/ui/contexts/__tests__/LockContext.test.tsx`
  - [ ] Delete `/extension/src/ui/components/security/__tests__/LockScreen.test.tsx`
  - [ ] Delete `/extension/src/ui/components/security/__tests__/SecuritySettings.integration.test.tsx`
  - [ ] Update `/extension/tests/unit/key-manager.test.ts` (remove lock tests)
  - **Status:** 🔴 Not Started

- [ ] **7.2** Create new tests
  - [ ] Create `/extension/tests/unit/plaintext-storage.test.ts`
  - [ ] Create `/extension/tests/e2e/migration.test.ts`
  - [ ] Create `/extension/tests/unit/migration-to-plaintext.test.ts`
  - [ ] Create `/extension/tests/unit/SecurityInfo.test.tsx`
  - **Status:** 🔴 Not Started

- [ ] **7.3** Update documentation
  - [ ] Update `/SECURITY_ARCHITECTURE.md` (remove encryption, update threat model)
  - [ ] Update `/specifications.md` (remove lock mode section)
  - [ ] Update `/README.md` (remove password protection)
  - [ ] Update `/PRIVACY.md` (update data protection explanation)
  - [ ] Update `/architecture.md` (update storage layer)
  - [ ] Update `/.claude/CLAUDE.md` if needed
  - **Status:** 🔴 Not Started

- [ ] **7.4** Create migration documentation
  - [ ] Create `/docs/MIGRATION_GUIDE.md`
  - [ ] Document user migration steps
  - [ ] Document troubleshooting
  - [ ] Add FAQ section
  - **Status:** 🔴 Not Started

- [ ] **7.5** Clean up styles
  - [ ] Remove lock styles from `/extension/src/popup.css`
  - [ ] Remove lock styles from `/extension/src/options.css`
  - [ ] Add SecurityInfo styles
  - **Status:** 🔴 Not Started

- [ ] **7.6** Clean up localization
  - [ ] Remove lock i18n keys from `/extension/_locales/en/messages.json`
  - [ ] Add SecurityInfo i18n keys
  - **Status:** 🔴 Not Started

- [ ] **7.7** Update CHANGELOG
  - [ ] Document breaking changes in `/CHANGELOG.md`
  - [ ] Add migration instructions
  - [ ] List all removed features
  - **Status:** 🔴 Not Started

### Dependencies
- All phases 1-6 complete

### Success Criteria
- ✓ All lock tests deleted
- ✓ New tests created and passing
- ✓ All documentation updated
- ✓ Migration guide created
- ✓ Styles cleaned up
- ✓ CHANGELOG updated
- ✓ No references to lock feature remain

---

## Final Checklist

### Pre-Release
- [ ] All phases 1-7 complete
- [ ] All tests passing (unit + E2E + integration)
- [ ] Manual testing in Chrome (dev mode)
- [ ] Migration tested with 10+ encrypted datasets
- [ ] Documentation reviewed and approved
- [ ] SecurityInfo component approved by UI-UX
- [ ] No console errors or warnings
- [ ] Performance metrics acceptable
- [ ] Build succeeds without errors

### Release Preparation
- [ ] Version bump: v0.1.x → v0.2.0
- [ ] package.json version updated
- [ ] manifest.json version updated
- [ ] CHANGELOG.md finalized
- [ ] Release notes drafted
- [ ] Migration guide published
- [ ] GitHub release created
- [ ] Tag created: v0.2.0

### Post-Release
- [ ] Chrome Web Store submission
- [ ] Monitor for migration issues
- [ ] Update README with new version
- [ ] Announce on social media
- [ ] Monitor GitHub issues
- [ ] Support email monitoring

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation | Status |
|------|--------|-----------|------------|--------|
| Data loss during migration | CRITICAL | Medium | Backup mechanism, rollback | 🔴 Open |
| Failed migrations block users | HIGH | Medium | Manual recovery, support email | 🔴 Open |
| Performance regression | MEDIUM | Low | Performance testing | 🔴 Open |
| User confusion | MEDIUM | High | Clear docs, migration guide | 🔴 Open |
| Security perception drop | MEDIUM | Medium | SecurityInfo trust-building | 🔴 Open |
| Breaking changes anger users | MEDIUM | Medium | Clear communication, changelog | 🔴 Open |

---

## Notes & Decisions

### 2025-10-19
- Roadmap created
- Decided to keep encryption utilities in KeyManager (may be useful later)
- Decided on auto-migration approach (one-time password prompt)
- SecurityInfo component will be trust-building informational page

### Architecture Decisions
- **Storage:** Single plaintext implementation, no more dual storage
- **Migration:** Auto-detect on startup, block UI until complete
- **Security Tab:** Repurposed as trust-builder, not settings
- **Encryption:** Keep utility functions, remove lock logic
- **Reset:** Move to Advanced tab with confirmation dialog

---

## Session Tracking

### Session 1: 2025-10-19
- Created roadmap
- Status: Ready to begin implementation

### Session 2: [Date]
- [Work completed]
- [Blockers encountered]
- [Next steps]

---

## Contact & Support

- **Lead:** Architecture Subagent
- **Implementation:** Code Implementer Subagent
- **UI Review:** UI-UX Specialist Subagent
- **QA:** QA-Ops Subagent
- **Security Review:** Security-Crypto Specialist Subagent

---

**Last Updated:** 2025-10-19
**Next Review:** After Phase 3 complete
