# Prototypes - Claude Rules

## Purpose

This folder is a mini internal Figma for development -- a place to iterate on UI designs before production implementation. All prototypes are standalone HTML files that open directly in any browser.

## Creating Prototypes

1. **Check for duplication first**: Search existing prototypes before creating new ones
2. **Expand existing prototypes** if similar functionality exists rather than creating duplicates
3. Place in the correct category folder
4. Use kebab-case naming, no version suffixes
5. Include shared `tokens.css` (link or inline)
6. Add theme toggle (light/dark) support
7. Document design decisions (REQUIRED)

## Updating Prototypes

1. **Always update the date** in the `<meta name="date">` tag when making changes
2. Update `<meta name="status">` on lifecycle changes:
   - Ideation -> Approved (user approval)
   - Approved -> Implemented (in production)
   - Any -> Archived (superseded/deprecated)
3. **Always update decisions** when design choices change

## Status Definitions

| Status | Meaning |
|--------|---------|
| **Ideation** | Early concept, not ready for implementation |
| **Approved** | Design approved, ready for implementation |
| **Implemented** | In production codebase |
| **Archived** | No longer active |

---

## MANDATORY: Design Decisions Documentation

**Every prototype MUST include a `<script type="application/json" id="decisions">` block.**

### Where to Document

```html
<!-- At the bottom of the HTML file, before closing </body> -->
<script type="application/json" id="decisions">
[
  "Decision 1 - Brief title followed by explanation of why this choice was made.",
  "Decision 2 - Another design choice with rationale.",
  "Decision 3 - Trade-offs considered and why this approach won."
]
</script>
```

### Decision Format

Each decision should be a single string following this pattern:

```
"[Brief Title] - [Explanation of the decision and why it was made]"
```

**Good examples:**
- `"Border-based section separation - Borders provide reliable visual separation in both light and dark modes, unlike shadows which become invisible on dark backgrounds."`
- `"Single-slot provider cards - Gmail limited to 1 account (Chrome Identity API constraint); Outlook/IMAP support multiple via PKCE."`
- `"Inline trust pillars - Horizontal icon+label row is more compact than stacked cards while maintaining scannability."`

**Bad examples:**
- `"Used borders"` (no explanation of WHY)
- `"The button is blue"` (trivial, not a design decision)
- `"Added a card"` (too vague, no context)

### What to Document

1. **UX Patterns** - Why this interaction pattern over alternatives
2. **Layout Choices** - Why elements are positioned/grouped this way
3. **State Management** - How different states (loading, error, empty) are handled
4. **Visual Hierarchy** - Why certain elements are emphasized
5. **Accessibility** - Keyboard navigation, screen reader considerations
6. **Edge Cases** - How unusual scenarios are handled
7. **Trade-offs** - What was sacrificed and why
8. **Rejected Alternatives** - What was considered but not chosen, and why

### Minimum Requirements

- **New prototypes**: Minimum 3 decisions required
- **Complex prototypes** (multi-step flows, multi-state features): Minimum 5 decisions
- **Updates**: Add new decisions when design changes, never remove existing ones without user approval

---

## Prototype HTML Structure

Every prototype MUST follow this structure:

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="status" content="Ideation">
  <meta name="date" content="YYYY-MM-DD">
  <meta name="category" content="settings|popup|dialogs|components|content">
  <title>[Name] - InboxKey Prototype</title>
  <link rel="stylesheet" href="../shared/tokens.css">
  <style>/* prototype-specific styles */</style>
</head>
<body>
  <div class="proto-toolbar">
    <!-- Theme toggle, state controls -->
  </div>
  <main class="proto-canvas">
    <!-- Prototype content -->
  </main>

  <script type="application/json" id="decisions">[...]</script>
  <script src="../shared/theme-switcher.js"></script>
</body>
</html>
```

### Required Meta Tags

- `status`: Current lifecycle status (Ideation, Approved, Implemented, Archived)
- `date`: Last modified date (YYYY-MM-DD)
- `category`: Which folder/category this belongs to

---

## Encouraged Practices

### Full Context Design

For page-level or flow-based prototypes, design with the full layout context:

- Include header, tab navigation, and surrounding UI elements
- Show how the feature fits into the actual extension page
- Demonstrate the complete user journey when applicable

### Edge Cases

Include edge case showcases in prototypes:

- Empty states
- Loading states
- Error states
- Long text overflow
- Dark mode rendering
- Accessibility edge cases

### Theme Testing

Every prototype must render correctly in both light and dark modes. Use the theme toggle to verify.

---

## Rules

- **Always** ask user if a prototype's status should be changed to "Implemented" when its component is fully implemented in production
- **Never** create version suffixes (v2, v3)
- **Never** skip the date meta tag
- **Never** leave status undefined
- **Never** duplicate existing prototypes -- expand them instead
- **Always** document at least 3 design decisions
- **Always** include theme toggle support (light/dark)
- **Always** use InboxKey design tokens (not hardcoded colors)
- **Always** check for related existing prototypes before creating new ones
- **Never** create custom components IF there are shared/reusable variants of that "nearly" identical component. If not, you can create but you must make it reusable/shareable in the `/shared` folder.

## File Operations

When asked to create a prototype:

1. Search existing prototypes in the same category
2. If similar exists, propose expanding it instead
3. Follow naming conventions (kebab-case, no versions)
4. Include edge cases section
5. Document minimum 3 design decisions
6. Add theme toggle support
7. Use design tokens from `shared/tokens.css`

When asked to update a prototype:

1. Update the `<meta name="date">` tag
2. Update `<meta name="status">` if lifecycle changes
3. Add new decisions (never remove without approval)
4. Preserve existing content

## Category Guidelines

| Category | Purpose |
|----------|---------|
| `settings/` | Options page prototypes (accounts, appearance, security, about tabs) |
| `popup/` | Popup panel prototypes (code cards, link cards, empty/loading states) |
| `dialogs/` | Overlay prototypes (modals, toasts, confirmations, alerts) |
| `components/` | Shared component prototypes (buttons, inputs, badges, tabs, trust indicators) |
| `content/` | Content script UI prototypes (autofill chip, notification bar, inline prompts) |

---

## Journey Prototype Pattern

For multi-stage user journeys with many states/edge cases.

### When to Use

- Account connection flows (disconnected -> authenticating -> connected -> error)
- Onboarding sequences
- Complex features spanning multiple views
- Features with many edge cases needing interactive testing

### Structure

```
feature-name/
├── index.html         # Main showcase with interactive controls
├── stage-1.html       # Individual stage demos
├── stage-2.html
└── decisions.json     # Centralized, grouped decisions
```

### Key Techniques

1. **Interactive state controls** - Toggles/dropdowns to test edge cases without code changes
2. **Journey progress visualization** - Progress bar showing user lifecycle position
3. **Grouped decisions** - Domain-specific decisions in shared JSON
4. **Layered showcases** - Full journey demo + focused individual demos
