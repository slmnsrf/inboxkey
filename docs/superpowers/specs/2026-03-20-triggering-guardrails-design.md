# Email Check Triggering Guardrails

> **Date:** 2026-03-20
> **Status:** Approved (v4 -- revised per Codex review #3)
> **Scope:** 4 additive guardrails on the email check triggering algorithm

## Problem

The extension's field detection system (Tier 1 + Tier 2) identifies verification code input fields and immediately starts a watch session that polls the user's email. This is too aggressive:

- Sessions start even when no mailboxes are connected (pointless polling, confusing timeout).
- Sessions start on DOM presence alone -- the user may be scrolling past the field, not interacting with it.
- Fields that look like code inputs but aren't (promo codes, gift cards, serial numbers) can pass the heuristics and trigger email checks on pages with no email context.
- When the user navigates away mid-session, the background worker keeps polling until timeout with nobody listening.

## Design

### Principle

The existing detection system stays completely intact. No changes to Tier 1, Tier 2, heuristics, or confidence scoring. The 4 guardrails are an additive layer that runs **after** detection confirms "this looks like a verification field" but **before** a watch session starts.

```
Existing system (unchanged):
  Field appears -> Tier 1 + Tier 2 detection -> "This is a code field" (tier + signals)

New guardrail layer (additive):
  1. Has connected mailboxes?       No -> stop silently, clean up
  2. Has field received focus?       No -> wait for focus (any input in group)
  3. Email context near field?       Tier 1 or split-input -> bypass
                                     Tier 2 (non-split) + no email context -> stop, clean up
                                     Tier 2 (non-split) + email context -> proceed
  4. (Session runs, background polls)
  5. Port disconnects?               -> cancel session immediately
```

### Blocked-Start Cleanup

Guardrails 1 and 3 run inside `WatchSession.start()`. If either vetoes, `.start()` returns early before opening a port. However, `startWatch()` has already assigned the session to `activeWatch` and the representative field is in `globalProcessedRepresentatives`. Without cleanup, the field is permanently blocked for that page load.

**Fix:** When `.start()` returns early due to a guardrail veto, it must signal the caller. `startWatch()` must handle this by:
- Nulling `activeWatch` (so a future session can start)
- Calling `clearProcessedFields()` (so the field can be re-detected if conditions change, e.g., user connects a mailbox and reloads)
- Removing the `data-inboxkey-focus-gated` attribute from the field (so the focus gate can re-register its listener if the field is re-detected)

Implementation: `.start()` returns a boolean or calls a `onVetoed` callback. `startWatch()` checks the result and unwinds if vetoed.

### Guardrail 1: No-Mailbox Check

**Where:** Inside `WatchSession.start()` in `watch-session.ts`, alongside the existing blacklist and domain-enabled checks, before the port connection is opened.

**Behavior:** Query the mailbox count via `StorageFactory.create()` then `storage.getMailboxes()`, consistent with how `WatchSession.start()` already accesses settings through `StorageFactory` (watch-session.ts lines 107-109) and how the background worker accesses mailboxes. If the returned array is empty (zero mailboxes connected), return early (triggers blocked-start cleanup). The extension behaves as if it's not installed. No prompt or nag.

**Failure mode:** If the storage query throws, proceed with the session (failure-open). Matches the existing try/catch pattern in `contents/index.ts` lines 116-126.

**Rationale:** Polling with zero mailboxes is pure waste. Silent skip respects the "goodwill over pressure" principle.

### Guardrail 2: Focus Gate

**Where:** `contents/index.ts`, replacing direct calls to `handleDetectedField()`.

**Init-order requirement:** `globalProcessedRepresentatives` is currently initialized inside `startDynamicDetection()` (line 147), which runs after `detectExistingFields()` (line 214 vs 217). The focus gate needs the Set available during `detectExistingFields()` to mark representatives at detection time. Fix: initialize `globalProcessedRepresentatives = new Set()` before `detectExistingFields()` is called (move initialization to before line 214, or initialize at module level where the variable is declared).

**Behavior:** When the field detection system identifies a code field, instead of immediately starting a watch session, register focus listeners and wait.

- The representative field is added to `globalProcessedRepresentatives` at detection time (not at focus time), so the existing deduplication Set continues to prevent the MutationObserver from re-processing the same field between detection and focus.
- A `data-inboxkey-focus-gated` attribute on the representative field prevents duplicate listener registration.

**Split-input group handling:** The content script normalizes detections to a group representative before starting a session (`contents/index.ts` lines 70-72, 186-192). For split-input groups (e.g., 6 separate boxes for a 6-digit code), the user might focus the 3rd or 4th box, not the representative. Therefore:
- Attach a one-time focus listener to **every input in the group**, not just the representative.
- When **any** input in the group receives focus, trigger the session for the representative (the same field that `startWatch()` receives).
- Use a shared flag (the `data-inboxkey-focus-gated` attribute on the representative) to ensure only one session starts regardless of which group member is focused first.

**Single-field handling:** For non-group fields, attach the focus listener to the detected field directly.

**Auto-focus behavior:**
- If the field (or any group member) already has focus (`document.activeElement === field`), trigger immediately.
- If not, the focus listener fires when: (a) the user clicks/tabs into the field, or (b) the page auto-focuses the field via `autofocus` attribute or JS `.focus()` call. Both cases fire the `focus` event naturally.
- The listeners auto-clean after first fire (`{ once: true }`).
- If the user never focuses any field in the group, nothing happens.

**Timing note:** `detectExistingFields()` may run before the page's own `autofocus` or JS `.focus()` executes. In this case, `document.activeElement` doesn't match at detection time, but the focus listener will fire moments later when the browser processes the `autofocus` attribute or the page script calls `.focus()`. No `setTimeout` hack is needed -- the event-driven approach handles this correctly.

**Rationale:** Verification pages almost always auto-focus the code field. This gate passes those through instantly while blocking drive-by detection on fields the user is scrolling past. The user must be actively engaging with the field.

### Guardrail 3: Email Context Check

**Where:** Inside `WatchSession.start()` in `watch-session.ts`, after the domain-enabled check, before `chrome.runtime.connect()` opens the port. The `WatchSession` object is constructed in `startWatch()`, but its side-effects only begin on `.start()`. This gate blocks `.start()` from proceeding (triggers blocked-start cleanup if vetoed).

**Bypass criteria (no email context scan needed):**
- **Tier 1 detections:** Tier 1 matches high-certainty signals like `autocomplete="one-time-code"` and explicit OTP attributes. These are almost certainly verification inputs regardless of surrounding text.
- **Split-input detections (any tier):** Split-input groups (6 boxes, maxLength=1) are scored in Tier 2 (`tier2-deep.ts:495-502`, +75 points) but are high-certainty OTP patterns. If the detection signals include `split-input` in the reason string, bypass the email context check regardless of tier.

**Rule:**
- Tier 1 OR split-input signal present: **bypass** the email context check entirely.
- Tier 2 (non-split-input): run the email context scan. No email context found = veto (triggers blocked-start cleanup).

This preserves all high-certainty detection paths (Tier 1 attributes AND Tier 2 split-input widgets) while adding a safety net for the remaining ambiguous Tier 2 detections that could be promo codes or gift card inputs.

**Scan scope:** Walk up from the detected field to its nearest semantic container (`<form>`, `<main>`, `<section>`, `<article>`). Scan text content within that container. Exclude `<header>`, `<footer>`, `<nav>`, and elements with ARIA roles `navigation`, `banner`, `contentinfo`. If no semantic container is found, fall back to scanning 5 DOM levels up from the field.

**Signals (any one is sufficient):**

1. **Email-related patterns** via the existing `EMAIL_PATTERNS` regex array from `signal-classifier.ts`. This array already covers 21 languages with proper diacritics, regex patterns, and email address matching. The email context guard imports and reuses these patterns rather than maintaining a duplicate keyword list. This prevents drift between the signal classifier and the context guard.

2. **`@` character** in the scanned text content (indicates a displayed email address). Excluded from footer/nav/header zones by the scoping rules above.

3. **Email input field** anywhere within the scanned container: an `<input>` with `type="email"` or `autocomplete="email"`.

**Failure mode:** If the DOM scan throws (e.g., detached node, cross-origin iframe content), proceed with the session (failure-open). Better to over-trigger on a legitimate page than silently block a real verification flow.

**Implementation:** New module `lib/detection/email-context-guard.ts` containing the scanning logic. Imports `EMAIL_PATTERNS` from `signal-classifier.ts` (which must be exported). No duplicate keyword list. The module's only job is the scoped DOM scan and signal matching.

**Rationale:** Promo code pages, gift card inputs, and serial number fields pass the Tier 2 label/placeholder heuristics but have no email context. This gate eliminates those false triggers while preserving all Tier 1, split-input, and email-context-positive Tier 2 detections.

### Guardrail 4: Abort on Disconnect

**Where:** `background/index.ts`, in the `port.onDisconnect` handler inside `attachPort()`.

**Behavior:** When a port disconnect is detected, cancel the active session unconditionally.

**Why unconditional (no URL check):** The previous spec versions attempted to preserve a "service worker restart fallback" by keeping sessions alive when the tab still existed at the same URL. However, this fallback doesn't actually work: `sessionContexts` is in-memory only (background/index.ts line 58) and is lost on service worker restart. `deliverSessionCompletion` bails immediately when the context is missing (line 447). The content script's result handling is also port-based (`watch-session.ts:101`). The same-URL check would add complexity without providing real restart resilience. If MV3 restart resilience is needed in the future, it requires a dedicated reattachment/resume design -- not a guardrail workaround.

**New behavior:** In the `onDisconnect` handler, after clearing the keepalive timer and nulling the port:
1. If `context.sessionId` exists, call `sessionController.cancelSession(context.sessionId)`. The internal `cancelSession` -> `deliverSessionCompletion` -> `cleanupSessionContext` chain handles full cleanup.
2. Clear `context.sessionId`.

This mirrors the cleanup pattern used in the `STOP_SESSION` message handler (background/index.ts lines 364-369).

**Rationale:** Polling with nobody listening wastes email API quota and violates the principle of minimal email access. If the port disconnected, the content script is gone and cannot receive results.

## Integration Points

All changes are additive. Existing files modified:

| File | Change |
|------|--------|
| `extension/src/contents/index.ts` | Initialize `globalProcessedRepresentatives` before `detectExistingFields()`. Replace direct `handleDetectedField()` calls with focus-gated wrapper. Attach focus listeners to all group members for split-input groups. Add representative field to `globalProcessedRepresentatives` at detection time. Handle blocked-start cleanup from `startWatch()` (including removing `data-inboxkey-focus-gated`). |
| `extension/src/contents/watch-session.ts` | Add no-mailbox check + email context check (tier/split-input-gated) inside `WatchSession.start()`, before port connection. Signal caller on veto so `startWatch()` can unwind `activeWatch` and processed fields. Pass `DetectionResult` to `WatchSession` so `.start()` can check `tier` and `signals`. |
| `extension/src/lib/detection/signal-classifier.ts` | Export `EMAIL_PATTERNS` (currently module-private `const`). |
| `extension/src/background/index.ts` | Add unconditional `cancelSession()` in `port.onDisconnect` handler when `context.sessionId` exists. |

New file:

| File | Purpose |
|------|---------|
| `extension/src/lib/detection/email-context-guard.ts` | Scoped DOM scan + signal matching. Imports `EMAIL_PATTERNS` from `signal-classifier.ts`. |

## Testing Strategy

Each guardrail is independently testable:

1. **No-mailbox:** Mock storage with zero mailboxes, verify `WatchSession.start()` returns early without opening a port. Verify `activeWatch` is cleaned up, `data-inboxkey-focus-gated` removed, and field can be re-detected. Mock storage failure, verify session proceeds (failure-open).
2. **Focus gate:**
   - Single field: create detected field without focus, verify no session. Focus the field, verify session starts.
   - Split-input group: create 6-input group, focus the 4th input, verify session starts for representative.
   - Verify representative field is in `globalProcessedRepresentatives` even before focus.
   - Verify `globalProcessedRepresentatives` is available during `detectExistingFields()` (init order).
   - Test `autofocus` attribute scenario.
3. **Email context (tier/split-input-gated):**
   - Tier 1 + no email context: verify session proceeds (bypass).
   - Tier 2 split-input + no email context: verify session proceeds (bypass).
   - Tier 2 non-split + no email context (e.g., "Enter promo code"): verify session blocked, cleanup runs.
   - Tier 2 non-split + email context present: verify session proceeds.
   - Verify footer/nav `@` symbols don't trigger (scoping excludes them).
   - Test DOM scan exception, verify session proceeds (failure-open).
   - Verify existing test cases for split-input OTP pages still pass.
4. **Abort on disconnect:**
   - Disconnect port: verify `cancelSession()` called unconditionally, no further polls.
   - Verify cleanup matches `STOP_SESSION` handler pattern.

## Non-Goals

- No changes to existing Tier 1 / Tier 2 detection heuristics.
- No changes to the WatchSession lifecycle, polling schedule, or code matching.
- No UI changes (no new prompts, banners, or settings).
- No new user-facing settings for these guardrails. They are always on.
- No MV3 service worker restart resilience (requires separate design if needed).

## Changelog

- **v4 (Codex review #3):** 3 fixes: (1) Simplified abort-on-disconnect to unconditional cancel -- the URL-based "restart fallback" was illusory since `sessionContexts` is in-memory only and lost on restart. Removed `originUrl` from `WatchPortContext`. (2) Added split-input bypass for email context check. Split-input is scored in Tier 2 (`tier2-deep.ts:495`), not Tier 1. Without this bypass, common OTP widgets (Steam, banks) would be blocked on pages without email text. Bypass triggers when detection signals include `split-input`. (3) Added init-order requirement: `globalProcessedRepresentatives` must be initialized before `detectExistingFields()` runs.
- **v3 (Codex review #2):** 4 fixes: (1) Changed email context gating from confidence-based (0-1 scale, wrong) to tier-based. Tier 2 always hits confidence=100 after conversion, so confidence thresholds were ineffective. (2) Focus gate now specifies split-input group handling. (3) Abort-on-disconnect specified `originUrl` storage. (4) Blocked-start cleanup removes `data-inboxkey-focus-gated`.
- **v2 (Codex review #1):** 4 fixes: (1) Added blocked-start cleanup section. (2) Made email context check confidence-gated instead of hard block. (3) Replaced duplicate keyword list with existing `EMAIL_PATTERNS`. (4) Made abort-on-disconnect conditional on tab existence.
