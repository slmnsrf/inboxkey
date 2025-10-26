# WIP: Unified Recent Items (Codes + Links)

**Status:** IN PROGRESS
**Started:** 2025-10-26
**Assignee:** Lead Developer (Orchestrator)
**User Requirement:** Option 2 with MAX=5, no badges

---

## Objective

Unify Recent Codes and Magic Links sections into single "Recent Items" list:
- **Problem:** Empty "Codes" section wastes space when only links arrive
- **Solution:** Single priority-sorted list, MAX_ITEMS = 5
- **Design:** No badges, action buttons differentiate types (Copy vs Open)

---

## Architecture Summary

### Data Flow
```
PopupItem[] (unified, scored, sorted)
  ↓
sortedItems.slice(0, 5)  ← NEW: Take top 5 regardless of type
  ↓
separateItems() for legacy format (backward compat)
  ↓
RecentItemsSection (unified display)
  ├─ CodeCard (if kind === 'code')
  └─ LinkCard (if kind === 'link')
```

### Key Changes
- Config: `MAX_ITEMS = 5` (replaces MAX_CODES=3, MAX_LINKS=3)
- Cache: Slice unified list instead of separating first
- UI: Single section component (replaces 2 separate sections)
- Visual: Subtle background tints + action button text for clarity

---

## Implementation Checklist

### ✅ Phase 1: Configuration & Types
- [ ] TODO-01: Update MAX_ITEMS config constant
- [ ] TODO-02: Add unified item message type

### Phase 2: Backend Data Layer
- [ ] TODO-03: Update popup-cache to slice unified list
- [ ] TODO-04: Add unified item converter (optional)

### Phase 3: UI Components (UI-UX Review Required)
- [ ] TODO-05: Create RecentItemsSection component
- [ ] TODO-06: Update popup.tsx to use RecentItemsSection
- [ ] TODO-07: Update EmptyState for unified variant

### Phase 4: i18n & Copy (UI-UX Review Required)
- [ ] TODO-08: Add unified section i18n strings

### Phase 5: Visual Styling (UI-UX Review Required)
- [ ] TODO-09: Add CSS for unified card list
- [ ] TODO-10: Update card actions to include icons (optional)

### Phase 6: Testing & QA
- [ ] TODO-11: Update unit tests for popup-cache
- [ ] TODO-12: Update integration tests for popup rendering
- [ ] TODO-13: QA-OPS validation (L2)

### Phase 7: Cleanup
- [ ] TODO-14: Remove deprecated components (after 2 weeks)

---

## Progress Log

### 2025-10-26 - Session 1
- ✅ Consulted architect (ultrathink analysis complete)
- ✅ Created WIP tracking file
- ⏳ Starting Phase 1: Configuration changes

---

## Risk Mitigation

**Rollback Plan:** Feature flag in popup-config.ts (2-hour recovery)
**Rollback Trigger:** >5 complaints OR >10% popup open time increase

**Testing Gates:**
1. UI-UX approval (Phase 3-5)
2. QA-OPS L2 validation (Phase 6)
3. Accessibility audit

---

## Files Affected

**Modified:**
- `/src/lib/popup/popup-config.ts` (5 lines)
- `/src/background/popup-cache.ts` (15 lines)
- `/src/shared/popup-messages.ts` (10 lines)
- `/src/popup.tsx` (40 lines)
- `/_locales/en/messages.json` (5 lines)

**Created:**
- `/src/ui/components/RecentItemsSection.tsx` (60 lines)

**Deprecated (keep for rollback):**
- `/src/ui/components/CodeListSection.tsx`
- `/src/ui/components/MagicLinkSection.tsx`

---

## Next Actions

1. Start Phase 1 (Configuration) - no UI impact
2. Complete Phase 2 (Backend) - cache logic changes
3. Request UI-UX pre-review before Phase 3
4. Implement Phase 3-5 (UI changes)
5. Request UI-UX post-review
6. Execute Phase 6 (QA-OPS validation)
7. Ship when all gates pass

**Estimated Completion:** 1-2 days
