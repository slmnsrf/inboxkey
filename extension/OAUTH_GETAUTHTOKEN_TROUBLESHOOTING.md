# chrome.identity.getAuthToken() Troubleshooting Guide

## Error: "Authorization page could not be loaded"

This error occurs when Chrome cannot load Google's OAuth authorization page. Follow these steps in order.

---

## ✅ Step 1: Verify Extension ID Matches OAuth Client

Your extension ID: `mioicbneapdjamkppcidooggnmegpocn`

**Check in Google Cloud Console:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth client: `InboxKey Extension` or similar
3. Click on it to open details
4. **Verify "Item ID" field shows**: `mioicbneapdjamkppcidooggnmegpocn`

❌ If Item ID is different or empty:
- Edit the OAuth client
- Set Item ID to: `mioicbneapdjamkppcidooggnmegpocn`
- Save changes
- Wait 2-5 minutes for changes to propagate

---

## ✅ Step 2: Verify OAuth Client Type

**Check in Google Cloud Console:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on your OAuth client
3. **Verify "Application type" shows**: "Chrome extension"

❌ If it shows "Web application" or other:
- You cannot change the type after creation
- Create a NEW OAuth client:
  - Click "CREATE CREDENTIALS" → "OAuth client ID"
  - Select "Chrome extension"
  - Set Item ID: `mioicbneapdjamkppcidooggnmegpocn`
  - Copy the new Client ID
  - Update manifest.json with new client ID
  - Rebuild extension

---

## ✅ Step 3: Enable Gmail API

**Check in Google Cloud Console:**
1. Go to: https://console.cloud.google.com/apis/library/gmail.googleapis.com
2. **Should show "MANAGE" button** (not "ENABLE")

❌ If it shows "ENABLE":
- Click "ENABLE"
- Wait for API to be enabled (30 seconds)
- Try authentication again

---

## ✅ Step 4: Configure OAuth Consent Screen

**Check in Google Cloud Console:**
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Verify these settings:

**Required fields:**
- ✅ App name: Set (e.g., "InboxKey")
- ✅ User support email: Your email
- ✅ Developer contact email: Your email
- ✅ App domain (optional but recommended)

**Publishing status:**
- ✅ Can be "Testing" (for development)
- ✅ Can be "In production" (for published extensions)

❌ If consent screen is not configured:
1. Click "CONFIGURE CONSENT SCREEN"
2. Select "External" user type
3. Fill in required fields:
   - App name: InboxKey
   - User support email: your-email@gmail.com
   - Developer contact: your-email@gmail.com
4. Click "SAVE AND CONTINUE"
5. On Scopes page: Click "ADD OR REMOVE SCOPES"
   - Search for "Gmail API"
   - Select: `https://www.googleapis.com/auth/gmail.readonly`
   - Click "UPDATE"
6. Click "SAVE AND CONTINUE"
7. Leave in "Testing" mode for now

---

## ✅ Step 5: Add Test Users (CRITICAL if in Testing mode)

**If your OAuth consent screen is in "Testing" status:**

1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Scroll to **"Test users"** section
3. **Your Gmail account MUST be listed here**

❌ If your email is NOT listed:
1. Click "+ ADD USERS"
2. Enter your Gmail email address
3. Click "SAVE"
4. Wait 1-2 minutes
5. Try authentication again

**Why this matters:** In Testing mode, ONLY test users can authenticate. Everyone else gets "access_denied" or cannot load the authorization page.

---

## ✅ Step 6: Verify Manifest.json Configuration

**Check your built manifest:**
```bash
cat /home/dev/work/inboxkey/extension/build/chrome-mv3-prod/manifest.json | grep -A 3 oauth2
```

**Should show:**
```json
"oauth2": {
  "client_id": "63223580830-n7gddqh5fdl1hip8m47f4eud9c239i3c.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
}
```

**And permissions must include:**
```json
"permissions": ["identity", "storage", "alarms", "tabs"]
```

❌ If oauth2 or permissions are wrong:
- Fix in `/home/dev/work/inboxkey/extension/package.json`
- Rebuild: `npm run build`
- Reload extension in Chrome

---

## ✅ Step 7: Check Browser Console for Detailed Errors

1. Right-click extension icon → "Inspect popup"
2. Go to Console tab
3. Try connecting Gmail again
4. Look for error messages

**Common error messages and fixes:**

### "OAuth2 not granted or revoked"
- You're not signed in to Chrome with a Google account
- **Fix**: Sign in to Chrome (chrome://settings/people)

### "The user did not approve access"
- You cancelled the OAuth flow
- **Fix**: Try again and click "Allow"

### "Access blocked: InboxKey has not completed the Google verification process"
- OAuth consent screen is not properly configured
- **Fix**: Complete Steps 4 and 5 above

### "Error 400: invalid_request"
- Client ID mismatch
- **Fix**: Verify Step 6 above

---

## ✅ Step 8: Test with OAuth Playground (Optional)

To verify your OAuth client works independently:

1. Go to: https://developers.google.com/oauthplayground
2. Click gear icon (⚙️) top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID
5. Leave Client secret empty
6. In Step 1, select "Gmail API v1"
7. Select scope: `https://www.googleapis.com/auth/gmail.readonly`
8. Click "Authorize APIs"

✅ If this works: Your OAuth client is configured correctly
❌ If this fails: Check Steps 1-5 again

---

## 🔍 Quick Diagnostic Checklist

Run through this checklist:

- [ ] OAuth client type is "Chrome extension"
- [ ] Item ID matches extension ID: `mioicbneapdjamkppcidooggnmegpocn`
- [ ] Gmail API is enabled
- [ ] OAuth consent screen is configured with app name and emails
- [ ] You are added as a test user (if in Testing mode)
- [ ] manifest.json has correct client_id and oauth2 configuration
- [ ] Extension has "identity" permission
- [ ] You are signed in to Chrome with a Google account
- [ ] Extension is loaded in Chrome and reloaded after build

---

## 🚨 Most Common Causes (in order)

1. **Test users not added** (80% of cases)
   - Fix: Add yourself in OAuth consent screen → Test users

2. **OAuth consent screen not configured** (10% of cases)
   - Fix: Complete consent screen setup in Step 4

3. **Gmail API not enabled** (5% of cases)
   - Fix: Enable Gmail API in Step 3

4. **Item ID doesn't match extension ID** (3% of cases)
   - Fix: Update Item ID in OAuth client in Step 1

5. **Wrong OAuth client type** (2% of cases)
   - Fix: Create new Chrome extension OAuth client in Step 2

---

## 📞 Still Not Working?

If you've completed all steps above and still get the error:

1. **Wait 5-10 minutes** - Google Cloud changes can take time to propagate
2. **Clear Chrome cache**: `chrome://settings/clearBrowserData` (Cached images and files)
3. **Reload extension**: Go to `chrome://extensions`, find InboxKey, click reload
4. **Sign out and sign in to Chrome**: chrome://settings/people
5. **Try incognito mode** with extension enabled

If still failing, share:
- Screenshot of OAuth client details page
- Screenshot of OAuth consent screen Test users section
- Full error message from browser console
