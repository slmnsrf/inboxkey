# Email Check Triggering Guardrails

> **Date:** 2026-03-20
> **Status:** Approved (v3 -- revised per Codex review #2)
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
  Field appears -> Tier 1 + Tier 2 detection -> "This is a code field" (tier + confidence 0-100)

New guardrail layer (additive):
  1. Has connected mailboxes?       No -> stop silently, clean up
  2. Has field received focus?       No -> wait for focus (any input in group)
  3. Email context near field?       Tier 1 -> bypass (high-certainty path)
                                     Tier 2 + no email context -> stop, clean up
                                     Tier 2 + email context -> proceed
  4. (Session runs, background polls)
  5. Port disconnects + tab gone?    -> cancel session immediately
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

**Tier-gated, not confidence-gated.** `DetectionResult.confidence` is on a 0-100 scale (converted from internal 0.0-1.0 via `Math.round(confidence * 100)`). Tier 2 caps confidence at `Math.min(score / THRESHOLD, 1.0)`, which means every successful Tier 2 detection gets confidence = 100 after conversion. A confidence threshold would therefore never trigger for Tier 2, defeating the purpose.

Instead, gate on the detection **tier** (which is already present in `DetectionResult.tier`):

**Rule:**
- **Tier 1 detections:** bypass the email context check entirely. Tier 1 matches high-certainty signals like `autocomplete="one-time-code"`, explicit OTP attributes, and split-input groups. These are almost certainly verification inputs regardless of surrounding text.
- **Tier 2 detections:** run the email context scan. Tier 2 is the lower-certainty path that catches ambiguous fields via label/placeholder/form-context heuristics. These are the detections most likely to false-positive on promo codes, gift cards, etc. No email context found = veto (triggers blocked-start cleanup).

This preserves the existing high-certainty Tier 1 paths while adding a safety net for the ambiguous Tier 2 detections.

**Scan scope:** Walk up from the detected field to its nearest semantic container (`<form>`, `<main>`, `<section>`, `<article>`). Scan text content within that container. Exclude `<header>`, `<footer>`, `<nav>`, and elements with ARIA roles `navigation`, `banner`, `contentinfo`. If no semantic container is found, fall back to scanning 5 DOM levels up from the field.

**Signals (any one is sufficient):**

1. **Email-related patterns** via the existing `EMAIL_PATTERNS` regex array from `signal-classifier.ts`. This array already covers 21 languages with proper diacritics, regex patterns, and email address matching. The email context guard imports and reuses these patterns rather than maintaining a duplicate keyword list. This prevents drift between the signal classifier and the context guard.

2. **`@` character** in the scanned text content (indicates a displayed email address). Excluded from footer/nav/header zones by the scoping rules above.

3. **Email input field** anywhere within the scanned container: an `<input>` with `type="email"` or `autocomplete="email"`.

**Failure mode:** If the DOM scan throws (e.g., detached node, cross-origin iframe content), proceed with the session (failure-open). Better to over-trigger on a legitimate page than silently block a real verification flow.

**Implementation:** New module `lib/detection/email-context-guard.ts` containing the scanning logic. Imports `EMAIL_PATTERNS` from `signal-classifier.ts` (which must be exported). No duplicate keyword list. The module's only job is the scoped DOM scan and signal matching.

**Rationale:** Promo code pages, gift card inputs, and serial number fields pass the Tier 2 heuristics but have no email context. This gate eliminates those false triggers while preserving all Tier 1 and email-context-positive Tier 2 detections.

### Guardrail 4: Abort on Disconnect

**Where:** `background/index.ts`, in the `port.onDisconnect` handler inside `attachPort()`.

**Behavior:** When a port disconnect is detected, check whether the tab still exists at the same URL before canceling. Port disconnects happen for multiple reasons: user navigated away, tab closed, page unloaded, OR MV3 service worker restart. The current code deliberately falls back to `chrome.tabs.sendMessage()` when the port is gone (background/index.ts line 473-476), which handles the service-worker-restart case where the tab is still there.

**Baseline URL:** The `START_SESSION` message already includes the page `url`. Store it in `WatchPortContext` at session start (add an `originUrl?: string` field to the `WatchPortContext` interface). This provides the baseline for the URL comparison in the disconnect handler.

**New behavior:** In the `onDisconnect` handler, after clearing the keepalive timer and nulling the port:
1. Check `chrome.tabs.get(context.tabId)` to see if the tab still exists.
2. If the tab no longer exists OR its URL differs from `context.originUrl`: cancel the session via `sessionController.cancelSession(context.sessionId)`. The internal `cancelSession` -> `deliverSessionCompletion` -> `cleanupSessionContext` chain handles full cleanup. After `cancelSession` returns, clear `context.sessionId`.
3. If the tab still exists at the same URL: do NOT cancel. The session can still deliver results via `chrome.tabs.sendMessage()` fallback (handles service worker restart gracefully).

**Rationale:** Polling with nobody listening wastes email API quota. But blindly canceling on every disconnect would break the existing fallback delivery path that handles MV3 service worker restarts. The tab-existence + URL check distinguishes "user left" from "port died but tab is still there."

## Integration Points

All changes are additive. Existing files modified:

| File | Change |
|------|--------|
| `extension/src/contents/index.ts` | Replace direct `handleDetectedField()` calls with focus-gated wrapper. Attach focus listeners to all group members for split-input groups. Add representative field to `globalProcessedRepresentatives` at detection time. Handle blocked-start cleanup from `startWatch()` (including removing `data-inboxkey-focus-gated`). |
| `extension/src/contents/watch-session.ts` | Add no-mailbox check + email context check (tier-gated) inside `WatchSession.start()`, before port connection. Signal caller on veto so `startWatch()` can unwind `activeWatch` and processed fields. |
| `extension/src/lib/detection/signal-classifier.ts` | Export `EMAIL_PATTERNS` (currently module-private `const`). |
| `extension/src/background/index.ts` | Add `originUrl` field to `WatchPortContext`. Store URL from `START_SESSION` message. Add tab-existence + URL check + conditional `cancelSession()` in `port.onDisconnect` handler. |

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
   - Test `autofocus` attribute scenario.
3. **Email context (tier-gated):**
   - Tier 1 + no email context: verify session proceeds (bypass).
   - Tier 2 + no email context (e.g., "Enter promo code"): verify session blocked, cleanup runs.
   - Tier 2 + email context present: verify session proceeds.
   - Verify footer/nav `@` symbols don't trigger (scoping excludes them).
   - Test DOM scan exception, verify session proceeds (failure-open).
   - Verify existing test cases for "Verification Code" pages detected via Tier 1 still pass.
4. **Abort on disconnect:**
   - Disconnect port + tab gone: verify `cancelSession()` called, no further polls.
   - Disconnect port + tab URL changed: verify `cancelSession()` called.
   - Disconnect port + tab still at same URL: verify session NOT canceled, fallback delivery preserved.

## Non-Goals

- No changes to existing Tier 1 / Tier 2 detection heuristics.
- No changes to the WatchSession lifecycle, polling schedule, or code matching.
- No UI changes (no new prompts, banners, or settings).
- No new user-facing settings for these guardrails. They are always on.

## Changelog

- **v3 (Codex review #2):** 4 fixes: (1) Changed email context gating from confidence-based (0-1 scale, wrong) to tier-based. Tier 1 bypasses, Tier 2 runs the scan. Tier 2 always hits confidence=100 after conversion, so confidence thresholds were ineffective. (2) Focus gate now specifies split-input group handling: attach listeners to all inputs in the group, trigger session for representative when any member is focused. (3) Abort-on-disconnect now specifies adding `originUrl` to `WatchPortContext` (stored from `START_SESSION` message) as the baseline for URL comparison. (4) Blocked-start cleanup now also removes `data-inboxkey-focus-gated` attribute to allow re-detection.
- **v2 (Codex review #1):** 4 fixes: (1) Added blocked-start cleanup section -- when `.start()` vetoes, `startWatch()` unwinds `activeWatch` and `globalProcessedRepresentatives`. (2) Made email context check confidence-gated instead of hard block. (3) Replaced duplicate keyword list with import of existing `EMAIL_PATTERNS` from `signal-classifier.ts`. (4) Made abort-on-disconnect conditional on tab existence to preserve the `chrome.tabs.sendMessage()` fallback delivery path for MV3 service worker restarts.
