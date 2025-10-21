# Deprecated Code

This directory contains code that has been replaced but kept temporarily for reference.

## Contents

### extraction/
Original extraction logic that lived in `/src/lib/extraction/`.

**Status**: REPLACED by `@inboxkey/extraction-core` package
**Date Deprecated**: 2025-10-21
**Reason**: Consolidated to shared package for both main extension and reviewer tool
**Safe to delete**: Yes, after confirming both apps work correctly

**Note**: The `/src/lib/matching/` directory was NOT moved here because it's still actively used by:
- `session-controller.ts` (code matching for watch sessions)
- `popup-cache.ts` (domain affinity and recency scoring)
- `code-fetcher.ts` (finding best matching codes)
- `gmail-parser.ts` and `outlook-parser.ts` (domain extraction)

Only the extraction-specific files from matching (shape-matcher.ts, etc.) were copied to extraction-core.

## Migration Details

The extraction algorithm was consolidated to `/packages/extraction-core/` so that:
- Main extension uses the same algorithm as the reviewer tool
- Algorithm improvements benefit both apps automatically
- Single source of truth for extraction logic

## Next Steps

After verifying both apps work correctly for a few days/weeks:
```bash
rm -rf /home/dev/work/inboxkey/extension/.deprecated/
```
