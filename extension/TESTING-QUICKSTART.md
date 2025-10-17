# Testing Quick Start - Service Worker Lifecycle Prototype

## 🚀 Quick Test (5 minutes)

```bash
# 1. Build
cd /home/dev/work/inboxkey/extension
npm run build

# 2. Open Chrome
# - Go to chrome://extensions
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select: /home/dev/work/inboxkey/extension/build/chrome-mv3-prod/

# 3. Open test page
# File: file:///home/dev/work/inboxkey/extension/tests/fixtures/prototype-test.html

# 4. Open DevTools (F12) on test page

# 5. Open Service Worker console
# - Go to chrome://extensions
# - Find InboxKey
# - Click "service worker" link

# 6. Click "Trigger Watch" button

# 7. Wait ~10 seconds
# Expected: Field fills with "TEST123" and turns green
```

---

## 🔥 Aggressive GC Test (Critical!)

```bash
# Close Chrome completely, then:

# macOS:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --aggressive-extension-gc \
  --load-extension=/home/dev/work/inboxkey/extension/build/chrome-mv3-prod

# Linux:
google-chrome \
  --aggressive-extension-gc \
  --load-extension=/home/dev/work/inboxkey/extension/build/chrome-mv3-prod

# Windows:
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --aggressive-extension-gc \
  --load-extension=C:\path\to\extension\build\chrome-mv3-prod
```

Then run test 40 times, recording success rate.

**Target: 100% success rate**

---

## 📊 What to Look For

### Content Script Console (test page):
```
[InboxKey] Executing poll #1 at t=0ms
[InboxKey] Latency: 45ms  ← Should be <100ms
[InboxKey] Executing poll #2 at t=5000ms
[InboxKey] Executing poll #3 at t=10000ms
[InboxKey] Code received on poll #3: TEST123
[InboxKey] Autofill completed
```

### Service Worker Console:
```
[InboxKey] Message #: 3
[InboxKey] Fresh wake?: false  ← SW still alive
```

OR (with aggressive GC):
```
[InboxKey] Service worker started...  ← SW restarted
[InboxKey] Fresh wake?: true  ← But message still delivered! ✅
```

---

## ✅ Success Criteria

- [ ] Field autofills with "TEST123" after ~10 seconds
- [ ] Individual message latency <100ms (check console)
- [ ] 100% success rate across 50 iterations
- [ ] Works even when SW restarts (aggressive GC test)
- [ ] No console errors

---

## 📚 Full Documentation

- **Detailed testing guide:** `/home/dev/work/inboxkey/extension/docs/prototypes/MANUAL-TESTING-GUIDE.md`
- **Results template:** `/home/dev/work/inboxkey/extension/docs/prototypes/TASK-1-SW-LIFECYCLE-RESULTS.md`
- **Test fixtures:** `/home/dev/work/inboxkey/extension/tests/fixtures/`

---

## 🐛 Troubleshooting

**Field doesn't autofill:**
- Check extension is enabled (chrome://extensions)
- Check both consoles for errors
- Try reloading extension

**"Service worker" link grayed out:**
- Click it anyway (should work)
- Or go to chrome://serviceworker-internals

**Can't launch with --aggressive-extension-gc:**
- Close Chrome completely first
- Use full path to Chrome executable
- Test without flag first to verify extension works

---

**This test validates the ENTIRE project architecture. Take your time!** 🎯
