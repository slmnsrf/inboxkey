# WatchSessionsV2 — Execution Strategy
**Version:** 1.0
**Created:** 2025-10-19
**Role:** architect
**Source:** WatchSessionsV2_Implementation_Plan.md

---

## Executive Summary

**Total Tasks:** 39 tasks across 5 phases
**Critical Path Duration:** ~47 hours (serial execution)
**Optimized Duration:** ~28-32 hours (with parallelization)
**Maximum Parallelization:** Up to 6 concurrent tracks in Phase 1
**High-Risk Files:** `code-matcher.ts`, `session-controller.ts`

**Key Finding:** Aggressive parallelization in Phase 1-3 can reduce timeline by ~40%. Critical bottlenecks are the two major refactors in Phase 2.

---

## 1. Task Dependency Graph

### Phase 1: Foundation (10 tasks)

```
INDEPENDENT TRACK (can start immediately):
├─ T1.1: scoring-config.ts (2h) ───┬──> T1.10: extraction-types.ts (30m)
│                                  │
│                                  └──> T1.2: domain-affinity.ts (4h) ──> T1.3: Tests (3h)
│
├─ T1.4: recency-scorer.ts (2h) ──────> T1.5: Tests (2h)
│
├─ T1.6: shape-matcher.ts (3h) ────────> T1.7: Tests (2h)
│
└─ T1.8: schema.ts (1h) ───────────────> T1.9: storage tests (1h)

DEPENDENCIES:
- T1.2 depends on T1.1 (needs DOMAIN_ALIASES)
- T1.10 depends on T1.1 (imports from scoring-config)
- All tests depend on their respective implementations
- NO cross-dependencies between scorer modules
```

**Parallelization Opportunity:** 6 concurrent tracks
1. Track A: T1.1 → T1.2 → T1.3
2. Track B: T1.1 → T1.10
3. Track C: T1.4 → T1.5
4. Track D: T1.6 → T1.7
5. Track E: T1.8 → T1.9
6. Tests can run in parallel after implementations complete

**Timeline:** Serial = 20.5h | Parallel = ~7h (4h longest chain: T1.2 + T1.3)

---

### Phase 2: Matching & Extraction (10 tasks)

```
BLOCKS: ALL Phase 1 tasks must complete first

TRACK 1 (CRITICAL PATH):
Phase 1 complete ──> T2.3: code-matcher.ts refactor (8h) ──> T2.4: Tests (4h)
                                    │
                                    └──> T2.7: session-controller.ts (6h) ──> T2.8: Tests (3h)

TRACK 2 (PARALLEL):
Phase 1 complete ──> T2.1: session-poller.ts (4h) ──> T2.2: Tests (3h)
                                    │
                                    └──> T2.7 (depends on this too)

TRACK 3 (PARALLEL):
T1.6 complete ──> T2.5: otp-extractor.ts (2h) ──> T2.6: Tests (2h)

TRACK 4 (PARALLEL):
T1.2 complete ──> T2.9: provider parsers (2h) ──> T2.10: Tests (2h)

DEPENDENCIES:
- T2.3 blocks T2.7 (session-controller needs updated matcher)
- T2.1 blocks T2.7 (session-controller needs poller)
- T2.5 depends on T1.6 (shape-matcher.ts)
- T2.9 depends on T1.2 (domain-affinity.ts)

CRITICAL COLLISION RISK:
- T2.3 and T2.7 MUST be sequential (both modify core matching logic)
- T2.7 integrates T2.1, so T2.1 must complete first
```

**Parallelization Strategy:**
- Start T2.1, T2.5, T2.9 immediately after Phase 1
- Start T2.3 after T2.1 completes (avoid integration conflicts)
- Start T2.7 only after T2.3 AND T2.1 complete
- Tests can run in parallel

**Timeline:** Serial = 36h | Parallel = ~21h (critical path: T2.1→T2.3→T2.4→T2.7→T2.8)

---

### Phase 3: UX Components (8 tasks)

```
BLOCKS: Phase 2 completion NOT required (independent UI layer)

TRACK 1 (UI Components - can start after Phase 1):
Independent ──> T3.1: session-chip.ts (6h) ──> T3.2: Tests (3h)
                                    │
                                    └──> T3.5: watch-session.ts (3h) ──> T3.7: autofill.ts (1h)

TRACK 2 (Badge - parallel):
Independent ──> T3.3: badge-manager.ts (4h) ──> T3.4: Tests (2h)
                                    │
                                    └──> T3.5 (depends on this too)

TRACK 3 (Notifications - parallel):
Independent ──> T3.6: notification.ts (1h)

TRACK 4 (Testing - final):
T3.5, T3.7 complete ──> T3.8: Manual UX testing (4h)

DEPENDENCIES:
- T3.5 depends on T3.1 and T3.3 (integrates chip + badge)
- T3.7 depends on T3.5 (triggers state updates)
- T3.8 depends on all UX components
- T3.6 is independent (can run anytime)

EARLY START OPPORTUNITY:
- Can start T3.1, T3.3, T3.6 during Phase 2 (no dependencies)
```

**Parallelization Strategy:**
- Launch 3 parallel tracks immediately: T3.1, T3.3, T3.6
- After both T3.1 and T3.3 complete, start T3.5
- Chain T3.7 after T3.5
- Final UX testing after all components ready

**Timeline:** Serial = 24h | Parallel = ~13h (T3.1→T3.5→T3.7 chain)

---

### Phase 4: Popup & Polish (6 tasks)

```
BLOCKS: Phase 2 must complete (needs code-matcher.ts)

TRACK 1 (Popup):
T2.3 complete ──> T4.1: popup-cache.ts (2h) ──> T4.2: popup.tsx (3h)
                                                         │
                                                         └──> T4.3: score-display.tsx (3h, optional)

TRACK 2 (Feature Flag - parallel):
Independent ──> T4.4: Feature flag (2h)

TRACK 3 (Documentation - parallel):
Independent ──> T4.5: Documentation (4h)

TRACK 4 (E2E - final):
ALL above complete ──> T4.6: Full E2E regression (6h)

DEPENDENCIES:
- T4.1 depends on T2.3 (needs updated matcher for scoring metadata)
- T4.2 depends on T4.1 (popup uses cache)
- T4.3 depends on T4.1 (debug display uses cache)
- T4.6 depends on ALL tasks (full system test)
- T4.4 and T4.5 are independent

EARLY START OPPORTUNITY:
- T4.4 and T4.5 can start during Phase 3
```

**Parallelization Strategy:**
- Start T4.4, T4.5 early (during Phase 3)
- Launch T4.1 immediately after T2.3 completes
- Run T4.2 and T4.3 in parallel after T4.1
- E2E regression is the final gate

**Timeline:** Serial = 20h | Parallel = ~11h (T4.1→T4.2 chain + E2E)

---

### Phase 5: QA & Validation (5 tasks)

```
BLOCKS: Phase 4 must complete (full system ready)

PARALLEL TRACKS (all can run simultaneously):
├─ T5.1: QA-OPS Level 3 validation (8h)
├─ T5.2: Accessibility audit (4h)
├─ T5.3: Security review (2h, if needed)
├─ T5.4: Performance validation (3h)
└─ T5.5: Feature flag testing (2h)

DEPENDENCIES:
- All depend on T4.6 (E2E must pass first)
- No internal dependencies (can fully parallelize)
```

**Parallelization Strategy:**
- Launch all 5 tasks simultaneously
- Different specialists can own different tracks
- Fastest completion: 8h (limited by T5.1)

**Timeline:** Serial = 19h | Parallel = ~8h (all parallel, longest is T5.1)

---

## 2. Parallelization Groups

### Maximum Concurrency Map

| Phase | Max Parallel Tracks | Bottleneck Task | Duration (Parallel) |
|-------|---------------------|-----------------|---------------------|
| Phase 1 | 6 tracks | domain-affinity + tests | ~7h |
| Phase 2 | 4 tracks (initially) | code-matcher refactor | ~21h |
| Phase 3 | 3 tracks | session-chip + integration | ~13h |
| Phase 4 | 3 tracks | popup.tsx + E2E | ~11h |
| Phase 5 | 5 tracks | QA-OPS validation | ~8h |

### Optimal Parallelization Schedule

```
WEEK 1 (Foundation + Early UX):
Day 1-2 (7h):   Phase 1 - 6 parallel tracks
Day 2-3 (13h):  Phase 3 Track 1+2 (session-chip, badge-manager) - START EARLY

WEEK 2-3 (Core Refactors):
Day 4-6 (21h):  Phase 2 - Critical path (poller → matcher → controller)
                Parallel: otp-extractor, provider parsers
Day 6-7 (6h):   Phase 3 finalization (watch-session, autofill, UX testing)

WEEK 4 (Polish + QA):
Day 8-9 (11h):  Phase 4 - Popup + E2E
Day 9-10 (8h):  Phase 5 - Full QA validation (5 parallel tracks)
```

**Total Optimized Duration:** ~28-32 hours of execution (vs 47h serial)

---

## 3. Critical Path Analysis

### Primary Critical Path (Longest Chain)

```
T1.1: scoring-config (2h)
  ↓
T1.2: domain-affinity (4h)
  ↓
T1.3: domain-affinity tests (3h)
  ↓
T2.1: session-poller (4h)
  ↓
T2.3: code-matcher refactor (8h) ⚠️ HIGH RISK
  ↓
T2.4: code-matcher tests (4h)
  ↓
T2.7: session-controller refactor (6h) ⚠️ HIGH RISK
  ↓
T2.8: session-controller tests (3h)
  ↓
T4.6: Full E2E regression (6h)
  ↓
T5.1: QA-OPS validation (8h)

TOTAL: 48 hours
```

### Critical Bottlenecks

**1. code-matcher.ts Refactor (T2.3) — 8 hours**
- **Why Critical:** Integrates ALL Phase 1 scoring modules
- **Complexity:** 118 → 350 LOC (3x expansion)
- **Risk:** Breaking existing v1 matcher logic
- **Blocks:** session-controller.ts refactor, popup integration
- **Mitigation Required:** See Section 5

**2. session-controller.ts Refactor (T2.7) — 6 hours**
- **Why Critical:** Integrates poller + updated matcher
- **Complexity:** 477 → 400 LOC (refactoring while adding features)
- **Risk:** Session state management, polling delegation
- **Blocks:** Watch-session integration, E2E testing
- **Mitigation Required:** See Section 5

**3. Full E2E Regression (T4.6) — 6 hours**
- **Why Critical:** Gates QA validation
- **Complexity:** 12 E2E test scenarios + regression
- **Risk:** Uncovering integration bugs late
- **Blocks:** Release validation
- **Mitigation:** Early integration testing in Phase 2

### Secondary Critical Paths

**UI Path (can run parallel to matching):**
```
T3.1: session-chip (6h) → T3.5: watch-session (3h) → T3.7: autofill (1h)
TOTAL: 10 hours (can overlap with Phase 2)
```

**Popup Path:**
```
T4.1: popup-cache (2h) → T4.2: popup.tsx (3h) → T4.6: E2E (6h)
TOTAL: 11 hours (depends on T2.3 completion)
```

---

## 4. Execution Order Recommendation

### Strategy: "Aggressive Parallel + Early UI Start"

#### Week 1: Foundation + Early UX (Days 1-3)

**Day 1 Morning (2h):**
```
Launch 1 task:
└─ T1.1: scoring-config.ts (blocking for multiple tracks)

RATIONALE: Single-threaded to establish foundation quickly
```

**Day 1 Afternoon → Day 2 (12h parallel):**
```
Launch 5 parallel tracks:
├─ Track A: T1.2 (4h) → T1.3 (3h) → T1.10 (30m)
├─ Track B: T1.4 (2h) → T1.5 (2h)
├─ Track C: T1.6 (3h) → T1.7 (2h)
├─ Track D: T1.8 (1h) → T1.9 (1h)
└─ Track E: T3.1 session-chip (6h) [EARLY START] → T3.2 (3h)

RATIONALE: Maximize parallelization, start UX work early
COMPLETION: Phase 1 complete, session-chip ready
```

**Day 2 Evening → Day 3 (7h parallel):**
```
Launch 2 parallel tracks:
├─ Track F: T3.3 badge-manager (4h) → T3.4 (2h)
└─ Track G: T3.6 notification.ts (1h) + T4.5 documentation (4h)

RATIONALE: Continue UX work, start documentation early
COMPLETION: Most UX components ready
```

#### Week 2: Core Refactors (Days 4-6)

**Day 4 Morning (7h parallel):**
```
Launch 3 parallel tracks:
├─ Track H: T2.1 session-poller (4h) → T2.2 (3h)
├─ Track I: T2.5 otp-extractor (2h) → T2.6 (2h)
└─ Track J: T2.9 provider parsers (2h) → T2.10 (2h)

RATIONALE: Poller must complete before matcher starts
COMPLETION: Support modules ready
```

**Day 4 Afternoon → Day 5 (12h SERIAL - CRITICAL):**
```
⚠️ SINGLE TRACK ONLY (collision risk):
└─ Track K: T2.3 code-matcher (8h) → T2.4 tests (4h)

RATIONALE: Major refactor requires focus, blocks controller
RISK MITIGATION: Dedicated developer, incremental commits, continuous testing
COMPLETION: Scoring v2 integrated
```

**Day 6 (9h SERIAL - CRITICAL):**
```
⚠️ SINGLE TRACK ONLY (depends on T2.3):
└─ Track L: T2.7 session-controller (6h) → T2.8 tests (3h)

RATIONALE: Integrates poller + matcher, high complexity
RISK MITIGATION: See Section 5
COMPLETION: Phase 2 complete
```

#### Week 3: Integration + Polish (Days 7-9)

**Day 7 (7h parallel):**
```
Launch 3 parallel tracks:
├─ Track M: T3.5 watch-session (3h) → T3.7 autofill (1h)
├─ Track N: T4.1 popup-cache (2h) → T4.2 popup.tsx (3h)
└─ Track O: T4.4 feature flag (2h)

RATIONALE: Integrate UX + Popup, implement feature flag
COMPLETION: All features integrated
```

**Day 8 (4h):**
```
Launch 1 track:
└─ Track P: T3.8 Manual UX testing (4h)

RATIONALE: Validate UX before E2E
COMPLETION: UX validated
```

**Day 9 (9h):**
```
Launch 2 parallel tracks:
├─ Track Q: T4.3 score-display (3h) [OPTIONAL]
└─ Track R: T4.6 Full E2E regression (6h) [CRITICAL GATE]

RATIONALE: E2E must pass before QA validation
COMPLETION: Phase 4 complete
```

#### Week 4: QA Validation (Day 10)

**Day 10 (8h parallel):**
```
Launch 5 parallel tracks:
├─ Track S: T5.1 QA-OPS (8h)
├─ Track T: T5.2 A11y audit (4h)
├─ Track U: T5.3 Security review (2h)
├─ Track V: T5.4 Performance (3h)
└─ Track W: T5.5 Feature flag testing (2h)

RATIONALE: Maximum parallelization, different specialists
COMPLETION: All validation complete ✅
```

### Total Timeline Summary

| Week | Days | Tasks Completed | Parallel Tracks | Key Milestones |
|------|------|-----------------|-----------------|----------------|
| Week 1 | 1-3 | Phase 1 + Early UX | Up to 5 | Foundation + session-chip ready |
| Week 2 | 4-6 | Phase 2 | 1-3 | Core refactors complete |
| Week 3 | 7-9 | Phase 3 + Phase 4 | 2-3 | Integration + E2E pass |
| Week 4 | 10 | Phase 5 | 5 | QA validation complete |

**Total Calendar Time:** ~10 working days
**Total Effort:** ~47 person-hours (optimized from serial ~120h)

---

## 5. Risk Mitigation Strategy

### High-Risk Refactor 1: code-matcher.ts (T2.3)

**Complexity Score:** 9/10
**Impact if Fails:** Blocks session-controller, popup, E2E (CRITICAL PATH)

#### Risks

1. **Breaking v1 Matcher Logic**
   - Current: 118 LOC, stable, tested
   - New: 350 LOC, 3x expansion
   - Risk: Regression in existing scenarios

2. **Integration Complexity**
   - Must integrate 4 scoring modules (domain-affinity, recency-scorer, shape-matcher, scoring-config)
   - Risk: Interface mismatches, incorrect scoring calculations

3. **Performance Regression**
   - New: +7ms per candidate (acceptable but tight budget)
   - Risk: Exceeding 10ms threshold (0.3x worse than baseline)

4. **Feature Flag Logic**
   - Must maintain v1 fallback
   - Risk: Flag toggling breaks existing functionality

#### Mitigation Strategy

**Pre-Implementation (1h):**
```
1. Code Review Session with Codex
   - Review current code-matcher.ts implementation
   - Identify fragile areas, edge cases
   - Document v1 test coverage baseline

2. Create Safety Branch
   - Branch: feature/code-matcher-v2
   - Preserve v1 in separate function: findBestMatchingCodeV1()

3. Define Incremental Commits
   - Commit 1: Add v2 scoring functions (no behavior change)
   - Commit 2: Add feature flag infrastructure
   - Commit 3: Implement v2 logic behind flag
   - Commit 4: Update tests
   - Each commit must pass existing tests
```

**During Implementation (8h):**
```
Hour 1-2: Scaffold v2 structure
  - Add imports (domain-affinity, recency-scorer, shape-matcher)
  - Create findBestMatchingCodeV2() function
  - Feature flag gate: if (!settings.watchSessionV2Enabled) return v1()
  - Run tests: ALL v1 tests must pass (no changes)

Hour 3-4: Implement DomainAffinity integration
  - Replace domainsMatch() with domainAffinity()
  - Add affinity scoring (affinity * 100)
  - Run tests: Verify domain matching logic intact

Hour 5-6: Implement RecencyBoost + SessionBoost
  - Replace calculateRecencyScore() with recencyBoost() + sessionBoost()
  - Add recency scoring (Math.round(recency * 250))
  - Add session scoring (Math.round(session * 100))
  - Run tests: Verify time-based scoring works

Hour 7: Implement ShapeScore
  - Integrate shapeScore() call
  - Add shape tiebreaker (shape > 0 ? 8 : 0)
  - Run tests: Verify shape bias applied correctly

Hour 8: Final integration
  - Add usedPenalty logic (code.used ? -50 : 0)
  - Implement acceptMin threshold (points >= 10)
  - Update function signature (add sessionStart, expectedShape params)
  - Run tests: ALL tests pass (v1 + v2)

CHECKPOINT: If any hour fails, STOP and escalate
```

**Testing Strategy (4h):**
```
Hour 1: Unit Tests
  - 10 new v2 scenarios (exact match, alias, token, recency, session)
  - Edge cases (no sessionStart, missing expectedShape)
  - Regression: ALL existing v1 tests pass

Hour 2: Integration Tests
  - E2E scoring pipeline (storage → matcher → autofill)
  - Feature flag toggle (v1 ↔ v2 switching works)

Hour 3: Performance Tests
  - Benchmark: <10ms per candidate (100 candidates)
  - Profile: Identify hot paths (eTLD extraction, alias lookup)

Hour 4: Manual Validation
  - Real email scenarios (Gmail, Outlook)
  - Multi-account disambiguation
  - Edge cases (expired codes, missing senderETLD)

GATE: If performance >10ms, apply optimizations:
  - Memoize eTLD extraction
  - Cache alias lookups
  - Pre-compute sessionStart delta
```

**Rollback Plan:**
```
IF tests fail after 2 iterations:
  1. Revert to v1 logic
  2. Create detailed failure report
  3. Escalate to architect for re-planning

IF performance >10ms:
  1. Apply performance optimizations (memoization)
  2. If still >10ms, defer to Phase 4 (post-MVP optimization)

IF integration breaks:
  1. Isolate broken module (domain-affinity, recency-scorer, shape-matcher)
  2. Fix or stub the module
  3. Re-run tests
```

---

### High-Risk Refactor 2: session-controller.ts (T2.7)

**Complexity Score:** 8/10
**Impact if Fails:** Blocks watch-session, autofill, E2E (CRITICAL PATH)

#### Risks

1. **Polling Logic Extraction**
   - Moving ~100 LOC to session-poller.ts
   - Risk: State synchronization issues, alarm scheduling bugs

2. **Session State Management**
   - Adding sessionStart field
   - Risk: State corruption, race conditions

3. **Matcher Integration**
   - Passing new params (sessionStart, expectedShape)
   - Risk: Parameter mismatch, null handling

4. **Storage Schema Changes**
   - Adding senderETLD, receivedAt fields
   - Risk: Backward compatibility break

#### Mitigation Strategy

**Pre-Implementation (1h):**
```
1. Dependency Verification
   - Ensure T2.1 (session-poller.ts) is complete and tested
   - Ensure T2.3 (code-matcher.ts v2) passes all tests
   - Review session-poller.ts API (schedulePolls, cancelPolls)

2. Create Integration Branch
   - Branch: feature/session-controller-v2
   - Preserve current controller logic for comparison

3. Define Refactor Steps
   - Step 1: Extract polling (delegate to session-poller)
   - Step 2: Add sessionStart tracking
   - Step 3: Update matcher calls (add sessionStart, expectedShape)
   - Step 4: Update storage calls (add senderETLD, receivedAt)
```

**During Implementation (6h):**
```
Hour 1: Extract Polling Logic
  - Initialize SessionPoller instance
  - Replace alarm scheduling with poller.schedulePolls()
  - Replace alarm cancellation with poller.cancelPolls()
  - Run tests: Verify polling still works

Hour 2: Add sessionStart Field
  - Update SessionState interface
  - Set sessionStart = Date.now() on START_SESSION
  - Persist sessionStart in session storage
  - Run tests: Verify session state intact

Hour 3-4: Update Matcher Integration
  - Import findBestMatchingCode from code-matcher.ts v2
  - Pass sessionStart to matcher
  - Pass expectedShape to matcher (from session state)
  - Handle null/undefined gracefully
  - Run tests: Verify matching works end-to-end

Hour 5: Update Storage Integration
  - Import extractETLD from domain-affinity.ts
  - Add senderETLD extraction: extractETLD(email.from)
  - Ensure receivedAt is set: email.timestamp
  - Run tests: Verify storage backward compat

Hour 6: Integration Testing
  - Test full cycle: detect → listen → poll → match → fill
  - Test restart recovery (session storage persistence)
  - Test polling delegation (alarms fire correctly)
  - Run tests: ALL integration tests pass

CHECKPOINT: If any hour fails, STOP and debug before continuing
```

**Testing Strategy (3h):**
```
Hour 1: Unit Tests
  - 6 new scenarios (sessionStart tracking, poller delegation)
  - Edge cases (missing sessionStart, null expectedShape)
  - Regression: ALL existing controller tests pass

Hour 2: Integration Tests
  - Poller delegation (alarms scheduled at 0/5/10s)
  - Session restart (state recovered from storage)
  - Matcher integration (sessionStart passed correctly)
  - Storage integration (senderETLD populated)

Hour 3: E2E Smoke Tests
  - Real email flow (Gmail provider)
  - Multi-poll scenario (code arrives at 5s)
  - Timeout scenario (no code after 15s)

GATE: If any E2E fails, escalate to code-implementer
```

**Rollback Plan:**
```
IF polling delegation breaks:
  1. Revert to inline alarm logic (temporary)
  2. Debug session-poller.ts
  3. Re-integrate after fix

IF session state corruption occurs:
  1. Add defensive checks (null guards)
  2. Reset session storage on corruption
  3. Log errors for debugging

IF matcher integration fails:
  1. Verify code-matcher.ts v2 is stable
  2. Check parameter passing (sessionStart, expectedShape)
  3. Add null handling / fallback to v1 matcher
```

---

### Medium-Risk Areas

#### 1. watch-session.ts Integration (T3.5)

**Risk:** Integrating session-chip + badge-manager + notification callbacks

**Mitigation:**
- Ensure session-chip.ts and badge-manager.ts are fully tested before integration
- Use defensive programming (null checks on chipHandle)
- Add timeout guards (clear before set to avoid state conflicts)
- Test state transitions thoroughly (listening → filled → copied → timeout)

#### 2. Full E2E Regression (T4.6)

**Risk:** Discovering integration bugs late in the process

**Mitigation:**
- Run incremental E2E tests after Phase 2 (don't wait for Phase 4)
- Smoke test critical paths after each major refactor
- Use feature flag to isolate v2 logic during testing
- Maintain v1 fallback path for emergency rollback

#### 3. Performance Validation (T5.4)

**Risk:** Performance regression exceeding budget (+10% max)

**Mitigation:**
- Profile during Phase 2 (not after Phase 4)
- Benchmark each scoring function individually
- Apply optimizations early:
  - Memoize eTLD extraction (cache by domain)
  - Cache alias lookups (Map for O(1) lookup)
  - Use integer math where possible (avoid Math.round overhead)
- If >10% regression, defer non-critical features (e.g., token overlap)

---

### Architectural Collision Points

#### File Collision Matrix

| File | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Risk Level |
|------|---------|---------|---------|---------|------------|
| `code-matcher.ts` | - | T2.3 | - | T4.1 | HIGH (serialize T2.3 → T4.1) |
| `session-controller.ts` | - | T2.7 | - | - | MEDIUM (single edit) |
| `watch-session.ts` | - | - | T3.5 | - | MEDIUM (single edit) |
| `schema.ts` | T1.8 | T2.7 | - | - | LOW (minor field additions) |
| `popup.tsx` | - | - | - | T4.2 | LOW (single edit) |

**Collision Avoidance:**
1. **code-matcher.ts:** Complete T2.3 fully before starting T4.1 (popup-cache)
2. **session-controller.ts:** Single refactor in T2.7, no other touches
3. **watch-session.ts:** Wait for session-chip + badge-manager to complete before T3.5
4. **schema.ts:** T1.8 adds fields, T2.7 uses fields (sequential, no conflict)

---

## 6. Success Metrics & Gates

### Phase Gates (Must Pass to Proceed)

**Phase 1 → Phase 2:**
- ✅ All 42 unit tests pass
- ✅ No integration changes (pure domain logic)
- ✅ Test coverage ≥90% for new files

**Phase 2 → Phase 3:**
- ✅ E2E scoring pipeline works (storage → matcher → autofill)
- ✅ Performance <50ms extraction, <10ms matching
- ✅ ALL v1 tests still pass (regression check)
- ✅ Feature flag toggle works (v1 ↔ v2)

**Phase 3 → Phase 4:**
- ✅ All UX states work (listening, filled, copied, timeout)
- ✅ A11y audit passes (keyboard nav, ARIA, reduced motion)
- ✅ Visual regression tests pass
- ✅ Manual testing complete (4h validation)

**Phase 4 → Phase 5:**
- ✅ Full E2E regression passes (12 scenarios)
- ✅ Popup <200ms
- ✅ Feature flag implementation complete
- ✅ Documentation updated

**Phase 5 → Release:**
- ✅ QA-OPS Level 3 validation passes
- ✅ A11y WCAG 2.1 AA compliant
- ✅ Performance budgets met (no >10% regression)
- ✅ Security review passes (if applicable)
- ✅ Feature flag tested (v1 fallback works)

### Continuous Metrics (Track Throughout)

| Metric | Target | Measurement | Action if Failed |
|--------|--------|-------------|------------------|
| Test Coverage | ≥90% | Run after each task | Block merge until fixed |
| Build Time | <5min | CI pipeline | Investigate if >5min |
| LOC per File | <400 | Manual review | Refactor if >400 |
| Performance | No >10% regression | Benchmark suite | Optimize or defer feature |
| Accessibility | WCAG 2.1 AA | Automated + manual | Fix before Phase 5 |

---

## 7. Contingency Plans

### If Critical Path Slips

**Scenario:** T2.3 (code-matcher) takes 12h instead of 8h

**Action:**
1. **Immediate:** Reduce scope (defer token overlap to Phase 4)
2. **Parallel:** Start T3.1, T3.3 (UX components) early to recover time
3. **Weekend:** Add 1 day to Phase 2 timeline
4. **Escalate:** If >16h, split into two tasks (scoring integration + testing)

### If Performance Regression >10%

**Scenario:** Matching takes 15ms instead of <10ms

**Action:**
1. **Profile:** Identify hot path (eTLD extraction? alias lookup? recency calc?)
2. **Optimize:**
   - Memoize eTLD extraction (cache by domain)
   - Cache alias lookups (Map instead of array search)
   - Use integer math (avoid Math.round if possible)
3. **Defer:** If still >10%, defer token overlap feature
4. **Fallback:** Keep v1 matcher as default, v2 behind flag for testing

### If E2E Tests Fail in Phase 4

**Scenario:** T4.6 reveals integration bugs

**Action:**
1. **Triage:** Identify failing scenario (domain matching? polling? UX states?)
2. **Rollback:** Use feature flag to isolate broken module
3. **Fix:** Apply targeted fix to specific module
4. **Re-test:** Run E2E subset (not full 12 scenarios)
5. **Defer:** If complex, defer to Phase 5 (QA validation) with known issues documented

### If QA Validation Fails in Phase 5

**Scenario:** T5.1 (QA-OPS) finds blocking issues

**Action:**
1. **Categorize:** Blocker vs Warning (per QA-OPS severity)
2. **Fix Blockers:** Immediately (within 4h)
3. **Document Warnings:** Add to known issues (address in v2.1)
4. **Re-validate:** Run QA-OPS subset (not full validation)
5. **Escalate:** If >2 blockers, escalate to product owner

---

## 8. Communication Plan

### Daily Standups (10 min)

**Format:**
- What completed yesterday?
- What's in progress today?
- Any blockers?
- Any risks surfaced?

**Frequency:** Daily during Phase 2-4 (critical path)

### Weekly Status Reports

**To:** User (product owner)
**Frequency:** Weekly (end of each phase)
**Content:**
- Tasks completed this week
- Tasks in progress
- Risks identified + mitigations
- Timeline status (on track / delayed)
- Next week's plan

### Escalation Triggers

**Immediate Escalation (same day):**
- Critical path task blocked >4h
- Test coverage drops below 80%
- Performance regression >20%
- Security vulnerability discovered

**Standard Escalation (next day):**
- Non-critical task blocked >8h
- Test coverage 80-90%
- Performance regression 10-20%
- A11y issue discovered

---

## 9. Tooling & Automation

### Recommended Development Tools

**Testing:**
- Vitest (unit tests) — fast feedback loop
- Playwright (E2E tests) — real browser testing
- Jest coverage (track ≥90% target)

**Performance:**
- Chrome DevTools Profiler — identify hot paths
- Benchmark.js — measure scoring functions
- Lighthouse CI — track popup performance

**Code Quality:**
- ESLint (enforce 400 LOC limit)
- Prettier (consistent formatting)
- TypeScript strict mode (catch null issues early)

**Collaboration:**
- Git feature branches (one per task)
- Pull requests (code review before merge)
- Semantic commit messages (feat/fix/refactor)

### Automation Opportunities

**CI/CD Pipeline:**
```yaml
on: [push, pull_request]
jobs:
  test:
    - Run unit tests
    - Run integration tests
    - Check test coverage ≥90%
    - Fail if coverage drops

  performance:
    - Benchmark scoring functions
    - Compare to baseline
    - Fail if >10% regression

  build:
    - Build extension
    - Check bundle size
    - Fail if >5% increase

  lint:
    - Run ESLint
    - Check LOC per file <400
    - Check TypeScript errors
```

**Pre-commit Hooks:**
```bash
#!/bin/bash
# Run tests before commit
npm run test:unit

# Check coverage
coverage=$(npm run test:coverage --silent | grep "All files" | awk '{print $10}')
if (( $(echo "$coverage < 90" | bc -l) )); then
  echo "Coverage $coverage% < 90%, commit blocked"
  exit 1
fi
```

---

## 10. Final Recommendations

### Top 3 Execution Priorities

1. **Protect the Critical Path**
   - T2.3 (code-matcher) and T2.7 (session-controller) are make-or-break
   - Assign most experienced developer
   - No distractions during these tasks
   - Incremental commits, continuous testing

2. **Start UI Work Early**
   - T3.1 (session-chip) and T3.3 (badge-manager) have no dependencies
   - Can run parallel to Phase 2
   - Recovers time if Phase 2 slips
   - Allows early UX validation

3. **Fail Fast on Performance**
   - Profile after T2.3 (don't wait for Phase 5)
   - Apply optimizations immediately
   - If >10% regression, adjust scope (defer token overlap)
   - Keep v1 fallback path for safety

### Optimal Team Structure

**2-Person Team:**
- **Developer A (Senior):** Owns critical path (T2.3, T2.7)
- **Developer B (Mid):** Owns parallel tracks (UX, popup, tests)

**3-Person Team:**
- **Developer A (Senior):** T2.3, T2.7 (critical refactors)
- **Developer B (Mid):** Phase 1, Phase 3 (foundation + UX)
- **Developer C (Junior):** Tests, documentation, QA support

### Success Probability

**Best Case (Aggressive Parallel):** 28 hours, 10 working days ✅
**Expected Case (Moderate Parallel):** 32 hours, 12 working days ✅
**Worst Case (Serial Execution):** 47 hours, 18 working days ⚠️

**Confidence:** 80% to meet Expected Case if mitigations applied

---

**END OF EXECUTION STRATEGY**
