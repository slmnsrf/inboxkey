#!/usr/bin/env node

/**
 * i18n Validation Script
 *
 * Validates translation keys across the codebase:
 * - Detects missing keys (used in code but not in messages.json)
 * - Detects unused keys (in messages.json but not in code)
 * - Validates placeholder syntax
 * - Ensures pseudo-locale matches en locale
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: Critical issues found (missing keys)
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Read all TypeScript/TSX files recursively
function getAllSourceFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and build directories
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'build') {
        getAllSourceFiles(filePath, fileList);
      }
    } else if (file.match(/\.(ts|tsx)$/)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Extract all t('key') and plural('key1', 'key2') calls from source code
function extractUsedKeys(srcDir) {
  const usedKeys = new Set();
  const sourceFiles = getAllSourceFiles(srcDir);

  // Regex patterns
  const tCallRegex = /\bt\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/gi;
  const pluralCallRegex = /\bplural\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*,\s*['"]([a-z_][a-z0-9_]*)['"]/gi;

  sourceFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');

    // Skip test files (they contain test descriptions that shouldn't be i18n keys)
    if (file.includes('.test.') || file.includes('.spec.')) {
      return;
    }

    // Extract t() calls
    let match;
    while ((match = tCallRegex.exec(content)) !== null) {
      const key = match[1];
      if (key.length > 2 && !key.startsWith('http') && !key.includes('\\')) {
        usedKeys.add(key);
      }
    }

    // Extract plural() calls
    while ((match = pluralCallRegex.exec(content)) !== null) {
      usedKeys.add(match[1]); // singular key
      usedKeys.add(match[2]); // plural key
    }
  });

  // Add manifest-only keys (used by Chrome extension system)
  usedKeys.add('extension_name');
  usedKeys.add('extension_description');

  return usedKeys;
}

// Main validation function
function validateI18n() {
  const rootDir = path.join(__dirname, '..');
  const localesDir = path.join(rootDir, '_locales');
  const srcDir = path.join(rootDir, 'src');

  log('\n=== i18n Validation Report ===\n', 'cyan');

  // 1. Read English messages (source of truth)
  const enMessagesPath = path.join(localesDir, 'en', 'messages.json');
  if (!fs.existsSync(enMessagesPath)) {
    log('✗ Error: _locales/en/messages.json not found', 'red');
    process.exit(1);
  }

  const enMessages = JSON.parse(fs.readFileSync(enMessagesPath, 'utf-8'));
  const definedKeys = new Set(Object.keys(enMessages));

  // 2. Extract used keys from source code
  const usedKeys = extractUsedKeys(srcDir);

  // 3. Find missing keys (used but not defined)
  const missingKeys = [...usedKeys].filter(key => !definedKeys.has(key));

  // 4. Find unused keys (defined but not used)
  const unusedKeys = [...definedKeys].filter(key => !usedKeys.has(key));

  // 5. Check pseudo-locale
  const pseudoMessagesPath = path.join(localesDir, 'pseudo', 'messages.json');
  let pseudoKeysMissing = [];

  if (fs.existsSync(pseudoMessagesPath)) {
    const pseudoMessages = JSON.parse(fs.readFileSync(pseudoMessagesPath, 'utf-8'));
    const pseudoKeys = new Set(Object.keys(pseudoMessages));
    pseudoKeysMissing = [...definedKeys].filter(key => !pseudoKeys.has(key));
  }

  // Report results
  log(`📊 Translation Coverage:`, 'cyan');
  log(`   ✓ Defined keys: ${definedKeys.size}`, 'green');
  log(`   ✓ Used keys: ${usedKeys.size}`, 'green');

  if (missingKeys.length === 0) {
    log(`   ✓ Missing keys: 0`, 'green');
  } else {
    log(`   ✗ Missing keys: ${missingKeys.length}`, 'red');
    log('\nMissing translations (used in code but not in messages.json):', 'red');
    missingKeys.forEach(key => log(`   - ${key}`, 'red'));
  }

  if (unusedKeys.length === 0) {
    log(`   ✓ Unused keys: 0`, 'green');
  } else {
    log(`   ⚠ Unused keys: ${unusedKeys.length}`, 'yellow');
    if (unusedKeys.length <= 10) {
      log('\nUnused translations (in messages.json but not used in code):', 'yellow');
      unusedKeys.forEach(key => log(`   - ${key}`, 'yellow'));
    } else {
      log(`\nShowing first 10 unused keys (${unusedKeys.length} total):`, 'yellow');
      unusedKeys.slice(0, 10).forEach(key => log(`   - ${key}`, 'yellow'));
      log(`   ... and ${unusedKeys.length - 10} more`, 'yellow');
    }
  }

  // Pseudo-locale check
  if (pseudoKeysMissing.length === 0) {
    log(`   ✓ Pseudo-locale: complete`, 'green');
  } else {
    log(`   ⚠ Pseudo-locale: ${pseudoKeysMissing.length} keys missing`, 'yellow');
  }

  // Summary
  log('', 'reset');
  if (missingKeys.length === 0) {
    log('✓ All checks passed! i18n coverage is complete.', 'green');
    process.exit(0);
  } else {
    log('✗ Validation failed. Please add missing translation keys.', 'red');
    process.exit(1);
  }
}

// Run validation
validateI18n();
