# OAuth Debug Checklist for Reviewer Extension

## Extension Info
- Extension ID: `ckoligcnfoocpedojakdnncmhlfncogn`
- Client ID: `63223580830-hogfiq2aue7urfjal2jrsj4biaussk3a`

## Steps to Debug

### 1. Verify You're Signed Into Chrome
1. Go to `chrome://settings/people`
2. Confirm you're signed in with your Google account
3. The email should match the test user you added

### 2. Check OAuth Client Configuration
Go to: https://console.cloud.google.com/apis/credentials

Find client: `63223580830-hogfiq2aue7urfjal2jrsj4biaussk3a`

**Verify these exact settings:**
- ✅ Application type: **Chrome extension**
- ✅ Item ID: **ckoligcnfoocpedojakdnncmhlfncogn**
- ✅ Name: InboxKey DEVELOPMENT REVIEW TESTER (or similar)

### 3. Check Gmail API is Enabled IN THE SAME PROJECT
1. Note the **Project ID** or **Project Name** at the top of the credentials page
2. Go to: https://console.cloud.google.com/apis/library/gmail.googleapis.com
3. Verify you're in the **SAME PROJECT** (check project selector at top)
4. Should show **"MANAGE"** button (not "ENABLE")

### 4. Check OAuth Consent Screen Scopes
Go to: https://console.cloud.google.com/apis/credentials/consent

Click "EDIT APP" → Navigate to "Scopes" page

**Verify this scope is listed:**
- ✅ `https://www.googleapis.com/auth/gmail.readonly`
- ✅ Under "Gmail API v1"

### 5. Check Test Users
Still on consent screen page, scroll to "Test users"

**Verify:**
- ✅ Your Gmail email is listed
- ✅ Status shows "Testing" (not "In production")

### 6. Test with Browser Console

1. Right-click the extension icon → "Inspect popup"
2. Go to **Console** tab
3. Reload the extension: `chrome://extensions/` → Click reload button
4. Click extension icon → ACCOUNTS tab
5. Click "Connect Gmail"
6. Watch console for these messages:
   - "Cleared cached token" (if there was one)
   - "Got token: ya29..." (token starts with ya29)
   - Any error messages

### 7. Manual Token Test

If you see "Got token: ya29...", copy the full token from console, then test it:

```bash
# Replace YOUR_TOKEN with the actual token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://gmail.googleapis.com/gmail/v1/users/me/profile
```

**Expected response:**
```json
{
  "emailAddress": "your-email@gmail.com",
  "messagesTotal": 12345,
  "threadsTotal": 6789
}
```

**If you get 401:** The token is invalid. This means:
- Gmail API not enabled in the correct project
- OAuth client not linked to the project
- Scope not properly configured

### 8. Nuclear Option: Create New OAuth Client

If nothing works, create a completely new OAuth client:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "CREATE CREDENTIALS" → "OAuth client ID"
3. Select "Chrome extension"
4. Item ID: `ckoligcnfoocpedojakdnncmhlfncogn`
5. Click "CREATE"
6. Copy the new Client ID
7. Update `/apps/reviewer/package.json`:
   ```json
   "oauth2": {
     "client_id": "NEW_CLIENT_ID_HERE.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
   }
   ```
8. Rebuild: `cd apps/reviewer && pnpm run build`
9. Reload extension in Chrome
10. Try connecting Gmail again

---

## Common Issues

### "OAuth2 not granted or revoked"
- You're not signed into Chrome with a Google account
- Fix: Sign in at `chrome://settings/people`

### 401 "invalid authentication credentials"
- Gmail API not enabled
- OAuth client in different project than Gmail API
- Token has wrong scopes
- Test user not added

### "Authorization page could not be loaded"
- Item ID doesn't match extension ID
- OAuth client is "Web application" instead of "Chrome extension"
- Need to create new OAuth client

### "Access blocked: App not verified"
- OAuth consent screen not configured
- Test user not added (when in Testing mode)
