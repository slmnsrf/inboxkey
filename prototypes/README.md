# Prototypes

Internal design wireframes and UI explorations for InboxKey. A mini, dev-friendly version of Figma -- a place to iterate on component designs before production implementation.

All prototypes are **standalone HTML files** that open directly in any browser. No build step required.

## Status Lifecycle

| Status | Description |
|--------|-------------|
| Ideation | Early concept, not ready for implementation |
| Approved | Design approved, ready for implementation |
| Implemented | Integrated into production codebase |
| Archived | Deprecated or superseded |

## Folder Structure

```
prototypes/
├── settings/     # Options page prototypes (accounts, appearance, security, about)
├── popup/        # Popup panel prototypes (code cards, link cards, empty states)
├── dialogs/      # Overlays (modals, toasts, confirmations)
├── components/   # Shared component prototypes (buttons, inputs, badges, tabs)
├── content/      # Content script UI prototypes (autofill chip, notification bar)
├── shared/       # Reusable prototype utilities (tokens.css, theme-switcher.js)
├── README.md     # This file
└── CLAUDE.md     # AI assistant rules
```

## Prototype Format

Each prototype is a self-contained HTML file with:

1. **Embedded design tokens** (from `shared/tokens.css` or inline)
2. **Theme toggle** (light/dark mode switcher)
3. **Design decisions** documented in a `<script type="application/json" id="decisions">` block
4. **Multiple states/variations** shown on one page when applicable

### Template Structure

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Prototype Name] - InboxKey Prototype</title>
  <link rel="stylesheet" href="../shared/tokens.css">
  <style>
    /* Prototype-specific styles */
  </style>
</head>
<body>
  <!-- Theme toggle -->
  <div class="proto-toolbar">...</div>

  <!-- Prototype content -->
  <main class="proto-canvas">...</main>

  <!-- Design decisions (MANDATORY) -->
  <script type="application/json" id="decisions">
  [
    "Decision Title - Explanation of why this choice was made."
  ]
  </script>

  <script src="../shared/theme-switcher.js"></script>
</body>
</html>
```

## Journey Prototype Pattern

For multi-stage user journeys with many states/edge cases:

### Structure
```
feature-name/
├── index.html         # Main showcase with interactive controls
├── stage-1.html       # Individual stage demos
├── stage-2.html
└── decisions.json     # Centralized, grouped decisions
```

### Key Techniques

1. **Interactive state controls** - Toggles/dropdowns to test edge cases without editing code
2. **Journey progress visualization** - Visual progress bar showing current position in user lifecycle
3. **Grouped decisions** - Domain-specific decisions in a shared JSON file

### When to Use

- User onboarding flows with multiple steps
- Lifecycle-based features (e.g., account states: disconnected -> connecting -> connected -> error)
- Complex features spanning multiple pages/views
- Features with many edge cases that need interactive testing

## Naming Convention

### Files
- **kebab-case**: `feature-name.html`
- **No version suffixes**: `feature-name.html` not `feature-name-v2.html`
- **Descriptive**: `accounts-panel.html` not `ap.html`

## Avoiding Duplication

Before creating a new prototype:

1. Check if a related prototype already exists in the category
2. If similar functionality exists, **expand the existing prototype** instead of creating a new one

Examples:
- Adding a new card variant? Expand the existing card prototype
- New modal type? Add it to the existing dialog prototype
- Similar settings layout? Extend the existing settings prototype

## Adding a New Prototype

1. Create file in the appropriate category folder
2. Include the shared `tokens.css` (link or inline)
3. Add theme toggle support
4. **Document design decisions in `<script type="application/json" id="decisions">`** (REQUIRED)
5. Include edge case demonstrations where relevant

## Design Decisions (MANDATORY)

Every prototype MUST document its design decisions in a JSON script block.

### Format

Each decision follows the pattern: `"[Brief Title] - [Explanation of why]"`

### What to Document

- **UX Patterns**: Why this interaction pattern over alternatives
- **Layout Choices**: Why elements are positioned/grouped this way
- **State Management**: How loading, error, empty states are handled
- **Visual Hierarchy**: Why certain elements are emphasized
- **Accessibility**: Keyboard navigation, screen reader considerations
- **Trade-offs**: What was sacrificed and why

### Minimum Requirements

- Simple prototypes: 3 decisions minimum
- Complex prototypes (multi-step flows): 5 decisions minimum

## Encouraged Practices

### Full Context Design

For page-level prototypes, design with the full layout context:
- Include header, tab navigation, and surrounding UI elements
- Show how the feature fits into the actual extension page
- Demonstrate the complete user journey

### Edge Cases

Include edge case showcases in prototypes:
- Empty states
- Loading states
- Error states
- Long text overflow
- Dark mode rendering
- Accessibility edge cases

## Transitioning to Production

When moving a prototype to production:

1. Update status to `Implemented`
2. Update the date
3. Reference the production component location in the description
4. Keep the prototype for documentation purposes (or archive if redundant)
