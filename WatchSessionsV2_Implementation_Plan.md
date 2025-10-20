# Watch Sessions v2 — Development Roadmap

**Version:** 1.0
**Last Updated:** 2025-10-19
**Source:** InboxKey_Watch_Sessions_v2_Guide.md
**Approved:** Architecture + Codex

---

## Quick Reference

**Scope:** ~1,700 LOC across 7 new files + 13 modified files
**Timeline:** 5 implementation phases
**Current Phase:** Phase 1 (Foundation)
**Feature Flag:** `watchSessionV2Enabled` (default: false initially)

---

## Architecture Summary

```
PRESENTATION LAYER
├── session-chip.ts (NEW - 250 LOC)
├── badge-manager.ts (NEW - 180 LOC)
├── notification.ts (MODIFY)
└── popup.tsx (MODIFY)

APPLICATION SERVICES LAYER
├── session-controller.ts (REFACTOR - 477→400 LOC)
├── session-poller.ts (NEW - 150 LOC)
└── watch-session.ts (MODIFY)

DOMAIN LOGIC LAYER
├── domain-affinity.ts (NEW - 200 LOC)
├── recency-scorer.ts (NEW - 100 LOC)
├── shape-matcher.ts (NEW - 120 LOC)
├── code-matcher.ts (MAJOR REFACTOR - 118→350 LOC)
└── otp-extractor.ts (MODIFY)

INFRASTRUCTURE LAYER
├── scoring-config.ts (NEW - 100 LOC)
├── schema.ts (MODIFY)
├── extraction-types.ts (MODIFY)
├── gmail-parser.ts (MODIFY)
├── outlook-parser.ts (MODIFY)
└── background/index.ts (MODIFY)
```

**Key Architectural Decisions:**
1. **Extract polling logic** → `session-poller.ts` (keeps controller under 400 LOC)
2. **Centralize config** → `scoring-config.ts` (single source for aliases, weights, thresholds)

---

## Implementation Phases

### ✅ Phase 1: Foundation (Weeks 1-2)
**Goal:** Build scoring infrastructure (no user-facing changes)

**Files:**
- [ ] `scoring-config.ts` (100 LOC) — Centralized constants
- [ ] `domain-affinity.ts` (200 LOC) — Affinity algorithm
- [ ] `recency-scorer.ts` (100 LOC) — Time-based boost
- [ ] `shape-matcher.ts` (120 LOC) — Field shape alignment
- [ ] `schema.ts` (modify) — Extend StoredCode interface
- [ ] `extraction-types.ts` (modify) — Import from scoring-config

**Tests:** 42 unit tests
**Validation:** All unit tests pass, no integration changes

---

### ⬜ Phase 2: Matching & Extraction (Weeks 3-4)
**Goal:** Integrate v2 scoring into matcher and extractor

**Files:**
- [ ] `session-poller.ts` (150 LOC) — Polling logic extraction
- [ ] `code-matcher.ts` (MAJOR REFACTOR) — v2 scoring
- [ ] `otp-extractor.ts` (modify) — Apply shape bias
- [ ] `session-controller.ts` (refactor) — Integrate poller, pass sessionStart
- [ ] `gmail-parser.ts` + `outlook-parser.ts` (modify) — Extract senderETLD

**Tests:** 28 unit/integration tests
**Validation:** E2E with real emails, scoring accuracy, performance <50ms extraction

---

### ⬜ Phase 3: UX Components (Week 5)
**Goal:** Add listening chip and badge states

**Files:**
- [ ] `session-chip.ts` (250 LOC) — In-page listening/success/fail chip
- [ ] `badge-manager.ts` (180 LOC) — Extension icon badge states
- [ ] `watch-session.ts` (modify) — Integrate chip/badge callbacks
- [ ] `notification.ts` (modify) — Update toast messages
- [ ] `autofill.ts` (modify) — Trigger UX state updates

**Tests:** ~20 unit tests + manual UX testing
**Validation:** A11y audit, visual regression, keyboard nav

---

### ⬜ Phase 4: Popup & Polish (Week 6)
**Goal:** Expose scoring metadata in popup

**Files:**
- [ ] `popup-cache.ts` (modify) — Include scores
- [ ] `popup.tsx` (modify) — Display sender/score
- [ ] `score-display.tsx` (150 LOC, optional) — Debug UI
- [ ] Feature flag implementation

**Tests:** E2E popup tests
**Validation:** Full E2E regression, performance <200ms popup

---

### ⬜ Phase 5: QA & Validation (Week 7)
**Goal:** Comprehensive testing and validation

**Tasks:**
- [ ] QA-OPS Level 3 validation
- [ ] A11y audit (WCAG 2.1 AA)
- [ ] Security review (if permissions changed)
- [ ] Performance validation (all budgets met)
- [ ] Feature flag testing (v1 fallback works)

**Validation:** All acceptance gates pass

---

## NEW FILES (7 files, ~1,400 LOC)

### 1. `/extension/src/lib/matching/scoring-config.ts` (100 LOC)

**Purpose:** Centralized scoring constants, domain aliases, thresholds

```typescript
// Domain alias mappings
export const DOMAIN_ALIASES: Record<string, string[]> = {
  'dropbox.com': ['dropboxmail.com'],
  'github.com': ['github.github.io', 'githubusercontent.com'],
  'battlestategames.com': ['escapefromtarkov.com', 'tarkov.com'],
  // Expandable
}

// Scoring weights
export const WATCH_SESSION_SCORING = {
  pollTimesMs: [0, 5000, 10000],
  newerThanMinutes: 10,
  domainWeight: 100,
  recencyToPoints: 250,
  sessionToPoints: 100,
  expectedShapeTieBreaker: 8,
  usedPenalty: -50,
  acceptMin: 10,
  recencyDecaySeconds: 120,
  sessionBoostWindow: 15000,
}

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 150,
  MEDIUM: 100,
  LOW: 50,
  MIN: 10,
}
```

**Dependencies:** None
**Used by:** domain-affinity.ts, code-matcher.ts, session-controller.ts, tests

---

### 2. `/extension/src/lib/matching/domain-affinity.ts` (200 LOC)

**Purpose:** DomainAffinity algorithm (spec Section 9.1)

**Exports:**
```typescript
export function domainAffinity(siteETLD: string, senderETLD: string, subject?: string): number
export function extractETLD(domain: string): string
export function isAliasMatch(siteDomain: string, senderDomain: string): boolean
export function tokenOverlap(siteETLD: string, senderETLD: string, subject: string): number
```

**Algorithm:**
1. Exact eTLD+1 match → `1.0`
2. Alias match (via DOMAIN_ALIASES) → `0.9`
3. Token overlap (site token in sender/subject) → `0.6`
4. No match → `0.0`

**Dependencies:** scoring-config.ts
**Tests:** 15 cases (exact, alias, token, edge cases)

---

### 3. `/extension/src/lib/matching/recency-scorer.ts` (100 LOC)

**Purpose:** RecencyBoost and SessionBoost (spec Sections 9.2, 9.3)

**Exports:**
```typescript
export function recencyBoost(ageSeconds: number): number
export function sessionBoost(receivedAt: number, sessionStart: number): number
```

**Algorithm:**
- **RecencyBoost:** `0.20 * exp(-ageSeconds / 120)` (0s: +0.20, 120s: +0.07, 300s: +0.01)
- **SessionBoost:** `receivedAt >= (sessionStart - 15000) ? 0.15 : 0` (±15s window)

**Dependencies:** None
**Tests:** 8 cases (decay curve, session window)

---

### 4. `/extension/src/lib/matching/shape-matcher.ts` (120 LOC)

**Purpose:** Expected Shape Bias scoring (spec Section 9.4)

**Exports:**
```typescript
export interface ExpectedShape {
  len?: number
  charset?: 'digits' | 'alnum'
}

export function shapeScore(code: string, expected: ExpectedShape): number
```

**Algorithm:**
- Length: exact (+0.20), ±1 (+0.06), outside (-0.12)
- Charset: match (+0.08)

**Dependencies:** None
**Tests:** 12 cases (length/charset combinations)

---

### 5. `/extension/src/background/session-poller.ts` (150 LOC)

**Purpose:** Polling logic extraction (keep controller lean)

**Exports:**
```typescript
export interface PollingSchedule {
  sessionId: string
  pollTimes: number[]
  startedAt: number
}

export class SessionPoller {
  schedulePolls(sessionId: string, startedAt: number): void
  cancelPolls(sessionId: string): void
  private onAlarm(alarm: chrome.alarms.Alarm): Promise<void>
  initialize(): Promise<void>
}
```

**Why separate:** Keeps session-controller.ts focused on business logic, easier testing

**Dependencies:** None (Chrome APIs)
**Tests:** 6 cases (alarm scheduling, restart recovery)

---

### 6. `/extension/src/contents/session-chip.ts` (250 LOC)

**Purpose:** In-page chip showing watch session states

**States:** listening | filled | copied | timeout
**Features:** Keyboard dismiss (Esc), ARIA live, reduced motion, auto-dismiss (5s)

**Exports:**
```typescript
export interface ChipHandle {
  update(state: ChipState): void
  hide(): void
}

export function showSessionChip(field: HTMLInputElement): ChipHandle
export function updateChipState(handle: ChipHandle, state: ChipState): void
export function hideChip(handle: ChipHandle): void
```

**Dependencies:** None (vanilla DOM)
**Tests:** 10 cases (rendering, state transitions, a11y)

---

### 7. `/extension/src/contents/badge-manager.ts` (180 LOC)

**Purpose:** Extension icon badge state management

**States:** idle | listening (animated) | success (✓) | no code (!)

**Exports:**
```typescript
export function setBadgeListening(): void
export function setBadgeSuccess(): void
export function setBadgeNoCode(): void
export function clearBadge(): void
```

**Implementation:** Uses chrome.action API, listening animation 400ms cycle

**Dependencies:** None (Chrome API)
**Tests:** 8 cases (state transitions, animation)

---

## MODIFIED FILES (13 files, ~400 LOC changes)

### 1. `code-matcher.ts` (118 → 350 LOC) — **MAJOR REFACTOR**

**Changes:**
1. Replace `domainsMatch()` with `domainAffinity()`
2. Replace `calculateRecencyScore()` with `recencyBoost()` + `sessionBoost()`
3. Add `shapeScore()` call
4. Update points-based scoring:
   ```typescript
   const points =
     affinity * 100 +
     Math.round(recency * 250) +
     Math.round(session * 100) +
     (shape > 0 ? 8 : 0) +
     (code.used ? -50 : 0)

   if (points >= 10) accept(code)
   ```
5. Update signature:
   ```typescript
   export function findBestMatchingCode(
     codes: StoredCode[],
     pageUrl: string,
     timestamp: number,
     sessionStart?: number,        // NEW
     expectedShape?: ExpectedShape  // NEW
   ): StoredCode | null
   ```

**Dependencies:** domain-affinity.ts, recency-scorer.ts, shape-matcher.ts, scoring-config.ts
**Tests:** 10 new v2 scenarios + existing v1 tests maintained

---

### 2. `otp-extractor.ts` (442 → 480 LOC) — **MODIFY**

**Changes:**
1. Accept `expectedShape?: ExpectedShape` in `OTPExtractOptions`
2. Apply shape bias in `baseScore()`:
   ```typescript
   let score = 50
   if (expectedShape) {
     score += shapeScore(candidate, expectedShape) * 100
   }
   ```

**Dependencies:** shape-matcher.ts
**Tests:** 4 new cases (shape bias application)

---

### 3. `session-controller.ts` (477 → 400 LOC) — **REFACTOR**

**Changes:**
1. Extract polling logic to session-poller.ts (~100 LOC reduction)
2. Add `sessionStart` field to `SessionState`:
   ```typescript
   interface SessionState {
     id: string
     url: string
     siteETLD: string
     expectedShape?: ExpectedShape
     sessionStart: number  // NEW
     startedAt: number
   }
   ```
3. Pass sessionStart to matcher:
   ```typescript
   const bestMatch = findBestMatchingCode(
     candidates,
     session.url,
     Date.now(),
     session.sessionStart,    // NEW
     session.expectedShape    // NEW
   )
   ```
4. Store senderETLD:
   ```typescript
   await storage.addCode({
     ...extractedCode,
     senderETLD: extractETLD(email.from),
     receivedAt: email.timestamp
   })
   ```
5. Delegate polling: `this.poller.schedulePolls(sessionId, Date.now())`

**Dependencies:** session-poller.ts, code-matcher.ts (updated), scoring-config.ts
**Tests:** 6 new cases (sessionStart tracking, poller delegation)

---

### 4. `watch-session.ts` (357 → 380 LOC) — **MODIFY**

**Changes:**
1. Derive expectedShape from field:
   ```typescript
   function deriveExpectedShape(field: HTMLInputElement): ExpectedShape {
     return {
       len: field.maxLength > 0 && field.maxLength < 20 ? field.maxLength : undefined,
       charset: field.inputMode === 'numeric' ? 'digits' :
                field.pattern?.includes('[0-9]') ? 'digits' : 'alnum'
     }
   }
   ```
2. Add state callbacks:
   ```typescript
   onListening() {
     this.chipHandle = showSessionChip(this.field)
     setBadgeListening()
   }
   onFilled() {
     updateChipState(this.chipHandle, 'filled')
     setBadgeSuccess()
   }
   onNoCode() {
     updateChipState(this.chipHandle, 'timeout')
     setBadgeNoCode()
   }
   ```
3. Send expectedShape in START_SESSION

**Dependencies:** session-chip.ts, badge-manager.ts
**Tests:** 3 new cases (state transitions)

---

### 5. `notification.ts` (149 → 180 LOC) — **MODIFY**

**Changes:**
1. Update toast messages:
   - "Code copied—paste into the field."
   - "No new code for {site}. Try resend or open the popup."
2. Ensure ARIA live regions

**Dependencies:** None
**Tests:** Manual a11y testing

---

### 6. `autofill.ts` (170 → 190 LOC) — **MODIFY**

**Changes:**
1. Emit 'autofill:success' on fill
2. Emit 'autofill:fallback:clipboard' on readonly

**Dependencies:** watch-session.ts (event listener)
**Tests:** 2 new cases (state callbacks)

---

### 7. `schema.ts` (244 → 270 LOC) — **MODIFY**

**Changes:**
```typescript
export interface StoredCode {
  // ... existing fields
  senderETLD?: string        // NEW
  receivedAt?: number        // NEW
  domainAffinity?: number    // NEW (optional, for popup)
}
```

**Dependencies:** None
**Tests:** Update storage tests (backward compat verified)

---

### 8. `extraction-types.ts` (545 → 600 LOC) — **MODIFY**

**Changes:**
1. Remove duplicate DOMAIN_ALIASES
2. Import from scoring-config:
   ```typescript
   export { DOMAIN_ALIASES, WATCH_SESSION_SCORING } from '../matching/scoring-config'
   ```

**Dependencies:** scoring-config.ts
**Tests:** Verify imports (no functional change)

---

### 9. `gmail-parser.ts` + `outlook-parser.ts` — **MODIFY**

**Changes:**
```typescript
import { extractETLD } from '../../matching/domain-affinity'

return {
  from: sender,
  senderETLD: extractETLD(sender),  // NEW
  receivedAt: timestamp,             // Ensure present
  // ... other fields
}
```

**Dependencies:** domain-affinity.ts
**Tests:** 5 cases (varied sender formats)

---

### 10. `popup-cache.ts` (~250 → 280 LOC) — **MODIFY**

**Changes:**
```typescript
interface CachedCode extends StoredCode {
  domainAffinity?: number
  recencyScore?: number
  sessionBoost?: number
  totalScore?: number
}
```

**Dependencies:** code-matcher.ts, scoring-config.ts
**Tests:** Cache serialization

---

### 11. `popup.tsx` (~300 → 350 LOC) — **MODIFY**

**Changes:**
1. Display sender domain: `<div>From: {code.senderETLD}</div>`
2. Show score (debug flag): `{settings.debugScoringEnabled && <ScoreDisplay code={code} />}`
3. Update empty state: "No recent codes for {site}. Resend or check mailbox."

**Dependencies:** popup-cache.ts, score-display.tsx (optional)
**Tests:** E2E popup tests

---

### 12. `background/index.ts` — **MODIFY**

**Changes:**
1. Initialize badge on startup: `clearBadge()`
2. Register alarm listener:
   ```typescript
   chrome.alarms.onAlarm.addListener((alarm) => {
     if (alarm.name.startsWith('session-poll-')) {
       sessionPoller.handleAlarm(alarm)
     }
   })
   ```

**Dependencies:** badge-manager.ts, session-poller.ts
**Tests:** Integration tests

---

### 13. `score-display.tsx` (150 LOC) — **NEW** (Optional)

**Purpose:** Debug UI for scoring breakdown

```typescript
interface ScoreDisplayProps {
  code: StoredCode & {
    domainAffinity?: number
    recencyScore?: number
    sessionBoost?: number
    totalScore?: number
  }
}
```

**Feature:** Behind `settings.debugScoringEnabled` flag

**Dependencies:** React, popup-cache.ts
**Tests:** Manual visual

---

## Task Checklist by Phase

### Phase 1: Foundation

**Tasks (10):**
- [ ] Task 1.1: Create `scoring-config.ts` (2h, P0)
- [ ] Task 1.2: Create `domain-affinity.ts` (4h, P0)
- [ ] Task 1.3: Write tests for `domain-affinity.ts` (3h, P0)
- [ ] Task 1.4: Create `recency-scorer.ts` (2h, P0)
- [ ] Task 1.5: Write tests for `recency-scorer.ts` (2h, P0)
- [ ] Task 1.6: Create `shape-matcher.ts` (3h, P0)
- [ ] Task 1.7: Write tests for `shape-matcher.ts` (2h, P0)
- [ ] Task 1.8: Modify `schema.ts` (1h, P0)
- [ ] Task 1.9: Update storage tests (1h, P0)
- [ ] Task 1.10: Modify `extraction-types.ts` (30m, P0)

**Acceptance:** All unit tests pass (42 tests), no integration changes

---

### Phase 2: Matching & Extraction

**Tasks (10):**
- [ ] Task 2.1: Create `session-poller.ts` (4h, P0)
- [ ] Task 2.2: Write tests for `session-poller.ts` (3h, P0)
- [ ] Task 2.3: Refactor `code-matcher.ts` (8h, P0 — CRITICAL PATH)
- [ ] Task 2.4: Write tests for `code-matcher.ts` v2 (4h, P0)
- [ ] Task 2.5: Modify `otp-extractor.ts` (2h, P1)
- [ ] Task 2.6: Write tests for `otp-extractor.ts` (2h, P1)
- [ ] Task 2.7: Modify `session-controller.ts` (6h, P0 — CRITICAL PATH)
- [ ] Task 2.8: Write tests for `session-controller.ts` (3h, P0)
- [ ] Task 2.9: Modify provider parsers (2h, P1)
- [ ] Task 2.10: Write tests for provider parsers (2h, P1)

**Acceptance:** E2E scoring pipeline works, performance <50ms extraction, <7ms matching

---

### Phase 3: UX Components

**Tasks (8):**
- [ ] Task 3.1: Create `session-chip.ts` (6h, P1)
- [ ] Task 3.2: Write tests for `session-chip.ts` (3h, P1)
- [ ] Task 3.3: Create `badge-manager.ts` (4h, P1)
- [ ] Task 3.4: Write tests for `badge-manager.ts` (2h, P1)
- [ ] Task 3.5: Modify `watch-session.ts` (3h, P1)
- [ ] Task 3.6: Modify `notification.ts` (1h, P2)
- [ ] Task 3.7: Modify `autofill.ts` (1h, P1)
- [ ] Task 3.8: Manual UX testing (4h, P1)

**Acceptance:** All UX states work, a11y compliant (keyboard, ARIA, reduced motion)

---

### Phase 4: Popup & Polish

**Tasks (6):**
- [ ] Task 4.1: Modify `popup-cache.ts` (2h, P2)
- [ ] Task 4.2: Modify `popup.tsx` (3h, P2)
- [ ] Task 4.3: Create `score-display.tsx` (3h, P3 — optional)
- [ ] Task 4.4: Feature flag implementation (2h, P0)
- [ ] Task 4.5: Update documentation (4h, P2)
- [ ] Task 4.6: Full E2E regression (6h, P0)

**Acceptance:** Full E2E pass, popup <200ms, feature flag works

---

### Phase 5: QA & Validation

**Tasks (5):**
- [ ] Task 5.1: QA-OPS Level 3 validation (8h, P0)
- [ ] Task 5.2: Accessibility audit (4h, P0)
- [ ] Task 5.3: Security review (2h, P1 — if needed)
- [ ] Task 5.4: Performance validation (3h, P0)
- [ ] Task 5.5: Feature flag testing (2h, P0)

**Acceptance:** All acceptance gates pass

---

## Testing Requirements

### Unit Tests (80+ tests)

**New test files (6):**
1. `domain-affinity.test.ts` — 15 cases (exact, alias, token, edge cases)
2. `recency-scorer.test.ts` — 8 cases (decay curve, session window)
3. `shape-matcher.test.ts` — 12 cases (length/charset combinations)
4. `session-chip.test.ts` — 10 cases (rendering, state transitions, a11y)
5. `badge-manager.test.ts` — 8 cases (badge states, animation)
6. `session-poller.test.ts` — 6 cases (alarm scheduling, restart)

**Updated test files (4):**
1. `code-matcher.test.ts` — 10 new v2 scenarios
2. `otp-extractor.test.ts` — 4 shape bias cases
3. `session-controller.test.ts` — 6 sessionStart/poller cases
4. `watch-session.test.ts` — 3 state callback cases

---

### Integration Tests (8 tests)

1. End-to-end scoring pipeline
2. Session restart mid-poll
3. Multi-account disambiguation
4. Polling delegation (controller → poller)
5. Provider eTLD extraction
6. Storage backward compatibility
7. Feature flag toggle
8. v1 fallback works

---

### E2E Tests (12 tests)

1. Happy path with UX states (detect → listen → fill → success)
2. Readonly fallback (clipboard + toast)
3. Timeout (15s, badge !, toast)
4. Domain affinity (exact match preferred)
5. Alias match (dropboxmail.com accepted)
6. Token overlap (unknown sender, token in subject)
7. Restart mid-session (recovery works)
8. Gmail provider E2E
9. Outlook provider E2E
10. Multi-account scenario
11. Rapid detection (multiple fields)
12. Keyboard navigation (Esc dismiss)

---

## Acceptance Criteria (Technical)

### Functional Requirements

✅ **Scoring algorithms work correctly:**
- DomainAffinity: exact (1.0), alias (0.9), token (0.6), none (0.0)
- RecencyBoost: 0s (+0.20), 120s (+0.07), 300s (+0.01)
- SessionBoost: ±15s window (+0.15)
- Shape Bias: exact (+0.28), ±1 (+0.14), outside (-0.12)
- Points formula matches spec Section 9.5
- acceptMin threshold enforced (10 points)

✅ **UX states work:**
- Listening chip shows on session start
- Filled chip shows on autofill success
- Copied toast shows on clipboard fallback
- Timeout chip shows after 15s
- Badge animates (listening), shows ✓ (success), ! (timeout)

✅ **Polling delegation works:**
- session-poller schedules alarms (0/5/10s)
- session-controller executes poll logic
- Restart recovery works

✅ **Provider parsers extract senderETLD:**
- Gmail parser works (name+email, email only, subdomains)
- Outlook parser works (same cases)

---

### Non-Functional Requirements

✅ **Performance:**
- Field detection: <1ms (Tier 1), <50ms (Tier 2)
- Extraction per email: <50ms
- Matching per candidate: <10ms
- Popup open: ≤200ms

✅ **Accessibility:**
- Keyboard navigation (Esc dismisses chip)
- ARIA live regions (announce states)
- Screen reader friendly (NVDA, VoiceOver)
- Reduced motion respected
- AA+ color contrast

✅ **Privacy:**
- No external network calls
- All processing local
- Token storage unchanged (AES-256-GCM)
- No new permissions

✅ **Maintainability:**
- All files under ~400 LOC (code-matcher at 350)
- Clear separation of concerns (layers maintained)
- Comprehensive inline comments
- Test coverage ≥90%

✅ **MV3 Compliance:**
- Session storage for restart resilience
- Dual timer strategy (setTimeout + chrome.alarms)
- Port keepalive for content script connection

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Domain alias table incomplete** | MEDIUM | Token overlap fallback (0.6 affinity); iterative expansion |
| **RecencyBoost tuning off** | LOW | Conservative 120s decay; make configurable |
| **session-controller.ts complexity** | LOW | Extract session-poller.ts; future: extract matcher if needed |
| **Performance regression (+7ms)** | LOW | Pre-compute eTLD, cache alias lookups; fail build if >10% |
| **UX state sync issues** | MEDIUM | Defensive programming (clear before set), timeout guards |
| **Shape bias false negatives** | MEDIUM | Mild penalty (-0.12), domain+recency dominate |
| **SessionBoost window edge cases** | LOW | Persist sessionStart in storage, ±15s generous |
| **Backward compatibility break** | HIGH | Feature flag gates v2; v1 matcher preserved |

**Contingency Plans:**

**If precision degrades:**
1. Reduce recencyToPoints from 250 to 150
2. Increase acceptMin from 10 to 20
3. Disable SessionBoost temporarily
4. Rollback via feature flag

**If performance regresses >10%:**
1. Profile hot paths (affinity, recency)
2. Add memoization (eTLD extraction, alias lookups)
3. Reduce scoring granularity (integer math)
4. Defer popup score calculation

**If session-controller.ts still too complex:**
1. Extract session-matcher.ts (scoring logic)
2. Extract session-storage-adapter.ts (persistence)
3. Keep controller as pure orchestration (~250 LOC)

---

## Algorithm Reference (Pseudocode)

### DomainAffinity (spec Section 9.1)

```typescript
export function domainAffinity(siteETLD: string, senderETLD: string, subject?: string): number {
  // 1. Exact match
  if (siteETLD === senderETLD) return 1.0

  // 2. Alias match
  const aliases = DOMAIN_ALIASES[siteETLD] || []
  if (aliases.includes(senderETLD)) return 0.9

  // 3. Token overlap
  const siteTokens = tokenize(siteETLD.split('.').slice(0, -1).join('.'))
  const senderTokens = tokenize(senderETLD)
  const subjectTokens = tokenize(subject || '')
  const combinedTokens = new Set([...senderTokens, ...subjectTokens])
  const overlap = siteTokens.filter(t => combinedTokens.has(t)).length

  if (overlap >= 1) return 0.6

  // 4. No match
  return 0.0
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}
```

---

### RecencyBoost (spec Section 9.2)

```typescript
export function recencyBoost(ageSeconds: number): number {
  return 0.20 * Math.exp(-ageSeconds / 120)
}
```

**Decay curve:** 0s: 0.20 | 60s: 0.12 | 120s: 0.07 | 300s: 0.01

---

### SessionBoost (spec Section 9.3)

```typescript
export function sessionBoost(receivedAt: number, sessionStart: number): number {
  return receivedAt >= (sessionStart - 15000) ? 0.15 : 0
}
```

**Window:** ±15s from session start

---

### Points-Based Scoring (spec Section 9.5)

```typescript
const affinity = domainAffinity(siteETLD, code.senderETLD, code.subject)
const recency = recencyBoost(ageSeconds)
const session = sessionBoost(code.receivedAt, sessionStart)
const shape = shapeScore(code.code, expectedShape)

const points =
  affinity * 100 +                   // 0-100 points
  Math.round(recency * 250) +        // 0-50 points
  Math.round(session * 100) +        // 0 or 15 points
  (shape > 0 ? 8 : 0) +             // 0 or 8 points
  (code.used ? -50 : 0)             // -50 penalty

if (points >= 10) {
  accept(code)
}
```

---

## Feature Flag Configuration

```typescript
// In settings schema
export interface Settings {
  // ... existing fields
  watchSessionV2Enabled: boolean    // Default: false (RC1), true (v2.0+)
  debugScoringEnabled: boolean      // Default: false
}
```

**Gating:**
- `code-matcher.ts`: Check flag before using v2 logic
- Fallback to v1 matcher if flag OFF
- Debug UI only renders if `debugScoringEnabled === true`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-19 | Initial development roadmap |

---

**End of Development Roadmap**
