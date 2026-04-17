/**
 * Tier 1: Fast-Path Detection with 6-Layer Defense-in-Depth
 *
 * Performance Budget: <0.15ms per field
 *
 * Defense Layers:
 * 1. Cooldown Registry (0.05ms) - Skip already-checked fields
 * 2. Password Attribute Validation (0.01ms) - Reject type=password
 * 3. URL Pattern Validation (0.01ms) - Reject setup/configuration pages
 * 4. Autocomplete + Attribute Matching (0.02ms) - High-confidence patterns
 * 5. Signal Classifier (0.05ms) - Reject authenticator/SMS fields
 * 6. Context Validation (0.05ms) - Multilingual negative keyword detection
 *
 * Critical Fixes:
 * - Hepsiburada: Reject type=password even with autocomplete=one-time-code
 * - Turkish: Reject fields with "şifre", "parola" labels/context
 * - Authenticator: Reject fields with authenticator app signals (moved from Tier 2)
 * - SMS: Reject SMS-only fields (moved from Tier 2)
 * - Cross-validation: All positive matches must pass signal classifier and context validation
 */

import type { CooldownRegistry } from './cooldown-registry'
import { validateContext } from './context-validator'
import { validateURL } from './url-pattern-validator'
import { classifyDeliveryChannel } from './signal-classifier'
import { getAriaDescribedbyText } from './detection-utils'
import { smsFeatureEnabledCache } from './sms-feature-cache'
import type { TextSources } from './types'
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
  /** Detected delivery channels from signal classifier. Absent = ['email'] (default). */
  detectedChannels?: Array<'email' | 'sms' | 'authenticator'>
  /** Detection metadata for debugging */
  metadata?: {
    /** Matched HTML attribute (name, id, autocomplete) */
    matchedAttribute?: string
    /** Defense layer that made the decision */
    layer: 'cooldown' | 'attribute' | 'url-pattern' | 'autocomplete' | 'context' | 'signal-classifier-tier1'
    /** URL when rejected by URL pattern validation */
    url?: string
    /** Delivery channel classification (for signal classifier) */
    channel?: 'email' | 'sms' | 'authenticator'
    /** Matched keywords (for signal classifier) */
    matchedKeywords?: string[]
    /** Detected language (for signal classifier) */
    language?: string | null
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
  const parent = input.parentElement
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
 * Validate field context: signal classifier (Layer 5) + context validation (Layer 6)
 *
 * Shared validation logic extracted from 4 detection branches (autocomplete,
 * exact match, contains match, inputmode+maxlength). Each branch needs the
 * same channel gating and context keyword checks before reporting a positive.
 *
 * @param input - Input field to validate
 * @param cooldown - Cooldown registry (marks rejected on failure)
 * @returns pass:true with textSources on success, pass:false with Tier1Result on rejection
 */
function validateFieldContext(
  input: HTMLInputElement,
  cooldown: CooldownRegistry
): { pass: true; textSources: TextSources; allChannels?: Array<'email' | 'sms' | 'authenticator'> } | { pass: false; result: Tier1Result } {
  const labelText = getLabelText(input)
  const nearbyText = getNearbyText(input)
  const textSources: TextSources = {
    label: labelText,
    placeholder: input.placeholder || '',
    nearbyText,
    ariaLabel: input.getAttribute('aria-label') || '',
    ariaDescribedby: getAriaDescribedbyText(input),
  }

  // Layer 5: Signal Classifier - reject authenticator/SMS-only fields
  const signalClassification = classifyDeliveryChannel(textSources)

  if (signalClassification.channel === 'authenticator') {
    const hasEmailOption = signalClassification.allChannels?.includes('email')
    if (!hasEmailOption) {
      cooldown.markRejected(input)
      return {
        pass: false,
        result: {
          detected: false,
          confidence: 0,
          reason: 'Authenticator app detected (no email option)',
          metadata: {
            layer: 'signal-classifier-tier1',
            channel: 'authenticator',
            matchedKeywords: signalClassification.matchedKeywords,
            language: signalClassification.language,
          },
        },
      }
    }
  }

  if (signalClassification.channel === 'sms') {
    const hasEmailOption = signalClassification.allChannels?.includes('email')
    if (!hasEmailOption && !smsFeatureEnabledCache) {
      cooldown.markRejected(input)
      return {
        pass: false,
        result: {
          detected: false,
          confidence: 0,
          reason: 'SMS-only field detected (no email option)',
          metadata: {
            layer: 'signal-classifier-tier1',
            channel: 'sms',
            matchedKeywords: signalClassification.matchedKeywords,
            language: signalClassification.language,
          },
        },
      }
    }
  }

  // Layer 6: Context Validation - reject password/setup keywords
  // Tier 1 excludes ambient login negatives (e.g. "Sign in" from site nav) because
  // strong attribute matches (autocomplete, name/id, inputmode) provide sufficient
  // positive signal. Login negatives are still checked against direct field context.
  const contextResult = validateContext({
    label: labelText,
    placeholder: input.placeholder || '',
    nearbyText,
    ariaLabel: input.getAttribute('aria-label') || '',
    ariaDescribedby: textSources.ariaDescribedby,
    pageTitle: document.title || '',
  }, { ambientLoginNegatives: 'exclude' })

  if (!contextResult.pass) {
    cooldown.markRejected(input)
    return {
      pass: false,
      result: {
        detected: false,
        confidence: 0,
        reason: `Context validation failed: ${contextResult.matchedNegatives?.join(', ')}`,
        metadata: { layer: 'context' },
      },
    }
  }

  return { pass: true, textSources, allChannels: signalClassification.allChannels }
}

/**
 * Tier 1: Fast-path detection with 6-layer defense
 *
 * Defense layers applied in order:
 * 1. Cooldown check - Skip recently checked fields
 * 2. Password type check - CRITICAL: Reject type=password immediately
 * 3. URL pattern validation - Reject setup/configuration pages
 * 4. Autocomplete + Attribute patterns - High-confidence matches
 * 5. Signal classifier - Reject authenticator/SMS fields (moved from Tier 2)
 * 6. Context validation - Multilingual negative keyword detection
 *
 * Performance: <0.15ms per field
 *
 * Critical Fixes:
 * - Hepsiburada: type=password rejected even with autocomplete=one-time-code
 * - Turkish context: "şifre", "parola" detected and rejected
 * - Authenticator: Reject fields with authenticator app signals BEFORE attribute match returns DETECTED
 * - SMS: Reject SMS-only fields BEFORE attribute match returns DETECTED
 * - Cross-validation: All positive matches validated against signal classifier and context
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
    'motdepasse|mot.?de.?passe|' +           // French (require full phrase; bare "mot"/"passe" false-matched "motif", "remote")
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

  // Descriptive attributes whose text content is already validated by
  // Layer 6 (context validator) with proper OTP allow-lists.
  // Layer 2 only checks programmatic attributes (name, id, data-*, custom).
  const DESCRIPTIVE_ATTRS = new Set(['autocomplete', 'aria-label', 'placeholder'])

  const allAttributes = Array.from(input.attributes)
  for (const attr of allAttributes) {
    if (DESCRIPTIVE_ATTRS.has(attr.name)) {
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
  // Layer 3: URL Pattern Validation (0.01ms)
  // ═══════════════════════════════════════════════════════════════
  // Reject setup/configuration pages before attribute matching
  // Examples: GitHub 2FA setup, Steam Guard setup, Microsoft 2FA setup
  if (!validateURL()) {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      reason: 'Setup/configuration page detected (URL pattern)',
      metadata: {
        layer: 'url-pattern',
        url: window.location.href,
      },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Layer 4: Autocomplete + Attribute Pattern Matching (0.02ms)
  // ═══════════════════════════════════════════════════════════════

  // Check autocomplete attribute (HTML standard) - highest confidence
  const autocomplete = input.getAttribute('autocomplete')?.toLowerCase()
  if (autocomplete && AUTOCOMPLETE_VALUES.includes(autocomplete as any)) {
    const validation = validateFieldContext(input, cooldown)
    if (!validation.pass) return validation.result

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 1.0,
      reason: `autocomplete="${autocomplete}"`,
      detectedChannels: validation.allChannels ?? ['email'],
      metadata: {
        layer: 'autocomplete',
        matchedAttribute: 'autocomplete',
      },
    }
  }

  // Check name/id attributes - exact match (95% confidence)
  if (identifier && ATTRIBUTE_PATTERNS.exact.test(identifier)) {
    const validation = validateFieldContext(input, cooldown)
    if (!validation.pass) return validation.result

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 0.95,
      reason: `name/id="${identifier}" (exact match)`,
      detectedChannels: validation.allChannels ?? ['email'],
      metadata: {
        layer: 'attribute',
        matchedAttribute: name ? 'name' : 'id',
      },
    }
  }

  // Check name/id attributes - contains match (90% confidence)
  if (identifier && ATTRIBUTE_PATTERNS.contains.test(identifier)) {
    const validation = validateFieldContext(input, cooldown)
    if (!validation.pass) return validation.result

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 0.9,
      reason: `name/id="${identifier}" (contains match)`,
      detectedChannels: validation.allChannels ?? ['email'],
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
    const validation = validateFieldContext(input, cooldown)
    if (!validation.pass) return validation.result

    cooldown.markDetected(input)
    return {
      detected: true,
      confidence: 0.85,
      reason: `inputmode="${inputmode}" + maxlength=${maxLength}`,
      detectedChannels: validation.allChannels ?? ['email'],
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
  // IMPORTANT: Don't return metadata.layer='attribute' or 'context' here,
  // as that would cause field-detector to skip Tier2 detection entirely.
  // This would prevent split-input detection (Steam, etc.) from working.
  return {
    detected: false,
    confidence: 0,
    reason: 'No tier1 patterns matched',
    // No metadata - allows Tier2 to run
  }
}
