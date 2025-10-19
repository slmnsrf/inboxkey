# InboxKey - Product Roadmap

**Status:** Phase 8 Complete → Phase 9 Next (A11y & i18n)
**Progress:** 72/94 MVP tasks (76.6%)
**Target MVP:** 4.5-6 months
**Last Updated:** 2025-10-18

---

## Project Overview

**InboxKey** is a privacy-first Chrome extension that auto-fills email verification codes and opens magic login links. All processing happens locally with encrypted storage and optional password protection.

### Core Value Proposition
- **Auto-fill codes** from Gmail/Outlook within 15 seconds
- **Open magic links** automatically with security safeguards
- **Local-only processing** - no servers, no data exfiltration
- **Lock mode** with password protection and zero recovery

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Service Worker** | Content-script-orchestrator | Content scripts manage timers, background wakes on-demand |
| **Encryption** | AES-GCM via WebCrypto | No dependencies, native performance |
| **OAuth** | Chrome Identity API (Gmail), PKCE (Outlook) | Lazy refresh with 5-min buffer + mutex |
| **Detection** | Two-tier (fast → deep) | <1ms fast path, <50ms deep scan |
| **Storage** | chrome.storage.local + session | Encrypted tokens, ephemeral state |

### Risk Mitigation
- 🔴 **Service worker lifecycle** → Keep-alive Port during 15s watch
- 🟠 **Detection accuracy** → 90%+ on 54 test sites (achieved)
- 🟡 **Token refresh** → Mutex + 5-min buffer (implemented)

---

## Current Status

### Completed (Phases 0-8)
- ✅ **Phase 0-1:** Foundation (crypto, storage, architecture validation)
- ✅ **Phase 2:** Detection & autofill engine (90% accuracy, 353 tests)
- ✅ **Phase 3:** Session controller with SW resilience
- ✅ **Phase 4:** Gmail OAuth + email provider adapter
- ✅ **Phase 5:** Popup UI with manual actions
- ✅ **Phase 6:** Magic link extraction & security
- ✅ **Phase 7:** Outlook provider (179 tests)
- ✅ **Phase 8:** Lock mode UI/UX (170 tests)

### Test Coverage
- **Total tests:** 1,200+ (unit, integration, E2E)
- **Pass rate:** 90%+ across all phases
- **Fixtures:** 54 HTML sites, 109 email samples
- **Performance:** <1ms Tier 1 detection, <50ms Tier 2

---

## Phase 9: Accessibility & i18n (NEXT)

**Goal:** WCAG AA compliance + multi-language support
**Status:** 0/4 tasks
**Estimated:** 1 week

### Tasks

#### 1. Keyboard & Focus (WP-9.1)
- Visible focus rings on all interactive elements
- Tab order validation (Popup, Settings, Wizard)
- Modal focus-trap with Esc key support
- **Exit:** Keyboard-only navigation works, 0 critical axe violations

#### 2. ARIA & Semantics (WP-9.2)
- ARIA labels on all actions (Copy, Open, Lock)
- ARIA live regions for toasts
- Semantic HTML validation
- **Exit:** Screen reader accurately announces all states

#### 3. Contrast & Motion (WP-9.3)
- WCAG AA contrast ratios (4.5:1 text, 3:1 large text)
- `prefers-reduced-motion` support
- Reduce animations to fades when motion disabled
- **Exit:** All contrast checks pass, motion preference respected

#### 4. i18n Scaffolding (WP-9.4)
- Externalize all UI strings to `locales/en.json`
- Setup i18n file structure
- Pseudo-locale testing (accented/expanded chars)
- **Exit:** English strings in locale files, pseudo-locale renders correctly

---

## Phase 10: Hardening & Launch Prep (FINAL MVP)

**Goal:** Production-ready extension
**Status:** 0/13 tasks
**Estimated:** 2 weeks

### Critical Tasks

**Performance (WP-10.1)**
- Popup P95 < 200ms
- Code-split settings page
- Performance CI harness

**UI Polish (WP-10.2)**
- Toast confirmations for actions
- Skeleton loaders
- Empty state messaging

**Trust & Transparency (WP-10.3)**
- About section: open-source badge, license
- "Local-only" privacy badge
- Support development button (non-intrusive)

**Security (WP-10.4)**
- "No recovery" warning in password setup
- Danger zone UI for reset
- Confirmation modals for destructive actions

**Per-Site Controls (WP-10.5)**
- Domain override UI (Auto-fill/Prompt/Off)
- CRUD for site preferences
- chrome.storage.sync for cross-device

**Error Handling (WP-10.6)**
- Token expired → "Reconnect" banner
- Offline → "Cached data" info
- Dismissible error banners

**Final Audit (WP-10.7)**
- Complete axe DevTools audit
- Keyboard & screen reader testing
- Fix all critical/serious violations

**Launch Prep**
- Domain allow/deny lists
- API rate limit handling
- Security audit (CSP, token leak review)
- Documentation (README, PRIVACY, SECURITY)
- Store listing materials
- OAuth app verification submission

**Exit Criteria:**
- 0 critical accessibility violations
- Performance benchmarks met
- All error states handled
- Documentation complete
- Store submission ready

---

## Post-MVP (Phases 11-12)

### Phase 11: Mailboxes UI (Future)
**Timeline:** +1 week after MVP launch
**Scope:** Read-only unified inbox viewer with filters

### Phase 12: InboxBridge (IMAP) (Future)
**Timeline:** +2-3 weeks, 6-12 months post-launch
**Scope:** Native messaging bridge for IMAP (Yahoo, ProtonMail, etc.)
**See:** `INBOXBRIDGE_SPEC.md` for full specification

---

## Progress Metrics

### MVP Phases (0-10)
| Phase | Status | Tasks | Progress |
|-------|--------|-------|----------|
| 0: Bootstrap | ✅ | 12/14 | 86% |
| 1: Crypto & Storage | ✅ | 9/9 | 100% |
| 2: Detection & Autofill | ✅ | 14/14 | 100% |
| 3: Session Controller | ✅ | 7/7 | 100% |
| 4: Gmail OAuth | ✅ | 9/9 | 100% |
| 5: Popup Actions | ✅ | 4/4 | 100% |
| 6: Magic Links | ✅ | 4/4 | 100% |
| 7: Outlook | ✅ | 5/5 | 100% |
| 8: Lock Mode | ✅ | 6/6 | 100% |
| **9: A11y & i18n** | ⏸️ **NEXT** | 0/4 | 0% |
| **10: Hardening** | ⏸️ | 0/13 | 0% |

### Overall
- **MVP:** 72/94 tasks (76.6% complete)
- **Post-MVP:** 0/14 tasks
- **Total:** 72/108 tasks (66.7% complete)

---

## MVP Definition of Done

### Functional
- [ ] User connects Gmail/Outlook via OAuth
- [ ] 90%+ detection rate on popular sites ✅ (achieved on 54 sites)
- [ ] Auto-fill within 15s, 95%+ success rate
- [ ] Manual copy/paste via popup ✅
- [ ] Lock mode with password protection ✅
- [ ] Works offline with cached codes

### Non-Functional
- [ ] Zero security vulnerabilities (OWASP Top 10)
- [ ] <5MB memory per tab
- [ ] <100ms detection latency ✅ (<1ms Tier 1, <50ms Tier 2)
- [ ] 80%+ code coverage ✅ (90%+ achieved)
- [ ] Passes Chrome Web Store review

### User Experience
- [ ] Zero-config first run for Gmail
- [ ] No false positives ✅ (0% in testing)
- [ ] Clear visual feedback ✅
- [ ] Discoverable settings ✅

---

## Launch Checklist

### Pre-Launch (Phase 10)
- [ ] Security audit
- [ ] Performance benchmarks
- [ ] Documentation complete
- [ ] Store listing ready
- [ ] OAuth verification submitted

### Beta Testing
- [ ] 100 private beta users
- [ ] Daily bug reports collected
- [ ] Critical issues resolved

### Public Launch
- [ ] Chrome Web Store approval
- [ ] Marketing materials
- [ ] Support channels established
- [ ] Analytics configured

---

## Next Steps (Immediate)

1. **Start Phase 9:** Accessibility & i18n
   - Begin with keyboard navigation audit
   - Run axe DevTools on all UI components
   - Fix critical violations first

2. **Parallel Work:**
   - Review Phase 10 requirements
   - Begin documentation drafts
   - Prepare store listing materials

3. **Testing:**
   - Manual accessibility testing with NVDA/VoiceOver
   - Keyboard-only navigation validation
   - Contrast ratio verification

---

## Key Documents

**Core:**
- `specifications.md` - Product requirements
- `ROADMAP.md` - This file
- `SECURITY.md` - Threat model
- `TESTING_STRATEGY.md` - Test approach

**Post-MVP:**
- `INBOXBRIDGE_SPEC.md` - IMAP technical spec
- `/docs/ui-ux/` - Design system & components

**Architecture:**
- `/docs/architecture/` - ADRs
- `new-ui-ux-implementation.md` - Detailed UI/UX work packages

---

## Quick Reference

### Technology Stack
- **Framework:** Plasmo (Chrome Extension)
- **Language:** TypeScript
- **Testing:** Vitest (unit), MSW (integration), Playwright (E2E)
- **UI:** React + Tailwind-inspired styling
- **Crypto:** WebCrypto API (AES-GCM, PBKDF2)

### Critical Paths
- **Detection:** `content/otpDetector.ts` → `background/sessionController.ts`
- **Auth:** `background/auth/gmailAuth.ts` + `outlookAuth.ts`
- **Extraction:** `background/otpExtractor.ts` + `linkExtractor.ts`
- **Security:** `shared/crypto.ts` + `shared/keyManager.ts`

### Performance Targets
- Popup load: <200ms (P95)
- Detection: <100ms (Tier 1+2 combined)
- Memory: <30MB per tab
- Storage: <5MB encrypted data

---

**Project Started:** 2025-10-15
**MVP Target:** Q2 2025
**Current Milestone:** Phase 9 (Accessibility)
