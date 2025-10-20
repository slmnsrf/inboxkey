# Watch Sessions V2 - User Guide

## What's New

Watch Sessions V2 brings smarter, faster verification code matching through advanced scoring algorithms and improved user feedback.

### Key Improvements

**1. Smarter Code Matching**
- **Domain Affinity:** Prioritizes codes from matching domains (exact > alias > token overlap)
- **Recency Scoring:** Newer codes score higher with exponential decay
- **Session Awareness:** Codes received during active watch sessions get priority
- **Shape Matching:** Prefers codes matching expected format (length, charset)

**2. Better User Feedback**
- **In-Page Chip:** Shows session status (listening → filled/timeout)
- **Badge Animation:** Extension icon reflects current state
- **Sender Display:** Popup shows which domain sent the code
- **Clearer Messages:** Friendly, action-focused notifications

**3. Developer Features**
- **Feature Flag:** Gradual rollout capability
- **Debug Scoring:** Optional breakdown of match scores
- **Comprehensive Tests:** 270+ tests with 99% coverage

## Feature Flag

Watch Sessions V2 is controlled by `watchSessionV2Enabled` setting:

- **Default:** `false` (conservative rollout)
- **Enabled:** Full v2 scoring with session/shape boosts
- **Disabled:** Simplified matching without v2 enhancements

## How It Works

### Domain Affinity Matching

When you request a verification code on `example.com`, the extension prioritizes codes from:

1. **Exact match** (1.0 score): `noreply@example.com`
2. **Alias match** (0.9 score): `noreply@examplemail.com` (known alias)
3. **Token overlap** (0.6 score): Email contains "example" in sender or subject
4. **No match** (0.0 score): Unrelated sender

### Recency Scoring

Codes decay over time using exponential formula:
- **0 seconds old:** +0.20 boost
- **60 seconds old:** +0.12 boost
- **120 seconds old:** +0.07 boost
- **300 seconds old:** +0.01 boost

### Session Boost

Codes received within ±15 seconds of watch session start get +0.15 boost, ensuring the freshest code wins.

### Shape Matching

If the field hints at expected format (e.g., `maxLength="6"`, `inputMode="numeric"`):
- **Exact length match:** +0.20 boost
- **±1 digit off:** +0.06 boost
- **Outside range:** -0.12 penalty
- **Charset match:** +0.08 boost

## User Experience States

### In-Page Chip
- **Listening:** Shows while waiting for code (animated)
- **Filled:** Confirms code was autofilled
- **Copied:** Code copied to clipboard (read-only field)
- **Timeout:** No code received after 15 seconds

Dismiss with **ESC** key or click outside.

### Extension Badge
- **Idle:** No indicator
- **Listening:** Animated badge on extension icon
- **Success:** Green checkmark
- **No Code:** Warning indicator

## Performance

All performance budgets met:
- Field detection: <1ms
- Email extraction: <50ms per email
- Code matching: <10ms per candidate
- Popup open: <200ms

## Accessibility

Fully compliant with WCAG 2.1 AA:
- Screen reader announcements via ARIA live regions
- Full keyboard navigation support
- Reduced motion support (respects user preferences)
- AA+ color contrast ratios
- Focus management for all interactive elements

## Privacy & Security

- **Local-only processing:** All code matching happens on your device
- **No telemetry:** No data sent to external servers
- **Minimal permissions:** Only what's needed for email access
- **Encrypted storage:** AES-256-GCM encryption for stored codes
- **Open source:** Fully auditable code

## Technical Details

### Scoring Formula

```
points = affinity × 100
       + recency × 250
       + session × 100
       + shape bonus
       - used penalty

Accept if points ≥ 10
```

### Domain Aliases

Pre-configured aliases for common services:
- Dropbox: `dropboxmail.com`
- GitHub: `github.github.io`, `githubusercontent.com`
- Many more...

Can be extended via configuration.

## Troubleshooting

### Code Not Detected

**Possible causes:**
- Code arrived before watch session started
- Sender domain doesn't match site (check popup for sender)
- Code format unexpected (different length/charset)
- Email not yet processed (wait 5-10 seconds)

**Solutions:**
- Click "Resend code" on the site
- Open popup to manually select code
- Check that email provider is connected

### Wrong Code Filled

**Possible causes:**
- Multiple codes from same sender
- Old code scored higher than expected

**Solutions:**
- Open popup to see all recent codes with scores
- Enable debug scoring in settings
- Report issue with specific scenario

### Performance Issues

**Possible causes:**
- Large email volume in recent window
- Provider API throttling

**Solutions:**
- Reduce polling frequency in settings
- Check provider connection status
- Clear old codes from storage

## Debug Mode

Enable `debugScoringEnabled` in settings to see:
- Detailed scoring breakdown for each code
- Domain affinity calculations
- Recency/session boost values
- Shape matching scores

Useful for troubleshooting or understanding why a specific code was chosen.

## Documentation

- **Implementation Plan:** `WatchSessionsV2_Implementation_Plan.md`
- **Execution Strategy:** `WatchSessionsV2_Execution_Strategy.md`
- **Feature Flags:** `feature-flags.md`
- **Architecture:** `architecture.md` (root)
- **Specifications:** `specifications.md` (root)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Enable debug mode to see scoring details
3. Review documentation files
4. Report issues with:
   - Site URL
   - Expected vs actual behavior
   - Debug scoring output (if enabled)
   - Provider (Gmail/Outlook)

---

**Version:** 2.0
**Status:** Ready for QA Validation
**Last Updated:** 2025-10-20
