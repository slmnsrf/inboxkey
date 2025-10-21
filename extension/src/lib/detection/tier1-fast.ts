/**
 * Tier 1: Fast-Path Detection with 4-Layer Defense-in-Depth
 *
 * Performance Budget: <0.15ms per field
 *
 * Defense Layers:
 * 1. Cooldown Registry (0.05ms) - Skip already-checked fields
 * 2. Password Attribute Validation (0.01ms) - Reject type=password
 * 3. Autocomplete + Attribute Matching (0.02ms) - High-confidence patterns
 * 4. Context Validation (0.05ms) - Multilingual negative keyword detection
 *
 * Critical Fixes:
 * - Hepsiburada: Reject type=password even with autocomplete=one-time-code
 * - Turkish: Reject fields with "şifre", "parola" labels/context
 * - Cross-validation: All positive matches must pass context validation
 */

import type { CooldownRegistry } from './cooldown-registry'
import { validateContext } from './context-validator'
import {
  ATTRIBUTE_PATTERNS,
  AUTOCOMPLETE_VALUES,
  NUMERIC_INPUT_MODES,
  TYPICAL_CODE_LENGTHS,
  isExcluded,
} from './patterns'

/**
 * Result of Tier 1 fast-path detection
 */
export interface Tier1Result {
  /** True if field is a verification code input */
  detected: boolean
  /** Confidence score 0.0-1.0 */
  confidence: number
  /** Human-readable reason for decision */
  reason: string
  /** Detection metadata for debugging */
  metadata?: {
    /** Matched HTML attribute (name, id, autocomplete) */
    matchedAttribute?: string
    /** Defense layer that made the decision */
    layer: 'cooldown' | 'attribute' | 'autocomplete' | 'context'
  }
}

/**
 * Extract label text from various sources
 *
 * Priority order:
 * 1. <label for="id"> (explicit association)
 * 2. <label> parent (implicit association)
 * 3. aria-label attribute
 * 4. aria-labelledby reference
 *
 * @param input - Input field to extract label from
 * @returns Combined label text
 */
function getLabelText(input: HTMLInputElement): string {
  const labels: string[] = []

  // Check for label element (by 'for' attribute)
  const id = input.id
  if (id) {
    const label = input.ownerDocument?.querySelector(`label[for="${id}"]`)
    if (label?.textContent) {
      labels.push(label.textContent.trim())
    }
  }

  // Check for parent label
  let parent = input.parentElement
  if (parent?.tagName === 'LABEL' && parent.textContent) {
    labels.push(parent.textContent.trim())
  }

  // Check for aria-label
  const ariaLabel = input.getAttribute('aria-label')
  if (ariaLabel) {
    labels.push(ariaLabel)
  }

  // Check for aria-labelledby
  const ariaLabelledby = input.getAttribute('aria-labelledby')
  if (ariaLabelledby) {
    const labelElement = input.ownerDocument?.getElementById(ariaLabelledby)
    if (labelElement?.textContent) {
      labels.push(labelElement.textContent.trim())
    }
  }

  return labels.join(' ')
}

/**
 * Extract nearby text for context validation
 *
 * Searches up to 4 parent levels for sibling text content
 * Used to detect password/login context in 21 languages
 *
 * Performance: Expanded from 2 to 4 levels to handle modern component-based UIs
 * (React/Vue/Angular add 3-5 wrapper divs per component)
 *
 * @param input - Input field to extract nearby text from
 * @returns Combined nearby text
 */
function getNearbyText(input: HTMLInputElement): string {
  const texts: string[] = []
  let element: HTMLElement | null = input
  let levels = 0

  while (element && levels < 4) {
    // Get all text from siblings
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children)
      siblings.forEach((sibling) => {
        if (sibling !== element && sibling instanceof HTMLElement) {
          const text = sibling.textContent?.trim()
          if (text && text.length < 150) {
            // Avoid huge blocks (stricter limit for performance)
            texts.push(text)
          }
        }
      })
    }

    element = element.parentElement
    levels++
  }

  return texts.join(' ')
}

/**
 * Tier 1: Fast-path detection with 4-layer defense
 *
 * Defense layers applied in order:
 * 1. Cooldown check - Skip recently checked fields
 * 2. Password type check - CRITICAL: Reject type=password immediately
 * 3. Autocomplete + Attribute patterns - High-confidence matches
 * 4. Context validation - Multilingual negative keyword detection
 *
 * Performance: <0.15ms per field
 *
 * Critical Fixes:
 * - Hepsiburada: type=password rejected even with autocomplete=one-time-code
 * - Turkish context: "şifre", "parola" detected and rejected
 * - Cross-validation: All positive matches validated against context
 *
 * @param input - Input field to check
 * @param cooldown - Cooldown registry instance
 * @returns Detection result with confidence and metadata
 */
export function detectTier1(
  input: HTMLInputElement,
  cooldown: CooldownRegistry
): Tier1Result {
  // ═══════════════════════════════════════════════════════════════
  // Layer 1: Cooldown Check (0.05ms)
  // ═══════════════════════════════════════════════════════════════
  if (cooldown.isInCooldown(input)) {
    return {
      detected: false,
      confidence: 0,
      reason: 'Field in cooldown period',
      metadata: { layer: 'cooldown' },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Layer 2: Password Attribute Cross-Validation (0.01ms)
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: Reject type=password immediately (Hepsiburada fix)
  // This prevents false positives on password fields that mistakenly
  // have autocomplete="one-time-code"
  if (input.type === 'password') {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      reason: 'Password field detected (type=password)',
      metadata: { layer: 'attribute' },
    }
  }

  // Check ALL attributes for password-related patterns (21 languages)
  // CRITICAL: Catches custom attributes like comefrom="HpAuthSetPassword"
  // Covers: English, Spanish, Portuguese, German, French, Italian, Dutch,
  // Swedish, Finnish, Danish, Norwegian, Polish, Czech, Turkish, Russian,
  // Ukrainian, Arabic, Hindi, Japanese, Korean, Chinese
  //
  // IMPORTANT: Excludes "one-time-password" (valid OTP autocomplete value)
  const passwordAttributePattern = new RegExp(
    '(?!one.?time.?password)(' +            // Negative lookahead for "one-time-password"
    'password|passwd|pwd|' +                // English
    'contraseña|contrasena|clave|' +        // Spanish
    'senha|' +                               // Portuguese
    'passwort|kennwort|' +                   // German
    'motdepasse|mot|passe|' +                // French
    'wachtwoord|' +                          // Dutch
    'lösenord|losenord|' +                   // Swedish
    'salasana|' +                            // Finnish
    'adgangskode|kodeord|' +                 // Danish
    'passord|' +                             // Norwegian
    'hasło|haslo|' +                         // Polish
    'heslo|' +                               // Czech
    'şifre|sifre|parola|' +                  // Turkish
    'пароль|' +                              // Russian + Ukrainian
    'كلمة|المرور|كلمه|السر|' +              // Arabic
    'पासवर्ड|' +                             // Hindi
    'パスワード|' +                           // Japanese
    '비밀번호|' +                             // Korean
    '密码|密碼)',                             // Chinese
    'i'
  )

  const allAttributes = Array.from(input.attributes)
  for (const attr of allAttributes) {
    // Skip autocomplete attribute (already handled by Layer 3)
    if (attr.name === 'autocomplete') {
      continue
    }

    if (
      passwordAttributePattern.test(attr.name) ||
      passwordAttributePattern.test(attr.value)
    ) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        reason: `Password-related custom attribute: ${attr.name}="${attr.value}"`,
        metadata: { layer: 'attribute' },
      }
    }
  }

  // Extract attributes once for reuse
  const name = input.name?.toLowerCase() || ''
  const id = input.id?.toLowerCase() || ''
  const identifier = name || id
  const maxLength = input.maxLength

  // Skip zip codes explicitly FIRST (before general exclusion patterns)
  // This ensures specific rejection message for zip/postal codes
  if (maxLength > 0 && maxLength <= 5 && /zip|postal/i.test(identifier)) {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      reason: 'Zip/postal code detected',
      metadata: { layer: 'attribute' },
    }
  }

  // Skip excluded patterns (CVV, email, username, etc.)
  // Note: This catches "password" in IDs/names, but context validation
  // will also check labels for multilingual password keywords
  if (identifier && isExcluded(identifier)) {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      reason: `Excluded pattern: ${identifier}`,
      metadata: { layer: 'attribute' },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Layer 3: Autocomplete + Attribute Pattern Matching (0.02ms)
  // ═══════════════════════════════════════════════════════════════

  // Check autocomplete attribute (HTML standard) - highest confidence
  const autocomplete = input.getAttribute('autocomplete')?.toLowerCase()
  if (autocomplete && AUTOCOMPLETE_VALUES.includes(autocomplete as any)) {
    // Layer 4: Context validation (check for password keywords)
    const contextResult = validateContext({
      label: getLabelText(input),
      placeholder: input.placeholder || '',
      nearbyText: getNearbyText(input),
      ariaLabel: input.getAttribute('aria-label') || '',
    })

    if (!contextResult.pass) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        reason: `Negative context: ${contextResult.matchedNegatives?.join(', ')}`,
        metadata: { layer: 'context' },
      }
    }

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 1.0,
      reason: `autocomplete="${autocomplete}"`,
      metadata: {
        layer: 'autocomplete',
        matchedAttribute: 'autocomplete',
      },
    }
  }

  // Check name/id attributes - exact match (95% confidence)
  if (identifier && ATTRIBUTE_PATTERNS.exact.test(identifier)) {
    // Layer 4: Context validation
    const contextResult = validateContext({
      label: getLabelText(input),
      placeholder: input.placeholder || '',
      nearbyText: getNearbyText(input),
      ariaLabel: input.getAttribute('aria-label') || '',
    })

    if (!contextResult.pass) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        reason: `Negative context: ${contextResult.matchedNegatives?.join(', ')}`,
        metadata: { layer: 'context' },
      }
    }

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 0.95,
      reason: `name/id="${identifier}" (exact match)`,
      metadata: {
        layer: 'attribute',
        matchedAttribute: name ? 'name' : 'id',
      },
    }
  }

  // Check name/id attributes - contains match (90% confidence)
  if (identifier && ATTRIBUTE_PATTERNS.contains.test(identifier)) {
    // Layer 4: Context validation
    const contextResult = validateContext({
      label: getLabelText(input),
      placeholder: input.placeholder || '',
      nearbyText: getNearbyText(input),
      ariaLabel: input.getAttribute('aria-label') || '',
    })

    if (!contextResult.pass) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        reason: `Negative context: ${contextResult.matchedNegatives?.join(', ')}`,
        metadata: { layer: 'context' },
      }
    }

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 0.9,
      reason: `name/id="${identifier}" (contains match)`,
      metadata: {
        layer: 'attribute',
        matchedAttribute: name ? 'name' : 'id',
      },
    }
  }

  // Check inputmode + maxlength combination (85% confidence)
  const inputmode = input.getAttribute('inputmode')?.toLowerCase()
  if (
    inputmode &&
    NUMERIC_INPUT_MODES.includes(inputmode as any) &&
    maxLength >= TYPICAL_CODE_LENGTHS.min &&
    maxLength <= TYPICAL_CODE_LENGTHS.max
  ) {
    // Layer 4: Context validation
    const contextResult = validateContext({
      label: getLabelText(input),
      placeholder: input.placeholder || '',
      nearbyText: getNearbyText(input),
      ariaLabel: input.getAttribute('aria-label') || '',
    })

    if (!contextResult.pass) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        reason: `Negative context: ${contextResult.matchedNegatives?.join(', ')}`,
        metadata: { layer: 'context' },
      }
    }

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 0.85,
      reason: `inputmode="${inputmode}" + maxlength=${maxLength}`,
      metadata: {
        layer: 'attribute',
        matchedAttribute: 'inputmode',
      },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // No Tier 1 Match
  // ═══════════════════════════════════════════════════════════════
  // Do NOT mark rejected - let Tier 2 try
  return {
    detected: false,
    confidence: 0,
    reason: 'No tier1 patterns matched',
    metadata: { layer: 'attribute' },
  }
}
