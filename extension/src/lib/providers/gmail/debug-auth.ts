/**
 * Debug OAuth Configuration
 *
 * Run this to check if OAuth is configured correctly
 */

import { GMAIL_CONFIG, isGmailConfigured } from './config'

export function debugGmailOAuth() {
  console.group('🔍 Gmail OAuth Debug Info')

  console.log('1. Client ID Check:')
  console.log('   Configured:', isGmailConfigured() ? '✅ Yes' : '❌ No')
  console.log('   Value:', GMAIL_CONFIG.clientId)
  console.log('   Is placeholder:', GMAIL_CONFIG.clientId.includes('YOUR_CLIENT_ID') ? '❌ Yes' : '✅ No')

  console.log('\n2. Redirect URI:')
  console.log('   Value:', GMAIL_CONFIG.redirectUri)

  console.log('\n3. Auth URL:')
  console.log('   Value:', GMAIL_CONFIG.authUrl)

  console.log('\n4. Scopes:')
  console.log('   Value:', GMAIL_CONFIG.scopes)

  console.log('\n5. Chrome Identity API:')
  console.log('   Available:', typeof chrome !== 'undefined' && chrome.identity ? '✅ Yes' : '❌ No')

  if (typeof chrome !== 'undefined' && chrome.identity) {
    console.log('   getRedirectURL("oauth2"):', chrome.identity.getRedirectURL('oauth2'))
    console.log('   Ensure this matches the Chrome client redirect in Google Cloud Console')
  }

  console.groupEnd()
}
