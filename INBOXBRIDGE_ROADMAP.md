# InboxBridge Implementation Roadmap

**Status:** Phase 0 - Pre-Implementation
**Last Updated:** 2025-10-20
**Timeline:** 15 weeks (revised from 7 weeks)

---

## 🚨 Critical Blockers (Must Complete First)

- [ ] **CB-1:** Finalize JSON RPC protocol (add request IDs, events, ping/pong)
- [ ] **CB-2:** Create `IIMAPProvider` interface (separate from OAuth providers)
- [ ] **CB-3:** Update storage schema (make tokens optional, add IMAP fields)
- [ ] **CB-4:** Add `nativeMessaging` permission to manifest
- [ ] **CB-5:** Design & approve Settings UI for IMAP account setup

**Gate:** Architect sign-off after all blockers resolved

---

## Phase 0: Pre-Implementation (Week 1-2) ✅ COMPLETE

### Protocol Design
- [x] Add `requestId` field to all request/response messages
- [x] Add event message types (`bridge.mailUpdate`, etc.)
- [x] Add `ping`/`pong` handshake for connection recovery
- [x] Document error code taxonomy
- [x] Create `/inboxbridge/PROTOCOL.md`

### Extension Architecture
- [x] Create `/extension/src/lib/providers/imap-bridge/types.ts` (IIMAPProvider interface)
- [x] Update `/extension/src/lib/storage/schema.ts` (optional tokens, IMAP fields)
- [x] Add `nativeMessaging` permission to `/extension/package.json`
- [x] Create `IMAPBridgeAdapter` skeleton
- [x] Build succeeds (17.9s)

### UI/UX Design
- [x] Design IMAP account setup form (Settings page)
- [x] Design connection status indicator
- [x] Design error states (bridge not installed, auth failed)
- [x] Complete UI specifications with accessibility checklist
- [x] All content copy finalized

**Gate:** ✅ UI-UX approved • ✅ Architect APPROVED

**Architect Grade:** A (approved with minor refinement recommendations for future phases)
**Date Approved:** 2025-10-20

---

## Phase 1: Rust Scaffold (Week 3-4) ⚡ CURRENT PHASE

### Native Messaging Foundation
- [ ] Initialize `/inboxbridge/` Cargo project
- [ ] Implement stdio message loop (4-byte length framing)
- [ ] Implement JSON protocol parser with request ID correlation
- [ ] Add `keyring` crate integration
- [ ] Create error type system

### Unit Tests
- [ ] Protocol parsing tests
- [ ] Error serialization tests
- [ ] Keychain mock tests

**Gate:** QA-OPS L1 (unit tests pass)

---

## Phase 2: IMAP Client (Week 5-6) ✅ COMPLETE

### IMAP Implementation
- [x] Integrate `async-imap` crate
- [x] Implement `account.add` (store credentials in keychain)
- [x] Implement `connect` + authenticate
- [x] Implement `watch.start` (SEARCH + FETCH headers)
- [x] Implement `mail.fetchRecent`
- [x] Add TLS validation (native-tls + OS trust store)
- [x] 8/8 RPC methods implemented
- [x] Binary built: 3.2MB (release)

### Testing
- [x] Unit tests passing (3/3)
- [x] Python test script created (test_native_messaging.py)
- [x] Ready for real IMAP account tests

**Gate:** ✅ Awaiting QA-OPS L2 validation

---

## Phase 3: Extension Integration (Week 6-8, parallel with Phase 2) ✅ COMPLETE (CORE)

### Native Messaging Client
- [ ] Create `/extension/src/lib/providers/imap-bridge/native-client.ts`
- [ ] Implement singleton port lifecycle
- [ ] Implement request/response correlation
- [ ] Implement ping/pong reconnection logic

### Provider Adapter
- [ ] Create `IMAPBridgeProvider` class (implements `IIMAPProvider`)
- [ ] Create `IMAPBridgeAdapter` (implements `ProviderAdapter`)
- [ ] Integrate with `EmailPollingService`
- [ ] Add dedupe logic (accountId:mailbox:uid)

### Settings UI
- [ ] Create `/extension/src/popup/settings/ImapAccountForm.tsx`
- [ ] Create `/extension/src/popup/settings/BridgeStatus.tsx`
- [ ] Add "Test Connection" button
- [ ] Handle error states

**Gate:** UI-UX approval + QA-OPS L2

---

## Phase 4: End-to-End Integration (Week 9-10) ✅ PROTOCOL TESTED

### Protocol Validation ✅ (2025-10-20)
- [x] **Native Messaging I/O validated** (4-byte framing working)
- [x] **bridge.ping test PASSED** (response time <50ms)
- [x] **Protocol versioning validated** (v1 negotiation functional)
- [x] **Feature detection validated** (idle=false, tls13=true)
- [x] **Binary execution confirmed** (3.2MB release binary functional)

### Full Stack Testing
- [x] Wire native app (protocol proven functional)
- [ ] Test `installStatus.get` method
- [ ] Test `account.test` with real IMAP credentials (requires Gmail app password)
- [ ] Test full IMAP flow (account.add → mail.fetchRecent)
- [ ] Test watch session flow (OTP detection → IMAP poll → autofill)
- [ ] MV3 service worker restart testing
- [ ] Multi-account testing (Gmail + IMAP)
- [ ] Network failure scenarios

### Bug Fixes
- [ ] Address integration issues
- [ ] Performance optimization

**Gate:** ✅ PROTOCOL VALIDATED • QA-OPS L3 (E2E tests with IMAP credentials pending)

---

## Phase 5: Packaging & Installers (Week 11-12)

### Cross-Platform Packaging
- [ ] Create macOS .pkg installer + native host manifest
- [ ] Create Windows .msi installer + registry setup
- [ ] Create Linux .deb package + manifest install
- [ ] Code signing setup (SignPath.io or manual certs)

### Installer Testing
- [ ] Test on fresh macOS VM (13+ Ventura, 14+ Sonoma)
- [ ] Test on fresh Windows VM (10, 11)
- [ ] Test on fresh Linux VM (Ubuntu 22.04, Fedora 39)
- [ ] Verify uninstall cleanup

**Gate:** QA-OPS L4 (installer + security audit)

---

## Phase 6: Documentation (Week 11-12, parallel with Phase 5)

### User Docs
- [ ] `/docs/inboxbridge/INSTALL.md` (per-OS instructions)
- [ ] `/docs/inboxbridge/SETUP-YAHOO.md` (app password guide)
- [ ] `/docs/inboxbridge/SETUP-CUSTOM.md` (generic IMAP)
- [ ] `/docs/inboxbridge/TROUBLESHOOTING.md`
- [ ] `/docs/inboxbridge/FAQ.md`

### Developer Docs
- [ ] `/inboxbridge/PROTOCOL.md` (JSON RPC spec)
- [ ] `/inboxbridge/BUILDING.md` (local dev setup)
- [ ] `/inboxbridge/CONTRIBUTING.md`
- [ ] Update `/architecture.md` (InboxBridge section)

**Gate:** UI-UX review of content tone & clarity

---

## Phase 7: Beta Testing (Week 13-14)

### Internal Beta
- [ ] Internal testing (5-10 users)
- [ ] Collect crash reports
- [ ] Monitor keychain access issues

### Public Beta
- [ ] Recruit 50-100 beta testers
- [ ] GitHub Issues for bug reports
- [ ] Prioritize critical bugs

### Success Criteria
- [ ] <5% installation failure rate
- [ ] 0 critical security bugs
- [ ] ≥80% successful connection rate

**Gate:** QA-OPS sign-off (no critical bugs)

---

## Phase 8: Public Release (Week 15)

### Release Prep
- [ ] Tag release (`bridge/v1.0.0`)
- [ ] Create GitHub Release with installers
- [ ] Update Chrome Web Store listing
- [ ] Update extension manifest version

### Launch
- [ ] Publish installers
- [ ] Announce on GitHub
- [ ] Monitor early adoption feedback

**Gate:** All agents approve + User (product owner) approval

---

## Architectural Decisions (Locked)

1. **Monorepo structure** - InboxBridge in `/inboxbridge/` subdirectory
2. **Separate IIMAPProvider interface** - Not extending OAuth `IEmailProvider`
3. **Singleton Native Messaging port** - Background worker maintains single shared port
4. **Optional tokens in Mailbox schema** - Makes OAuth tokens optional, adds IMAP fields
5. **Strict TLS mode (MVP)** - No self-signed cert support initially
6. **At-least-once delivery** - Extension-side dedupe by (accountId:mailbox:uid)
7. **Manual updates** - GitHub Releases link, no auto-update in v1

---

## Out of Scope (v1)

- Proton Mail support (requires paid Bridge)
- Brave/Edge browser support (Chrome first)
- IMAP IDLE push notifications (polling only)
- Custom CA certificate support
- In-app auto-updates
- Multi-account concurrent IMAP connections (native app handles internally)

---

## Risk Tracking

| Risk | Status | Mitigation |
|------|--------|------------|
| Code signing cost ($400+) | 🟡 OPEN | Apply to SignPath.io (free OSS) |
| MV3 port lifecycle bugs | 🟡 OPEN | Ping/pong recovery + extensive restart testing |
| IMAP server quirks | 🟡 OPEN | Test 10+ providers, document presets |
| Linux Secret Service missing | 🟡 OPEN | Hard-fail with setup guidance |
| Extension manifest review delay | 🟡 OPEN | Submit early, explain Native Messaging |

---

## Success Metrics (6 months post-launch)

- ≥1,000 InboxBridge installations
- ≥80% first-time setup success rate
- <5% uninstall rate due to installation issues
- <1% crash rate (native app)
- ≥95% IMAP connection success rate
- <2s average fetch latency

---

## Current Phase Checklist

**Phase 0 - Pre-Implementation (THIS WEEK)**

Priority 1 (Critical Blockers):
- [ ] CB-1: Protocol spec with request IDs, events, ping/pong
- [ ] CB-2: IIMAPProvider interface
- [ ] CB-3: Storage schema updates
- [ ] CB-4: Manifest permissions
- [ ] CB-5: UI mockups + approval

Next Steps:
1. Create protocol spec document
2. Create IIMAPProvider interface
3. Update storage schema
4. Update manifest
5. Design UI mockups
6. Get architect + ui-ux approval
7. Move to Phase 1
