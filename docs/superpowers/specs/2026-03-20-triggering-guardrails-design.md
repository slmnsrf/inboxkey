# Email Check Triggering Guardrails

> **Date:** 2026-03-20
> **Status:** Approved
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
  Field appears -> Tier 1 + Tier 2 detection -> "This is a code field"

New guardrail layer (additive):
  1. Has connected mailboxes?   No -> stop silently
  2. Has field received focus?   No -> wait for focus
  3. Email context near field?   No -> stop silently
  4. (Session runs, background polls)
  5. Port disconnects?           -> cancel session immediately
```

### Guardrail 1: No-Mailbox Check

**Where:** Inside `WatchSession.start()` in `watch-session.ts`, alongside the existing blacklist and domain-enabled checks, before the port connection is opened.

**Behavior:** Query the mailbox count via `StorageFactory.create()` then `storage.getMailboxes()`, consistent with how `WatchSession.start()` already accesses settings through `StorageFactory` (watch-session.ts lines 107-109) and how the background worker accesses mailboxes. If the returned array is empty (zero mailboxes connected), return early -- no session, no chip, no polling. The extension behaves as if it's not installed. No prompt or nag. The user connects a mailbox when ready; verification pages work on the next visit.

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

**Where:** Inside `WatchSession.start()` in `watch-session.ts`, after the domain-enabled check, before `chrome.runtime.connect()` opens the port. The `WatchSession` object is constructed in `startWatch()`, but its side-effects only begin on `.start()`. This gate blocks `.start()` from proceeding.

**Behavior:** Scan the DOM near the detected field for email-related context signals. If no signals found, do not trigger.

**Scan scope:** Walk up from the detected field to its nearest semantic container (`<form>`, `<main>`, `<section>`, `<article>`). Scan text content within that container. Exclude `<header>`, `<footer>`, `<nav>`, and elements with ARIA roles `navigation`, `banner`, `contentinfo`. If no semantic container is found, fall back to scanning 5 DOM levels up from the field.

**Signals (any one is sufficient):**

1. **Email-related keywords** in page text (case-insensitive):
   - English: `email`, `e-mail`, `mail`, `inbox`, `sent to`, `check your`, `verification`
   - German: `e-mail`, `mail`, `postfach`, `gesendet an`, `pruefen sie`, `prüfen sie`
   - Turkish: `e-posta`, `posta`, `gelen kutusu`, `gonderildi`, `gönderildi`
   - French: `courriel`, `e-mail`, `envoye a`, `envoyé à`, `boite de reception`, `boîte de réception`
   - Spanish: `correo`, `e-mail`, `enviado a`, `bandeja de entrada`
   - Portuguese: `e-mail`, `correio`, `enviado para`, `caixa de entrada`
   - Italian: `e-mail`, `posta`, `inviato a`, `casella di posta`
   - Dutch: `e-mail`, `mail`, `verzonden naar`, `postvak`
   - Polish: `e-mail`, `mail`, `wysłano na`, `wyslano na`, `skrzynka`
   - Russian: `email`, `почта`, `электронная почта`, `отправлено на`, `входящие`
   - Japanese: `メール`, `Eメール`, `送信先`, `受信トレイ`
   - Korean: `이메일`, `메일`, `전송됨`, `받은편지함`
   - Chinese (Simplified): `邮件`, `电子邮件`, `发送到`, `收件箱`
   - Chinese (Traditional): `郵件`, `電子郵件`, `發送到`, `收件匣`
   - Arabic: `بريد`, `إيميل`, `أرسل إلى`, `صندوق الوارد`
   - Hindi: `ईमेल`, `मेल`, `भेजा गया`, `इनबॉक्स`
   - Thai: `อีเมล`, `เมล`, `ส่งไปที่`, `กล่องจดหมาย`
   - Vietnamese: `email`, `thư điện tử`, `thu dien tu`, `gửi đến`, `gui den`, `hộp thư`, `hop thu`
   - Indonesian/Malay: `email`, `e-mel`, `dikirim ke`, `kotak masuk`
   - Swedish: `e-post`, `mail`, `skickat till`, `inkorg`
   - Czech: `e-mail`, `mail`, `odesláno na`, `doručená pošta`

2. **`@` character** in the scanned text content (indicates a displayed email address like "Sent to user@gmail.com"). Excluded from footer/nav/header zones by the scoping rules above.

3. **Email input field** anywhere within the scanned container: an `<input>` with `type="email"` or `autocomplete="email"`.

**Failure mode:** If the DOM scan throws (e.g., detached node, cross-origin iframe content), proceed with the session (failure-open). This matches the existing codebase pattern of try/catch with "continue on error" for non-critical checks. Better to over-trigger on a legitimate page than silently block a real verification flow.

**Implementation:** Single centralized module (`lib/detection/email-context-guard.ts`) containing the keyword list and scanning logic. Same pattern as existing detection heuristics in `tier1-fast.ts`. Not spread across i18n translation files -- these are detection heuristics, not user-facing strings.

**Rationale:** Promo code pages, gift card inputs, and serial number fields pass the code-input heuristics but have no email context. This gate eliminates those false triggers while passing all legitimate verification flows (which nearly always display email context in their instructions).

### Guardrail 4: Abort on Disconnect

**Where:** `background/index.ts`, in the `port.onDisconnect` handler inside `attachPort()`.

**Behavior:** When a port disconnect is detected (user navigated away, closed tab, or page unloaded), immediately cancel the active session for that tab. This means: stop the poller, clear scheduled alarms, make no further email API calls.

**Current behavior:** The `onDisconnect` handler clears the keepalive timer and nulls the port reference, but leaves the polling session running until timeout.

**New behavior:** Add session cancellation to the `onDisconnect` handler. If `context.sessionId` exists:
1. Call `sessionController.cancelSession(context.sessionId)` to stop polling and clear alarms.
2. Clean up the session context entry from `sessionContexts` (delete the stale entry to prevent memory leaks and avoid `deliverSessionCompletion` attempting delivery to a disconnected port).
3. Clear `context.sessionId`.

This mirrors the cleanup pattern used in the `STOP_SESSION` message handler (background/index.ts lines 364-369).

**Rationale:** Polling with nobody listening wastes email API quota and violates the principle of minimal email access. If the user left the page, the session has no consumer.

## Integration Points

All changes are additive. Existing files modified:

| File | Change |
|------|--------|
| `extension/src/contents/index.ts` | Replace direct `handleDetectedField()` calls with focus-gated wrapper. Add representative field to `globalProcessedRepresentatives` at detection time. |
| `extension/src/contents/watch-session.ts` | Add no-mailbox check + email context check inside `WatchSession.start()`, before port connection, alongside existing blacklist/domain checks. |
| `extension/src/background/index.ts` | Add `cancelSession()` + context cleanup in `port.onDisconnect` handler. |

New file:

| File | Purpose |
|------|---------|
| `extension/src/lib/detection/email-context-guard.ts` | Email context scanning logic + multi-language keyword list |

## Testing Strategy

Each guardrail is independently testable:

1. **No-mailbox:** Mock storage with zero mailboxes, verify `WatchSession.start()` returns early without opening a port. Mock storage failure, verify session proceeds (failure-open).
2. **Focus gate:** Create detected field without focus, verify no session. Verify representative field is in `globalProcessedRepresentatives` even before focus. Focus the field, verify session starts. Test `autofocus` attribute scenario.
3. **Email context:** Create a page with a code-like input but no email context (e.g., "Enter promo code"), verify no session. Add email context text, verify session starts. Verify footer/nav `@` symbols don't trigger (scoping excludes them). Test DOM scan exception, verify session proceeds (failure-open).
4. **Abort on disconnect:** Start a session, disconnect the port, verify `cancelSession()` called, session context cleaned up, and no further polls fire.

## Non-Goals

- No changes to existing Tier 1 / Tier 2 detection heuristics.
- No changes to the WatchSession lifecycle, polling schedule, or code matching.
- No UI changes (no new prompts, banners, or settings).
- No new user-facing settings for these guardrails. They are always on.
