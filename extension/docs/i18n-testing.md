# i18n Testing Guide

InboxKey uses Chrome's native i18n system for localization. All UI strings are externalized to `_locales/*/messages.json` files and accessed via the `t()` function.

## Quick Reference

- **Translation files:** `_locales/en/messages.json` (English, source of truth)
- **Pseudo-locale:** `_locales/pseudo/messages.json` (for UI testing)
- **i18n utility:** `src/lib/i18n.ts`
- **Validation script:** `scripts/validate-i18n.js`

## Validation

Run the i18n validation script to catch missing or unused translation keys:

```bash
npm run validate:i18n
```

This script checks:
- Missing keys (used in code but not in `messages.json`)
- Unused keys (in `messages.json` but not used in code)
- Pseudo-locale completeness

## Pseudo-Locale Testing

InboxKey includes a pseudo-locale for testing UI layout with expanded/accented text. This helps catch:
- Text overflow and clipping issues
- Hard-coded strings that aren't localized
- Layout problems with longer text

### How to Test with Pseudo-Locale

**Method 1: Temporary swap (quick test)**

```bash
# Backup English locale
cp _locales/en/messages.json _locales/en/messages.json.bak

# Copy pseudo-locale to English
cp _locales/pseudo/messages.json _locales/en/messages.json

# Build and test the extension
npm run build

# Restore original
mv _locales/en/messages.json.bak _locales/en/messages.json
```

**Method 2: Change Chrome language settings**

1. Open `chrome://settings/languages`
2. Add "English (Pseudo)" if available, or modify extension locale manually
3. Reload extension

### What to Look For

When testing with pseudo-locale:

- **Text overflow:** Buttons, cards, and containers should expand or truncate gracefully
- **Clipped text:** No text should be cut off or hidden
- **Layout breaks:** Ensure flex/grid layouts handle longer text
- **Hard-coded strings:** Any text in English needs to be externalized
- **Placeholder issues:** Dynamic content like `$1`, `$CODE$` should render correctly

### Common UI Issues

| Issue | Fix |
|-------|-----|
| Text overflows container | Use `overflow: hidden; text-overflow: ellipsis` or `word-break: break-word` |
| Button text wraps | Increase `min-width` or use `white-space: nowrap` |
| Fixed widths break | Replace `width` with `min-width` or `max-width` |
| Card layout collapses | Use `flex: 1` or `min-width: 0` on flex children |

## Adding New Translations

### 1. Add key to `_locales/en/messages.json`

```json
{
  "new_feature_title": {
    "message": "New Feature",
    "description": "Title for new feature section"
  }
}
```

Always include:
- `message`: The English text (source of truth)
- `description`: Context for translators (very important!)

### 2. Use in code with `t()` function

```tsx
import { t } from '@/lib/i18n';

function MyComponent() {
  return <h2>{t('new_feature_title')}</h2>;
}
```

### 3. Run validation

```bash
npm run validate:i18n
```

This ensures the key is properly added and used.

## Placeholders and Dynamic Content

For strings with dynamic content, use placeholders:

### Simple placeholder (single value)

```json
{
  "welcome_user": {
    "message": "Welcome, $USER$!",
    "description": "Greeting message with username",
    "placeholders": {
      "user": {
        "content": "$1",
        "example": "John"
      }
    }
  }
}
```

Usage:
```tsx
t('welcome_user', 'Alice')  // "Welcome, Alice!"
```

### Multiple placeholders

```json
{
  "aria_copy_code": {
    "message": "Copy code $CODE$ from $SOURCE$",
    "description": "ARIA label for copy code button",
    "placeholders": {
      "code": {
        "content": "$1",
        "example": "123456"
      },
      "source": {
        "content": "$2",
        "example": "user@gmail.com"
      }
    }
  }
}
```

Usage:
```tsx
t('aria_copy_code', ['123456', 'user@gmail.com'])
// "Copy code 123456 from user@gmail.com"
```

## Helper Functions

The `i18n.ts` utility provides several helper functions:

### `plural()` - Handle singular/plural forms

```tsx
import { plural } from '@/lib/i18n';

plural('popup_mailbox', 'popup_mailboxes', 1)  // "1 mailbox"
plural('popup_mailbox', 'popup_mailboxes', 5)  // "5 mailboxes"
```

### `timeAgo()` - Localized relative time

```tsx
import { timeAgo } from '@/lib/i18n';

timeAgo(Date.now())           // "just now"
timeAgo(Date.now() - 120000)  // "2 minutes ago"
```

### `timeAgoShort()` - Compact time format

```tsx
import { timeAgoShort } from '@/lib/i18n';

timeAgoShort(Date.now())           // "now"
timeAgoShort(Date.now() - 300000)  // "5m ago"
```

## Best Practices

1. **Always externalize UI strings**
   - Never hardcode user-facing text
   - Use `t()` for all labels, messages, errors, etc.

2. **Provide clear descriptions**
   - Descriptions help translators understand context
   - Include where/how the string is used

3. **Use placeholders for dynamic content**
   - Don't concatenate strings
   - Use `$PLACEHOLDER$` syntax with examples

4. **Test with pseudo-locale**
   - Catch layout issues early
   - Verify all strings are externalized

5. **Run validation regularly**
   - Before committing changes
   - As part of CI/CD pipeline

6. **Keep keys organized**
   - Group related keys (e.g., `button_*`, `aria_*`, `toast_*`)
   - Use consistent naming conventions

## Troubleshooting

### Key not found error

If you see `[i18n] Missing translation for key: xxx` in console:

1. Check that key exists in `_locales/en/messages.json`
2. Verify spelling matches exactly (case-sensitive)
3. Run `npm run validate:i18n` to check all keys

### Placeholder not working

If `$PLACEHOLDER$` appears literally in UI:

1. Ensure placeholder is defined in `messages.json`
2. Check that `content` matches parameter position (`$1`, `$2`, etc.)
3. Verify you're passing substitutions to `t()` function

### Pseudo-locale not loading

1. Ensure `_locales/pseudo/messages.json` exists
2. Check that keys match `en/messages.json` exactly
3. Rebuild extension after locale changes

## References

- [Chrome i18n API Documentation](https://developer.chrome.com/docs/extensions/reference/i18n/)
- [Chrome i18n Messages Format](https://developer.chrome.com/docs/extensions/mv3/i18n-messages/)
- InboxKey i18n utility: `src/lib/i18n.ts`
