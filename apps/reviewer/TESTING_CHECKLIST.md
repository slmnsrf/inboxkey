# InboxKey Reviewer - Manual Testing Checklist

## Pre-Test Setup
- [ ] Extension built successfully: `pnpm run build`
- [ ] Loaded unpacked extension in Chrome
- [ ] Extension icon visible in toolbar

## Test 1: OAuth Authentication
- [ ] Click extension → ACCOUNTS tab
- [ ] Click "Connect Gmail" → OAuth flow completes
- [ ] Gmail account appears in list with email address
- [ ] Click "Connect Outlook" → OAuth flow completes
- [ ] Outlook account appears in list
- [ ] Click "Disconnect" on Gmail → account removed
- [ ] Reconnect Gmail for next tests

## Test 2: Batch Fetching
- [ ] Go to TESTING tab
- [ ] Set date range (last 30 days)
- [ ] Set batch size: 50
- [ ] Click "Prepare Batch"
- [ ] Status shows "Fetching messages..."
- [ ] Status updates to "Prepared X messages"
- [ ] Message count shows correct number

## Test 3: Pre-Tagging
- [ ] Click "Run Pre-Tag"
- [ ] Status shows "Pre-tagging..."
- [ ] Status updates to "Pre-tagging complete"
- [ ] Pre-tagged count matches message count

## Test 4: Review UI
- [ ] Email list appears with subjects and pre-tags
- [ ] Click first email → becomes selected (highlighted)
- [ ] Preview panel shows email content
- [ ] Candidates highlighted in preview
- [ ] Pre-tag stats show correct values

## Test 5: Labeling
- [ ] Click "TRUE" button → auto-advances to next email
- [ ] Select another email
- [ ] Click "FALSE" → dropdown appears
- [ ] Select "False Positive" → click Submit
- [ ] Select another email
- [ ] Click "MISSED" → input field appears
- [ ] Enter correct value → click Submit
- [ ] Select reason chips → become highlighted
- [ ] Enter note text → saves with label

## Test 6: Export
- [ ] Click "Export JSONL"
- [ ] Browser shows download prompt
- [ ] File downloads: `inboxkey-labels-YYYY-MM-DD.jsonl`
- [ ] Open file in text editor
- [ ] Verify JSON structure (one object per line)
- [ ] Check labeled emails have correct label values

## Test 7: HOW IT WORKS Tab
- [ ] Navigate to HOW IT WORKS tab
- [ ] Content displays correctly
- [ ] All sections readable and formatted

## Test 8: Edge Cases
- [ ] Prepare batch with 0 results → shows appropriate message
- [ ] Pre-tag with no messages → shows error or warning
- [ ] Label same email twice → updates existing label
- [ ] Export with no labels → exports with default "TRUE" labels

## Success Criteria
All checkboxes above must pass for release to testers.
