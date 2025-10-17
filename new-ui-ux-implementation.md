# New UI‑UX Implementation · Roll‑Up Plan (Aligned to `roadmap.md`)

> **Intent:** A practical, sprint‑ready plan to implement the updated UI‑UX across the extension.  
> **Alignment:** Maps directly to `roadmap.md` phases (do not edit the roadmap here).  
> **Guides:** Follow the Design System (`ui-ux-principles.md`, `ui-components.md`, `font-and-colors.md`, `spacing-and-sizes.md`, `motion-and-feedback.md`, `storytelling.md`).

---

## How to Use This Plan
- Treat each **Work Package (WP)** as a deliverable with clear acceptance criteria.  
- Ownership: `ui-ux-specialist` gates → `code-implementer` builds → `qa-ops` validates.  
- Keep commits small; one WP per PR when possible.

---

## Phase 9 — A11y & i18n (MVP Polish)
**Goal:** Ship an accessible, localization‑ready UI without changing user flows.

**WP‑9.1 Keyboard & Focus**
- Visible focus rings; tab order verified for Popup, Settings, Wizard, Chip.
- Modal focus‑trap; escape closes.  
**Acceptance:** Keyboard‑only pass; axe DevTools shows 0 critical violations.

**WP‑9.2 ARIA & Semantics**
- ARIA labels on Copy/Open, Lock, Close, Tabs; live regions for toasts.  
**Acceptance:** Screen reader announces actions and states accurately.

**WP‑9.3 Contrast & Motion**
- Verify WCAG contrast; adjust tokens if needed.  
- Respect `prefers-reduced-motion`; reduce animations to fades.  
**Acceptance:** All text ≥ 4.5:1 (large text ≥ 3:1); motion‑reduced build verified.

**WP‑9.4 i18n Scaffolding**
- Externalize UI strings; establish locale files; pseudo‑locale test.  
**Acceptance:** English strings live in `en.json`; UI renders with pseudo‑locale.

---

## Phase 10 — Hardening & Trust (MVP Finish)
**Goal:** Make the UI feel finished, fast, and trustworthy.

**WP‑10.1 Performance Budgets**
- Popup P95 < 200 ms; code‑split Settings; memoize heavy lists.  
**Acceptance:** Measured in CI with simple perf harness; budget documented.

**WP‑10.2 Optimistic Feedback & Empty States**
- Toasts for Copy/Open; calm success chip; skeleton loaders.  
**Acceptance:** QA checklist screenshots for each state.

**WP‑10.3 About & Trust Row**
- “Open‑source (license)”, “View source”, “Local‑only” badges.  
- Small **Support development** button (Buy‑me‑a‑coffee).  
**Acceptance:** Trust info discoverable in ≤10 s; CTA non‑intrusive.

**WP‑10.4 Security Surfaces**
- Password setup screen (strength meter, “no recovery” warning).  
- Danger Zone (Reset) confirmation modal.  
**Acceptance:** Flows match specs; reset is irreversible with clear copy.

**WP‑10.5 Per‑Site Overrides (UI only)**
- List of sites; toggle Auto‑fill/Prompt/Off; domain add/edit.  
**Acceptance:** CRUD works; stored settings reflected in content script flags.

**WP‑10.6 Notifications & Error Banners**
- Token expired → Reconnect banner; Offline → cached state banner.  
**Acceptance:** Deterministic QA scenarios render correct banner + action.

**WP‑10.7 Accessibility Audit & Fix Pass**
- Full audit after all above WPs; fix remaining issues.  
**Acceptance:** axe DevTools 0 critical/serious; keyboard & SR smoke tests pass.

---

## Phase 11 — Mailboxes UI (Post‑MVP)
**Goal:** Unified, read‑only list of recent messages (privacy‑safe).

**WP‑11.1 Unified List & Provider Filters**
- Table/cards with Date • From • Subject • Provider.  
**WP‑11.2 Safe Preview**
- Sanitized preview pane; *no external images*; highlight codes/links.  
**WP‑11.3 Performance & Pagination**
- Cap items; lazy load; virtualize if needed.  
**Acceptance:** No send/reply actions; privacy copy visible; P95 open < 250 ms.

---

## Phase 12 — InboxBridge (IMAP) Onboarding (Post‑MVP)
**Goal:** Ship the IMAP helper flow when the native bridge is ready.

**WP‑12.1 “Coming Soon” Placeholder (MVP)**
- Clear messaging in provider picker; link to issue/discussion.  
**WP‑12.2 Full Onboarding (Post‑MVP)**
- OS‑specific install steps, integrity hashes, “Test Connection,” then credentials form.  
**Acceptance:** Users complete setup within 2–4 min; troubleshooting link present.

---

## Cross‑Cutting Definition of Done (All UI WPs)
- UI matches design tokens; spacing uses 4 px scale; typography per system font stack.  
- Accessibility: keyboard, ARIA, contrast, reduced motion.  
- Non‑intrusive tone and microcopy align with storytelling guidelines.  
- `ui-ux-specialist` **APPROVED**; `qa-ops` **PASS**; screenshots recorded in PR.  
- No tracking. Privacy copy present. Open‑source and Support CTA discoverable but quiet.

---

## References
- Design System: `ui-ux-principles.md`, `ui-components.md`, `font-and-colors.md`, `spacing-and-sizes.md`, `motion-and-feedback.md`, `storytelling.md`.  
- Evergreen Journeys: `user-journeys.md` (this repository).  
- Technical Spec: `specifications.md` (MVP detection, autofill, polling).  
- Agents & Gates: `AGENTS.md` → `ui-ux-specialist`, `code-implementer`, `qa-ops`.

---

## Notes
- This file is the *only* place where UI‑UX implementation work is planned. The **roadmap** remains the master tracker; if changes are needed, propose a patch to `roadmap.md` referencing the relevant headings.
