/**
 * OAuth Debug Utility
 *
 * Helps diagnose OAuth configuration issues by showing all relevant information
 */

import { GMAIL_CONFIG } from './config'

export function debugOAuthSetup() {
  console.group('🔍 DETAILED OAUTH DEBUG INFORMATION')

  console.log('1️⃣ Extension Information:')
  console.log('   Extension ID (chrome.runtime.id):', chrome.runtime.id)
  console.log('   Extension URL:', chrome.runtime.getURL(''))

  console.log('\n2️⃣ Chrome Identity API:')
  console.log('   Available:', typeof chrome.identity !== 'undefined')
  console.log('   getRedirectURL():', chrome.identity?.getRedirectURL())
  console.log('   getRedirectURL("oauth2"):', chrome.identity?.getRedirectURL('oauth2'))

  console.log('\n3️⃣ Current Configuration:')
  console.log('   Client ID:', GMAIL_CONFIG.clientId)
  console.log('   Redirect URI:', GMAIL_CONFIG.redirectUri)
  console.log('   Auth URL:', GMAIL_CONFIG.authUrl)
  console.log('   Scopes:', GMAIL_CONFIG.scopes)

  console.log('\n4️⃣ Google Cloud Console Setup:')
  console.log('   ⚠️  VERIFY THESE IN GOOGLE CLOUD CONSOLE:')
  console.log('   → OAuth client type: Web application')
  console.log('   → Expected redirect URI: ' + chrome.identity?.getRedirectURL('oauth2'))
  console.log('   → Client ID matches: ' + GMAIL_CONFIG.clientId)
  console.log('   → Gmail API enabled in this project')

  console.log('\n5️⃣ Checklist:')
  console.log('   ☐ OAuth client type is set to Web application')
  console.log('   ☐ Test user email is added in consent screen')
  console.log('   ☐ Gmail API is enabled')
  console.log('   ☐ Waited 5-10 minutes after saving OAuth client')

  console.log('\n📋 Copy this to verify in Google Cloud Console:')
  console.log('Extension ID:', chrome.runtime.id)
  console.log('Authorized Redirect URI to add:', chrome.identity?.getRedirectURL('oauth2'))

  console.groupEnd()
}
