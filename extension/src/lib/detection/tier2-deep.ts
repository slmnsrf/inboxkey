/**
 * Tier 2 Deep Analysis Helpers
 *
 * Structural context analysis for verification field detection.
 * Extracted from field-detector.ts for password field false positive fix.
 *
 * Performance target: <0.3ms per function
 */

import type { CooldownRegistry } from './cooldown-registry'
import { validateContext } from './context-validator'
import { classifyDeliveryChannel } from './signal-classifier'
import { classifyNonEmailIntent } from './non-email-contexts'
import { detectSplitInputGroup } from './split-input-detector'
import {
  getAriaDescribedbyText,
  getAriaLabelledbyText,
  getExplicitLabelText,
} from './detection-utils'
import { smsFeatureEnabledCache } from './sms-feature-cache'
import type { TextSources } from './types'
import {
  getLabelMatchStrength,
  getPlaceholderMatchStrength,
  getCodeLengthRangeFromPattern,
  TYPICAL_CODE_LENGTHS,
} from './patterns'


/**
 * P2: High-confidence keywords for nearby text boosting (21 languages).
 *
 * Split into two regexes because JS regex \b operates against the
 * ASCII-only \w class ([A-Za-z0-9_]) regardless of the /i or /u flags.
 * Cyrillic, CJK, Arabic, Hindi, Japanese, Korean, and Chinese characters
 * are all non-\w, so wrapping their keywords in \b...\b silently made
 * them unreachable in natural-language text (where the chars on both
 * sides of the keyword are also non-\w -> no boundary).
 *
 * Split strategy:
 *  - _LATIN (with \b): Latin-alphabet keywords only. Real Latin words
 *    surrounded by spaces/punctuation have proper \w/\W transitions, so
 *    \b works and prevents substring false positives ("code" inside
 *    "barcode").
 *  - _NONLATIN (no \b): everything else. Natural whitespace/punctuation
 *    separation is enough to prevent spurious matches, and skipping \b
 *    makes the keywords actually match.
 */
const HIGH_CONFIDENCE_KEYWORDS_LATIN = new RegExp(
  '\\b(' +
  // English
  'verification|code|otp|one.?time|security.?code|auth|authenticate|' +
  // Spanish/Portuguese
  'código|verificación|verificacao|autenticação|autenticacion|' +
  // German/French
  'bestätigung|vérification|authentification|' +
  // Turkish
  'doğrulama|kod|kimlik' +
  ')\\b',
  'i'
)

// Non-Latin scripts: \b is meaningless here (these characters are not
// \w), so match anywhere within nearby text. Includes Cyrillic, which
// the previous split kept in the Latin arm - rendering Russian/Ukrainian
// keywords unreachable for any natural Cyrillic-surrounded context.
const HIGH_CONFIDENCE_KEYWORDS_NONLATIN = new RegExp(
  // Cyrillic (Russian/Ukrainian)
  'код|верификация|подтверждение|' +
  // Arabic
  'رمز|التحقق|' +
  // Hindi
  'कोड|सत्यापन|' +
  // Japanese
  'コード|認証|確認|ワンタイム|' +
  // Korean
  '코드|인증|확인|' +
  // Chinese
  '验证码|驗證碼|代码|代碼|确认|確認'
)

/**
 * P2: Negative signal keywords for score penalty
 *
 * When nearby text contains these keywords, block all nearby text scoring (0 points).
 * Prevents false positives on password/email fields with "code" in nearby text.
 */
const NEGATIVE_SIGNALS = /\b(password|email.?address|username|phone.?number)\b/i

/**
 * Form context analysis result
 */
export interface FormContext {
  hasPasswordField: boolean
  passwordFieldCount: number
  hasEmailField: boolean
  hasUsernameField: boolean
  formAction: string
}

/**
 * Button intent analysis result
 */
export interface ButtonIntent {
  buttons: string[] // All button texts
  primaryIntent: 'login' | 'verify' | 'signup' | 'reset' | 'unknown'
}

/**
 * Field proximity analysis result
 */
export interface FieldProximity {
  nearbyText: string
  hasEmailField: boolean
  hasUsernameField: boolean
  distanceToNearestField: number
}

/**
 * Analyze form context to detect password fields and form purpose
 *
 * Scans up to 3 parent levels and up to 20 form fields for performance.
 * Used to distinguish login/signup forms from verification code forms.
 *
 * @param input - The input field to analyze
 * @returns Form context with password field detection and form metadata
 */
export function analyzeFormContext(input: HTMLInputElement): FormContext {
  const form = input.closest('form')
  const context: FormContext = {
    hasPasswordField: false,
    passwordFieldCount: 0,
    hasEmailField: false,
    hasUsernameField: false,
    formAction: '',
  }

  // Get form action if available
  if (form?.action) {
    context.formAction = form.action.toLowerCase()
  }

  // Determine search scope (form or parent containers)
  let searchRoot: HTMLElement | null = form
  if (!searchRoot) {
    // Search up to 3 parent levels if no form element
    searchRoot = input.parentElement
    let levels = 0
    while (searchRoot && levels < 2) {
      searchRoot = searchRoot.parentElement
      levels++
    }
  }

  if (!searchRoot) {
    return context
  }

  // Scan for password, email, and username fields (limit to 20 fields for performance)
  const allInputs = searchRoot.querySelectorAll<HTMLInputElement>('input')
  const inputsToScan = Array.from(allInputs).slice(0, 20)

  for (const field of inputsToScan) {
    if (field === input) continue // Skip self

    const type = field.type?.toLowerCase() || 'text'
    const name = field.name?.toLowerCase() || ''
    const id = field.id?.toLowerCase() || ''
    const identifier = name || id

    // Detect password fields
    if (type === 'password') {
      context.hasPasswordField = true
      context.passwordFieldCount++
    }

    // Detect email fields
    if (
      type === 'email' ||
      /^email|e-mail|mail$/i.test(identifier) ||
      field.autocomplete === 'email'
    ) {
      context.hasEmailField = true
    }

    // Detect username fields
    if (
      /^user|username|login|account/i.test(identifier) ||
      field.autocomplete === 'username'
    ) {
      context.hasUsernameField = true
    }
  }

  return context
}

/**
 * Analyze nearby button text to infer form intent
 *
 * Scans up to 3 parent levels for buttons and classifies intent.
 * Helps distinguish verification flows from login/signup/reset flows.
 *
 * @param input - The input field to analyze
 * @returns Button intent classification and all button texts
 */
export function analyzeButtonIntent(input: HTMLInputElement): ButtonIntent {
  const buttons: string[] = []
  let element: HTMLElement | null = input
  let levels = 0

  // Traverse up to 5 parent levels (expanded for component-based UIs)
  while (element && levels < 5) {
    if (element.parentElement) {
      // Query for buttons, submit inputs, and common button-styled links
      const buttonElements = element.parentElement.querySelectorAll(
        'button, input[type="submit"], a.button, a[role="button"]'
      )

      for (const button of buttonElements) {
        let text: string | undefined

        // For submit inputs, use value attribute instead of textContent
        if (button instanceof HTMLInputElement && button.type === 'submit') {
          text = button.value?.trim()
        } else {
          text = button.textContent?.trim()
        }

        if (text && text.length < 50 && text.length > 0) {
          buttons.push(text)
        }
      }
    }

    element = element.parentElement
    levels++
  }

  // Classify primary intent based on button text
  const allButtonText = buttons.join(' ').toLowerCase()

  // Priority order matters: verify > reset > login > signup
  let primaryIntent: ButtonIntent['primaryIntent'] = 'unknown'

  if (
    /verify|verif|confirm|authenticate|submit.*(code|verification)|enter.*code|continue/i.test(allButtonText)
  ) {
    primaryIntent = 'verify'
  } else if (/reset|forgot|recover/i.test(allButtonText)) {
    primaryIntent = 'reset'
  } else if (/log\s*in|sign\s*in|login|signin/i.test(allButtonText)) {
    primaryIntent = 'login'
  } else if (/sign\s*up|signup|register|create.*account/i.test(allButtonText)) {
    primaryIntent = 'signup'
  }

  return {
    buttons,
    primaryIntent,
  }
}

/**
 * Analyze field proximity to detect nearby fields and context text
 *
 * Scans up to 3 parent levels for sibling fields and nearby text.
 * Distance is measured by DOM tree depth to nearest relevant field.
 *
 * @param input - The input field to analyze
 * @returns Proximity data including nearby text and field distances
 */
export function analyzeFieldProximity(input: HTMLInputElement): FieldProximity {
  const texts: string[] = []
  let hasEmailField = false
  let hasUsernameField = false
  let distanceToNearestField = Infinity

  let element: HTMLElement | null = input
  let currentLevel = 0

  // Traverse up to 5 parent levels (expanded for component-based UIs)
  while (element && currentLevel < 5) {
    if (element.parentElement) {
      const siblings: Element[] = Array.from(element.parentElement.children)

      for (const sibling of siblings) {
        if (sibling === element || !(sibling instanceof HTMLElement)) {
          continue
        }

        // Collect nearby text (avoid huge blocks)
        const text = sibling.textContent?.trim()
        if (text && text.length > 0 && text.length < 200) {
          texts.push(text)
        }

        // Check for email/username fields in siblings (and their children)
        const inputsToCheck: HTMLInputElement[] = []

        if (sibling instanceof HTMLInputElement) {
          inputsToCheck.push(sibling)
        } else {
          // Also check for inputs within the sibling element
          const nestedInputs = sibling.querySelectorAll<HTMLInputElement>('input')
          inputsToCheck.push(...Array.from(nestedInputs))
        }

        for (const siblingInput of inputsToCheck) {
          const siblingType = siblingInput.type?.toLowerCase() || 'text'
          const siblingName = siblingInput.name?.toLowerCase() || ''
          const siblingId = siblingInput.id?.toLowerCase() || ''
          const siblingIdentifier = siblingName || siblingId

          // Update distance to nearest field
          if (currentLevel < distanceToNearestField) {
            distanceToNearestField = currentLevel
          }

          // Detect email fields
          if (
            siblingType === 'email' ||
            /^email|e-mail|mail$/i.test(siblingIdentifier) ||
            siblingInput.autocomplete === 'email'
          ) {
            hasEmailField = true
          }

          // Detect username fields
          if (
            /^user|username|login|account/i.test(siblingIdentifier) ||
            siblingInput.autocomplete === 'username'
          ) {
            hasUsernameField = true
          }
        }
      }
    }

    element = element.parentElement
    currentLevel++
  }

  return {
    nearbyText: texts.join(' '),
    hasEmailField,
    hasUsernameField,
    distanceToNearestField:
      distanceToNearestField === Infinity ? -1 : distanceToNearestField,
  }
}

/**
 * Result of Tier 2 deep detection
 */
export interface Tier2Result {
  /** True if field is a verification code input */
  detected: boolean
  /** Confidence score 0.0-1.0 */
  confidence: number
  /** Raw score for debugging (threshold is 70) */
  score: number
  /** Human-readable reason for decision */
  reason: string
  /** Detected delivery channels from signal classifier. Absent = ['email'] (default). */
  detectedChannels?: Array<'email' | 'sms' | 'authenticator'>
  /**
   * Phase 2 — see Tier1Result.channelEvidence.
   */
  channelEvidence?: 'positive' | 'unknown'
  /** Detection metadata for debugging */
  metadata?: {
    labelMatch?: string
    placeholderMatch?: string
    formContext?: FormContext
    buttonIntent?: ButtonIntent
    layer: 'label' | 'placeholder' | 'structural' | 'context' | 'split-input' | 'channel-gate' | 'non-email-intent'
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

  const explicitLabel = getExplicitLabelText(input)
  if (explicitLabel) {
    labels.push(explicitLabel)
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

  const ariaLabelledby = getAriaLabelledbyText(input)
  if (ariaLabelledby) {
    labels.push(ariaLabelledby)
  }

  return labels.join(' ')
}

/**
 * Get nearby text (within 5 parent levels)
 *
 * Searches up to 5 parent levels for sibling text content
 * Used for scoring and context validation
 *
 * @param input - Input field to extract nearby text from
 * @param isSplitInput - If true, allows longer text (250 chars) for split-input instructions
 * @returns Combined nearby text
 */
function getNearbyText(input: HTMLInputElement, isSplitInput: boolean = false): string {
  const texts: string[] = []
  let element: HTMLElement | null = input
  const maxLength = isSplitInput ? 250 : 150  // Increased limit for split-input contexts
  // Split-input UIs from heavy component frameworks (Microsoft Fluent UI,
  // Material UI, Chakra UI) bury the input under 6+ wrapper divs. The
  // heading and the "we sent a code to user@example.com" description live
  // further up than 5 ancestors. Without reaching them, the channel
  // classifier sees no email/SMS text → channelEvidence='unknown' →
  // listening chip is suppressed by the Phase 2 gate. The widened scope
  // is gated to confirmed split-input groups so simpler single-input
  // pages don't pull in unrelated header/footer text. The classifier
  // still requires actual email/SMS text in the deeper scan to promote
  // evidence — TOTP-only 6-cell prompts (Authenticator app screens) stay
  // 'unknown' because no email/SMS pattern exists at any depth.
  const maxLevels = isSplitInput ? 8 : 5
  let levels = 0

  while (element && levels < maxLevels) {
    // Get all text from siblings
    if (element.parentElement) {
      const directText = Array.from(element.parentElement.childNodes)
        .filter(node => node !== element && node.nodeType === 3)
        .map(node => node.textContent?.trim() || '')
        .filter(Boolean)
        .join(' ')
      if (directText && directText.length < maxLength) {
        texts.push(directText)
      }

      const siblings = Array.from(element.parentElement.children)
      siblings.forEach((sibling) => {
        if (sibling !== element && sibling instanceof HTMLElement) {
          const text = sibling.textContent?.trim()
          if (text && text.length > 0 && text.length < maxLength) {
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
 * Tier 2: Deep DOM traversal detection with 4-layer defense
 *
 * Called when Tier 1 fails to find high-confidence matches.
 * Performs slower but more thorough analysis:
 * - Label text analysis (35 points max)
 * - Placeholder analysis (25 points max)
 * - Nearby text analysis (10 points max)
 * - Pattern attribute analysis (15 points max)
 *
 * Defense layers applied:
 * 1. Cooldown check - Skip recently checked fields
 * 2. Password field detection - Reject type=password
 * 3. Structural validation - Form/button analysis (Layer 3)
 * 4. Context validation - Multilingual keywords (Layer 4)
 *
 * Threshold: 70 points required for positive detection
 * Performance target: <0.50ms per field
 *
 * @param input - Input field to analyze
 * @param cooldown - Cooldown registry instance
 * @returns Detection result with score and metadata
 */
export function detectTier2(
  input: HTMLInputElement,
  cooldown: CooldownRegistry
): Tier2Result {
  // ═══════════════════════════════════════════════════════════════
  // Layer 1: Cooldown Check
  // ═══════════════════════════════════════════════════════════════
  if (cooldown.isInCooldown(input)) {
    return {
      detected: false,
      confidence: 0,
      score: 0,
      reason: 'Field in cooldown period',
      metadata: { layer: 'label' },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Layer 2: Password Attribute Cross-Validation
  // ═══════════════════════════════════════════════════════════════
  if (input.type === 'password') {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      score: 0,
      reason: 'Password field detected (type=password)',
      metadata: { layer: 'label' },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Scoring System (Tier 2 Deep Scan)
  // ═══════════════════════════════════════════════════════════════
  let score = 0
  const scoreBreakdown: string[] = []

  // P3: Check for split input pattern (Steam, banks, enterprise SSO)
  // Uses detectSplitInputGroup as single source of truth (cached for reuse below)
  const splitGroup = detectSplitInputGroup(input)
  const isSplitInput = splitGroup !== null
  if (isSplitInput) {
    score += 75  // High confidence, sufficient to meet threshold (70)
    scoreBreakdown.push('split-input:75')
  }

  // Extract label text
  const labelText = getLabelText(input)
  let labelMatch = ''
  if (labelText) {
    const labelScore = getLabelMatchStrength(labelText)
    if (labelScore > 0) {
      score += labelScore
      scoreBreakdown.push(`label:${labelScore}`)
      labelMatch = labelText
    }
  }

  // Extract placeholder
  const placeholder = input.placeholder || ''
  let placeholderMatch = ''
  if (placeholder) {
    const placeholderScore = getPlaceholderMatchStrength(placeholder)
    if (placeholderScore > 0) {
      score += placeholderScore
      scoreBreakdown.push(`placeholder:${placeholderScore}`)
      placeholderMatch = placeholder
    }
  }

  // Extract nearby text (siblings, parent text)
  const nearbyText = getNearbyText(input, isSplitInput)
  if (nearbyText) {
    // Primary check: Multilingual high-confidence keywords (21 languages)
    // This fixes Turkish/Spanish/German/etc text scoring that was blocked by English-only filter
    const hasHighConfidence =
      HIGH_CONFIDENCE_KEYWORDS_LATIN.test(nearbyText) ||
      HIGH_CONFIDENCE_KEYWORDS_NONLATIN.test(nearbyText)
    const hasNegativeSignal = NEGATIVE_SIGNALS.test(nearbyText)

    if (hasNegativeSignal) {
      // Negative signal: do NOT add any points from nearby text
      // The field has password/email/username context - nearby text is not helpful
      scoreBreakdown.push('nearby:0 (negative-signal-blocked)')
    } else if (hasHighConfidence) {
      // High confidence: Contains verification/code keywords in 21 languages
      score += 20
      scoreBreakdown.push('nearby:20 (high-confidence)')
    } else {
      // Fallback: Check English LABEL_PATTERNS for backward compatibility
      const nearbyScore = getLabelMatchStrength(nearbyText)
      if (nearbyScore > 0) {
        const cappedScore = Math.min(nearbyScore / 2, 10)
        score += cappedScore
        scoreBreakdown.push(`nearby:${Math.floor(cappedScore)} (label-pattern)`)
      }
    }
  }

  // Check HTML pattern attribute (e.g., pattern="\\d{6}")
  const pattern = input.getAttribute('pattern')
  const patternRange = pattern ? getCodeLengthRangeFromPattern(pattern) : null
  if (patternRange) {
    if (
      patternRange.min >= TYPICAL_CODE_LENGTHS.min &&
      patternRange.max <= TYPICAL_CODE_LENGTHS.max
    ) {
      score += 15
      scoreBreakdown.push('pattern:15')
    }
  }

  // Check if score meets threshold
  const THRESHOLD = 70
  if (score < THRESHOLD) {
    return {
      detected: false,
      confidence: score / THRESHOLD,
      score,
      reason: `Score ${score} below threshold ${THRESHOLD} (${scoreBreakdown.join(', ')})`,
      metadata: { layer: 'label' },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Channel Gate: Reject SMS-only and authenticator-only fields
  // ═══════════════════════════════════════════════════════════════
  const channelTextSources: TextSources = {
    label: labelText,
    placeholder,
    nearbyText,
    ariaLabel: input.getAttribute('aria-label') || '',
    ariaDescribedby: getAriaDescribedbyText(input),
  }

  const channelResult = classifyDeliveryChannel(channelTextSources)

  if (channelResult.channel === 'authenticator') {
    const hasEmailOption = channelResult.allChannels?.includes('email')
    if (!hasEmailOption) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        score,
        reason: `Authenticator-only field (channel gate): ${channelResult.matchedKeywords.join(', ')}`,
        metadata: { layer: 'channel-gate' },
      }
    }
  }

  if (channelResult.channel === 'sms') {
    const hasEmailOption = channelResult.allChannels?.includes('email')
    if (!hasEmailOption && !smsFeatureEnabledCache) {
      cooldown.markRejected(input)
      return {
        detected: false,
        confidence: 0,
        score,
        reason: `SMS-only field (channel gate): ${channelResult.matchedKeywords.join(', ')}`,
        metadata: { layer: 'channel-gate' },
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Non-Email Intent Check
  // ═══════════════════════════════════════════════════════════════
  const ariaDescribedby = getAriaDescribedbyText(input)
  const combinedContextText = [labelText, placeholder, nearbyText, ariaDescribedby].filter(Boolean).join(' ')
  const intentResult = classifyNonEmailIntent(combinedContextText)

  if (intentResult.blocked) {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      score,
      reason: `Non-email context (${intentResult.category}): ${intentResult.matchedKeywords.join(', ')}`,
      metadata: { layer: 'non-email-intent' },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Multi-Input Form Penalty
  // Exempt split-input groups: their multiple boxes ARE the OTP widget
  // ═══════════════════════════════════════════════════════════════
  if (!isSplitInput) {
    const form = input.closest('form')
    if (form) {
      const textInputs = form.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input[type="tel"], input[type="number"], input:not([type])'
      )
      const visibleTextInputs = Array.from(textInputs).filter(i => !i.disabled && i.type !== 'hidden')
      if (visibleTextInputs.length >= 4) {
        score -= 20
        scoreBreakdown.push('multi-input-penalty:-20')
        if (score < THRESHOLD) {
          return {
            detected: false,
            confidence: score / THRESHOLD,
            score,
            reason: `Multi-input form penalty dropped score below threshold (${scoreBreakdown.join(', ')})`,
            metadata: { layer: 'structural' },
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Layer 3: Structural Validation (Form/Button Analysis)
  // ═══════════════════════════════════════════════════════════════
  const formContext = analyzeFormContext(input)
  const buttonIntent = analyzeButtonIntent(input)

  // Reject if form has password field AND button intent is 'login'
  if (formContext.hasPasswordField && buttonIntent.primaryIntent === 'login') {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      score,
      reason: 'Login form detected (password field + login button)',
      metadata: {
        layer: 'structural',
        formContext,
        buttonIntent,
      },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Layer 4: Context Validation (Negative Keywords)
  // ═══════════════════════════════════════════════════════════════
  const contextResult = validateContext({
    label: labelText,
    placeholder,
    ariaLabel: input.getAttribute('aria-label') || '',
    nearbyText,
  })

  if (!contextResult.pass) {
    cooldown.markRejected(input)
    return {
      detected: false,
      confidence: 0,
      score,
      reason: `Negative context: ${contextResult.matchedNegatives?.join(', ')} (${contextResult.language})`,
      metadata: {
        layer: 'context',
        formContext,
      },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // All layers passed - Mark as detected
  // ═══════════════════════════════════════════════════════════════
  cooldown.markDetected(input)

  return {
    detected: true,
    confidence: Math.min(score / THRESHOLD, 1.0),
    score,
    reason: `Tier2 match (${scoreBreakdown.join(', ')})`,
    detectedChannels: channelResult.allChannels ?? ['email'],
    // Phase 2: positive iff classifier resolved to a known channel.
    channelEvidence: channelResult.channel === 'unknown' ? 'unknown' : 'positive',
    metadata: {
      layer: 'label',
      labelMatch: labelMatch || undefined,
      placeholderMatch: placeholderMatch || undefined,
      formContext,
      buttonIntent,
    },
  }
}
