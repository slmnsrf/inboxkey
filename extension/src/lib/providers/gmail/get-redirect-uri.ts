/**
 * Helper to get the current redirect URI
 *
 * Run this from the browser console to see what redirect URI
 * your extension is actually using
 */

export function getRedirectURI(): string {
  if (typeof chrome !== 'undefined' && chrome.identity) {
    const redirectUri = chrome.identity.getRedirectURL('oauth2')
    console.log('📍 Current Extension Redirect URI:', redirectUri)
    console.log('\n✅ Copy this EXACT redirect URI into Google Cloud Console:')
    console.log('   1. Go to: https://console.cloud.google.com/apis/credentials')
    console.log('   2. Select your OAuth 2.0 Client (type: Chrome extension or Web application)')
    console.log('   3. Ensure the redirect URI matches exactly (including "/oauth2")')
    console.log('   4. Save and wait a minute before retrying OAuth')
    return redirectUri
  }
  return 'chrome.identity not available'
}

// Auto-run when imported
if (typeof window !== 'undefined') {
  console.log('🔍 InboxKey OAuth Debug Helper')
  getRedirectURI()
}
