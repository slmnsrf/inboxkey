# InboxKey Reviewer - Developer Tool

**Purpose:** Manual email labeling tool for improving InboxKey's extraction algorithm

**Status:** Internal dev tool - Not for public distribution

---

## Quick Start (5 Steps)

1. **Load Extension:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select: `/home/dev/work/inboxkey/apps/reviewer/build/chrome-mv3-prod/`

2. **Connect Account:**
   - Click extension icon or go to Settings
   - ACCOUNTS tab → Connect Gmail/Outlook

3. **Fetch Batch:**
   - TESTING tab
   - Set filters (date range, from, contains)
   - Click "Prepare Batch"

4. **Pre-Tag:**
   - Click "Run Pre-Tag"
   - Wait for extraction to complete

5. **Review & Export:**
   - Click emails in list to review
   - Label as TRUE/FALSE/MISSED
   - Click "Export JSONL" when done

---

## What Gets Exported

JSONL file format (one JSON object per line):

```json
{
  "msgIdHash": "h123456",
  "provider": "gmail",
  "senderETLD": "dropbox.com",
  "receivedAt": 1738538400000,
  "subject": "Your verification code",
  "preTag": "OTP",
  "candidates": [{"type":"OTP","value":"123456","score":0.85}],
  "label": "TRUE",
  "reasons": [],
  "note": ""
}
```

---

## Building from Source

```bash
cd /home/dev/work/inboxkey/apps/reviewer
pnpm install
pnpm run build
```

Output: `build/chrome-mv3-prod/` (ready to load in Chrome)

---

## Tips for Testers

- **Start small:** 50-100 emails per batch
- **Use filters:** Narrow down to specific senders (e.g., `from:dropbox.com`)
- **Check uncertain ones:** Pre-tags with scores 0.4-0.7 are most likely wrong
- **Add notes:** Explain tricky cases for Claude to understand

---

## Privacy

- ✅ All local processing (no servers)
- ✅ OAuth tokens encrypted in browser storage
- ✅ Email content stays in IndexedDB (local database)
- ✅ JSONL export stays on your device until you share

---

## Troubleshooting

**OAuth fails:**
- Sign into Chrome with your Google account first
- Clear extension storage: `chrome://extensions/` → InboxKey Reviewer → "Clear storage"

**Pre-tag crashes:**
- Reduce batch size to 100
- Check browser console (F12) for errors

**Export fails:**
- Check permissions: `chrome://extensions/` → InboxKey Reviewer → ensure "downloads" enabled

---

## Contact

Questions? Issues? Send JSONL files to the development team via secure channel.

---

**Version:** 0.1.0
**License:** Internal dev tool only

