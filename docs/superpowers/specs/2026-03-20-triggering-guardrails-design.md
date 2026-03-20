# Email Check Triggering Guardrails

> **Date:** 2026-03-20
> **Status:** Approved (v2 -- revised per Codex review)
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
  Field appears -> Tier 1 + Tier 2 detection -> "This is a code field" (confidence score)

New guardrail layer (additive):
  1. Has connected mailboxes?   No -> stop silently, clean up
  2. Has field received focus?   No -> wait for focus
  3. Email context near field?   No + confidence < 0.9 -> stop silently, clean up
                                 No + confidence >= 0.9 -> proceed (high-confidence bypass)
  4. (Session runs, background polls)
  5. Port disconnects + tab gone? -> cancel session immediately
```

### Blocked-Start Cleanup

Guardrails 1 and 3 run inside `WatchSession.start()`. If either vetoes, `.start()` returns early before opening a port. However, `startWatch()` has already assigned the session to `activeWatch` and the representative field is in `globalProcessedRepresentatives`. Without cleanup, the field is permanently blocked for that page load.

**Fix:** When `.start()` returns early due to a guardrail veto, it must signal the caller. `startWatch()` must handle this by:
- Nulling `activeWatch` (so a future session can start)
- Calling `clearProcessedFields()` (so the field can be re-detected if conditions change, e.g., user connects a mailbox and reloads)

Implementation: `.start()` returns a boolean or calls a `onVetoed` callback. `startWatch()` checks the result and unwinds if vetoed.

### Guardrail 1: No-Mailbox Check

**Where:** Inside `WatchSession.start()` in `watch-session.ts`, alongside the existing blacklist and domain-enabled checks, before the port connection is opened.

**Behavior:** Query the mailbox count via `StorageFactory.create()` then `storage.getMailboxes()`, consistent with how `WatchSession.start()` already accesses settings through `StorageFactory` (watch-session.ts lines 107-109) and how the background worker accesses mailboxes. If the returned array is empty (zero mailboxes connected), return early (triggers blocked-start cleanup). The extension behaves as if it's not installed. No prompt or nag.

**Failure mode:** If the storage query throws, proceed with the session (failure-open). Matches the existing try/catch pattern in `contents/index.ts` lines 116-126.

**Rationale:** Polling with zero mailboxes is pure waste. Silent skip respects the "goodwill over pressure" principle.

### Guardrail 2: Focus Gate

**Where:** `contents/index.ts`, replacing direct calls to `handleDetectedField()`.

**Behavior:** When the field detection system identifies a code field, instead of immediately starting a watch session, register a one-time focus listener on the field.

- The representative field is added to `globalProcessedRepresentatives` at detection time (not at focus time), so the existing deduplication Set continues to prevent the MutationObserver from re-processing the same field between detection and focus.
- A `data-inboxkey-focus-gated` attribute on the field prevents duplicate focus listeners.
- If the field already has focus (`document.activeElement === field`), trigger immediately.
- If not, the focus listener fires when: (a) the user clicks/tabs into the field, or (b) the page auto-focuses the field via `autofocus` attribute or JS `.focus()` call. Both cases fire the `focus` event, so no special handling is needed for `autofocus` -- the listener catches it naturally regardless of timing.
- The listener auto-cleans after first fire (`{ once: true }`).
- If the user never focuses the field, nothing happens.

**Timing note:** `detectExistingFields()` may run before the page's own `autofocus` or JS `.focus()` executes. In this case, `document.activeElement !== field` at detection time, but the focus listener will fire moments later when the browser processes the `autofocus` attribute or the page script calls `.focus()`. No `setTimeout` hack is needed -- the event-driven approach handles this correctly.

**Rationale:** Verification pages almost always auto-focus the code field. This gate passes those through instantly while blocking drive-by detection on fields the user is scrolling past. The user must be actively engaging with the field.

### Guardrail 3: Email Context Check

**Where:** Inside `WatchSession.start()` in `watch-session.ts`, after the domain-enabled check, before `chrome.runtime.connect()` opens the port. The `WatchSession` object is constructed in `startWatch()`, but its side-effects only begin on `.start()`. This gate blocks `.start()` from proceeding (triggers blocked-start cleanup if vetoed).

**Confidence-gated, not a hard block.** The existing detection system intentionally allows strong OTP fields (e.g., `autocomplete="one-time-code"`, split-input groups) once it has ruled out SMS/authenticator-only contexts. A page that says just "Enter verification code" with a 6-digit input is a legitimate detection. A hard email-context block would false-negative these pages, breaking existing behavior and test expectations.

**Rule:**
- If detection confidence >= 0.9 (high-confidence Tier 1 detections like `autocomplete="one-time-code"`): **bypass** the email context check entirely. These fields are almost certainly verification inputs regardless of surrounding text.
- If detection confidence < 0.9: run the email context scan. No email context found = veto (triggers blocked-start cleanup).

This preserves the existing high-confidence detection paths while adding a safety net for moderate-confidence detections that could be promo codes or gift card inputs.

**Scan scope:** Walk up from the detected field to its nearest semantic container (`<form>`, `<main>`, `<section>`, `<article>`). Scan text content within that container. Exclude `<header>`, `<footer>`, `<nav>`, and elements with ARIA roles `navigation`, `banner`, `contentinfo`. If no semantic container is found, fall back to scanning 5 DOM levels up from the field.

**Signals (any one is sufficient):**

1. **Email-related patterns** via the existing `EMAIL_PATTERNS` regex array from `signal-classifier.ts`. This array already covers 21 languages with proper diacritics, regex patterns, and email address matching. The email context guard imports and reuses these patterns rather than maintaining a duplicate keyword list. This prevents drift between the signal classifier and the context guard.

2. **`@` character** in the scanned text content (indicates a displayed email address). Excluded from footer/nav/header zones by the scoping rules above.

3. **Email input field** anywhere within the scanned container: an `<input>` with `type="email"` or `autocomplete="email"`.

**Failure mode:** If the DOM scan throws (e.g., detached node, cross-origin iframe content), proceed with the session (failure-open). Better to over-trigger on a legitimate page than silently block a real verification flow.

**Implementation:** New module `lib/detection/email-context-guard.ts` containing the scanning logic. Imports `EMAIL_PATTERNS` from `signal-classifier.ts` (which must be exported). No duplicate keyword list. The module's only job is the scoped DOM scan and signal matching.

**Rationale:** Promo code pages, gift card inputs, and serial number fields pass the moderate-confidence heuristics but have no email context. This gate eliminates those false triggers while preserving all high-confidence and email-context-positive detections.

### Guardrail 4: Abort on Disconnect

**Where:** `background/index.ts`, in the `port.onDisconnect` handler inside `attachPort()`.

**Behavior:** When a port disconnect is detected, check whether the tab still exists at the same URL before canceling. Port disconnects happen for multiple reasons: user navigated away, tab closed, page unloaded, OR MV3 service worker restart. The current code deliberately falls back to `chrome.tabs.sendMessage()` when the port is gone (background/index.ts line 473-476), which handles the service-worker-restart case where the tab is still there.

**New behavior:** In the `onDisconnect` handler, after clearing the keepalive timer and nulling the port:
1. Check `chrome.tabs.get(context.tabId)` to see if the tab still exists.
2. If the tab no longer exists OR its URL has changed: cancel the session via `sessionController.cancelSession(context.sessionId)`. The internal `cancelSession` -> `deliverSessionCompletion` -> `cleanupSessionContext` chain handles full cleanup (port message will throw and be caught, `sessionContexts` is deleted internally). After `cancelSession` returns, clear `context.sessionId`.
3. If the tab still exists at the same URL: do NOT cancel. The session can still deliver results via `chrome.tabs.sendMessage()` fallback (handles service worker restart gracefully).

**Rationale:** Polling with nobody listening wastes email API quota. But blindly canceling on every disconnect would break the existing fallback delivery path that handles MV3 service worker restarts. The tab-existence check distinguishes "user left" from "port died but tab is still there."

## Integration Points

All changes are additive. Existing files modified:

| File | Change |
|------|--------|
| `extension/src/contents/index.ts` | Replace direct `handleDetectedField()` calls with focus-gated wrapper. Add representative field to `globalProcessedRepresentatives` at detection time. Handle blocked-start cleanup from `startWatch()`. |
| `extension/src/contents/watch-session.ts` | Add no-mailbox check + email context check inside `WatchSession.start()`, before port connection. Signal caller on veto so `startWatch()` can unwind `activeWatch` and processed fields. |
| `extension/src/lib/detection/signal-classifier.ts` | Export `EMAIL_PATTERNS` (currently module-private `const`). |
| `extension/src/background/index.ts` | Add tab-existence check + conditional `cancelSession()` in `port.onDisconnect` handler. |

New file:

| File | Purpose |
|------|---------|
| `extension/src/lib/detection/email-context-guard.ts` | Scoped DOM scan + signal matching. Imports `EMAIL_PATTERNS` from `signal-classifier.ts`. |

## Testing Strategy

Each guardrail is independently testable:

1. **No-mailbox:** Mock storage with zero mailboxes, verify `WatchSession.start()` returns early without opening a port. Verify `activeWatch` is cleaned up and field can be re-detected. Mock storage failure, verify session proceeds (failure-open).
2. **Focus gate:** Create detected field without focus, verify no session. Verify representative field is in `globalProcessedRepresentatives` even before focus. Focus the field, verify session starts. Test `autofocus` attribute scenario.
3. **Email context (confidence-gated):**
   - High confidence (>= 0.9) + no email context: verify session proceeds (bypass).
   - Moderate confidence (< 0.9) + no email context (e.g., "Enter promo code"): verify session blocked, cleanup runs.
   - Moderate confidence + email context present: verify session proceeds.
   - Verify footer/nav `@` symbols don't trigger (scoping excludes them).
   - Test DOM scan exception, verify session proceeds (failure-open).
   - Verify existing test cases for "Verification Code" pages still pass (high confidence bypass).
4. **Abort on disconnect:**
   - Disconnect port + tab gone: verify `cancelSession()` called, no further polls.
   - Disconnect port + tab still at same URL: verify session NOT canceled, fallback delivery preserved.

## Non-Goals

- No changes to existing Tier 1 / Tier 2 detection heuristics.
- No changes to the WatchSession lifecycle, polling schedule, or code matching.
- No UI changes (no new prompts, banners, or settings).
- No new user-facing settings for these guardrails. They are always on.

## Changelog

- **v2 (Codex review):** 4 fixes: (1) Added blocked-start cleanup section -- when `.start()` vetoes, `startWatch()` unwinds `activeWatch` and `globalProcessedRepresentatives`. (2) Made email context check confidence-gated (>= 0.9 bypasses) instead of hard block, preserving existing high-confidence detection paths. (3) Replaced duplicate keyword list with import of existing `EMAIL_PATTERNS` from `signal-classifier.ts`. (4) Made abort-on-disconnect conditional on tab existence to preserve the `chrome.tabs.sendMessage()` fallback delivery path for MV3 service worker restarts.
