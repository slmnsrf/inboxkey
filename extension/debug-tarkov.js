/**
 * Tarkov.com Field Detection Debugger
 * Run this in the DevTools console on tarkov.com to diagnose why field isn't detected
 */

console.log('===== INBOXKEY FIELD DETECTION DEBUGGER =====\n');

// 1. Check if extension is loaded
console.log('1. Extension Status:');
const extensionScripts = Array.from(document.querySelectorAll('script')).filter(s =>
  s.src.includes('chrome-extension')
);
console.log('  Extension scripts loaded:', extensionScripts.length);
if (extensionScripts.length > 0) {
  console.log('  ✅ Extension is injected');
  extensionScripts.forEach(s => console.log('    -', s.src.split('/').pop()));
} else {
  console.log('  ❌ Extension NOT injected - check if extension is enabled');
}

// 2. Check for InboxKey logs
console.log('\n2. InboxKey Console Logs:');
console.log('  Check above for logs starting with [InboxKey]');
console.log('  Expected: "[InboxKey] Content script loaded on..."');
console.log('  Expected: "[InboxKey] Initializing content script..."');

// 3. Find the email_code field
console.log('\n3. Field Detection:');
const emailCodeField = document.querySelector('#email_code') ||
                       document.querySelector('[name="email_code"]');

if (!emailCodeField) {
  console.log('  ❌ email_code field NOT FOUND in DOM');
  console.log('  Available input fields:');
  document.querySelectorAll('input').forEach(input => {
    console.log(`    - id="${input.id}" name="${input.name}" type="${input.type}"`);
  });
} else {
  console.log('  ✅ email_code field FOUND');
  console.log('  Field properties:');
  console.log('    id:', emailCodeField.id);
  console.log('    name:', emailCodeField.name);
  console.log('    type:', emailCodeField.type);
  console.log('    placeholder:', emailCodeField.placeholder);
  console.log('    autocomplete:', emailCodeField.getAttribute('autocomplete'));
  console.log('    maxlength:', emailCodeField.maxLength);
  console.log('    visible:', window.getComputedStyle(emailCodeField).display !== 'none');
  console.log('    disabled:', emailCodeField.disabled);
}

// 4. Test exclusion pattern
console.log('\n4. Exclusion Pattern Test:');
const identifier = 'email_code';
const oldEmailPattern = /e[-\s]?mail/i;  // Old buggy pattern
const newEmailPattern = /^e[-\s]?mail$/i;  // Fixed pattern
const codePattern = /(?:code|otp|verify|token|pin|mfa|2fa|twofa|auth|sms)/i;

console.log(`  Testing identifier: "${identifier}"`);
console.log('  Old pattern /e[-\\s]?mail/i.test("email_code"):', oldEmailPattern.test(identifier), '❌ WRONG');
console.log('  New pattern /^e[-\\s]?mail$/i.test("email_code"):', newEmailPattern.test(identifier), '✅ CORRECT');
console.log('  Code pattern matches:', codePattern.test(identifier), '✅');

if (oldEmailPattern.test(identifier) && !newEmailPattern.test(identifier)) {
  console.log('  ⚠️  Field would be EXCLUDED by old pattern (false positive)');
  console.log('  ✅ Field would be DETECTED by new pattern');
}

// 5. Manual detection test
console.log('\n5. Manual Field Detection Test:');
if (emailCodeField) {
  const allInputs = Array.from(document.querySelectorAll('input'));
  const visibleInputs = allInputs.filter(input => {
    const style = window.getComputedStyle(input);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           input.type !== 'hidden' &&
           !input.disabled;
  });

  console.log('  Total inputs:', allInputs.length);
  console.log('  Visible inputs:', visibleInputs.length);
  console.log('  email_code is visible:', visibleInputs.includes(emailCodeField));

  // Test Tier 1 detection manually
  const name = emailCodeField.name?.toLowerCase() || '';
  const id = emailCodeField.id?.toLowerCase() || '';
  const testId = name || id;

  console.log('\n  Tier 1 Detection Logic:');
  console.log('    identifier:', testId);
  console.log('    matches exact pattern /^(code|otp|token)$/i:', /^(code|otp|token|pin|mfa|2fa|twofa|verify|verification)$/i.test(testId));
  console.log('    matches contains pattern (should match "code"):', /(?:code|otp|verify|token|pin|mfa|2fa|twofa|auth|sms)/i.test(testId));
  console.log('    excluded by NEW pattern:', newEmailPattern.test(testId));

  if (newEmailPattern.test(testId)) {
    console.log('    ❌ EXCLUDED (should not happen with new pattern!)');
  } else if (/(?:code|otp|verify|token|pin|mfa|2fa|twofa|auth|sms)/i.test(testId)) {
    console.log('    ✅ SHOULD BE DETECTED (confidence: 90)');
  }
}

// 6. Check extension build version
console.log('\n6. Extension Build Check:');
console.log('  Extension was rebuilt at:', new Date().toISOString());
console.log('  To verify fix was applied:');
console.log('    1. Go to chrome://extensions/');
console.log('    2. Find InboxKey');
console.log('    3. Click "Reload" icon');
console.log('    4. Refresh this page');

// 7. Trigger manual focus detection
console.log('\n7. Manual Focus Test:');
if (emailCodeField) {
  console.log('  Focusing email_code field manually...');
  emailCodeField.focus();
  console.log('  ✅ Field focused - check for [InboxKey] logs above');
  console.log('  Expected log: "[InboxKey] Verification field detected"');
  console.log('  Expected log: "[InboxKey] Watch session started: <uuid>"');
} else {
  console.log('  ❌ Cannot focus - field not found');
}

console.log('\n===== DEBUG COMPLETE =====');
console.log('\nNext Steps:');
console.log('1. Check console logs above for [InboxKey] messages');
console.log('2. If no [InboxKey] logs: Extension not loaded - reload extension');
console.log('3. If logs show "No verification fields found": Detection failed');
console.log('4. If logs show "Verification field detected": Success!');
console.log('5. Share any ERROR messages you see');
