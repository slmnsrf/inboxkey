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
import {
  getLabelMatchStrength,
  getPlaceholderMatchStrength,
  HTML_PATTERN_DETECTION,
  TYPICAL_CODE_LENGTHS,
} from './patterns'


/**
 * P2: High-confidence keywords for nearby text boosting (21 languages, 99.4% coverage)
 *
 * When nearby text contains these keywords, boost score from 10 to 20 points.
 * Helps detect OTP fields with poor semantic HTML (like Steam login page).
 */
const HIGH_CONFIDENCE_KEYWORDS = new RegExp(
  '\\b(' +
  // English
  'verification|code|otp|one.?time|security.?code|auth|authenticate|' +
  // Spanish/Portuguese
  'código|verificación|verificacao|autenticação|autenticacion|' +
  // German/French
  'bestätigung|vérification|authentification|' +
  // Turkish
  'doğrulama|kod|kimlik|' +
  // Russian/Ukrainian
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
  '验证码|驗證碼|代码|代碼|确认|確認' +
  ')\\b',
  'i'
)

/**
 * P2: Negative signal keywords for score penalty
 *
 * When nearby text contains these keywords, penalize score to max 5 points.
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
  /** Detection metadata for debugging */
  metadata?: {
    labelMatch?: string
    placeholderMatch?: string
    formContext?: FormContext
    buttonIntent?: ButtonIntent
    layer: 'label' | 'placeholder' | 'structural' | 'context' | 'split-input'
  }
}

/**
 * P3: Detect split single-character OTP input pattern
 *
 * Pattern: 4-8 adjacent inputs with maxlength=1 within same parent container
 * Common in React/Vue component libraries (Ant Design, Material-UI, Chakra UI, Steam)
 *
 * Architecture Decision: Tier 2 placement (not Tier 1) for performance budget compliance
 * - Tier 1 budget: <0.15ms (DOM traversal would exceed)
 * - Tier 2 budget: <0.50ms (sufficient for 2-level traversal ~0.25ms)
 *
 * Performance: ~0.20-0.25ms per field (2-level DOM traversal + querySelectorAll)
 *
 * @param input - Input field to check (must have maxlength=1)
 * @returns True if this input is part of a split OTP pattern (4-8 adjacent inputs)
 */
function detectSplitInputPattern(input: HTMLInputElement): boolean {
  // Early exit: only check maxlength=1 inputs
  if (input.maxLength !== 1) {
    return false
  }

  // Performance optimization: limit traversal to 2 levels (vs proposed 3)
  let container: HTMLElement | null = input.parentElement
  let levels = 0

  while (container && levels < 2) {
    // Count adjacent maxlength=1 inputs in this container
    const inputs = container.querySelectorAll<HTMLInputElement>('input[maxlength="1"]')
    const count = inputs.length

    // Valid OTP range: 4-8 inputs (standard code lengths)
    if (count >= 4 && count <= 8) {
      const inputArray = Array.from(inputs)

      // Validate sibling relationship (all share same parent)
      const firstParent = inputArray[0].parentElement
      const lastParent = inputArray[count - 1].parentElement

      if (firstParent && lastParent && firstParent === lastParent) {
        return true  // Found valid split input pattern
      }
    }

    // Move up one level
    container = container.parentElement
    levels++
  }

  return false  // No split input pattern found
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
  let levels = 0

  while (element && levels < 5) {
    // Get all text from siblings
    if (element.parentElement) {
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
  // Increased from 60 to 75 to ensure detection even with authenticator penalty (-10)
  if (detectSplitInputPattern(input)) {
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
  const isSplitInput = detectSplitInputPattern(input)
  const nearbyText = getNearbyText(input, isSplitInput)
  if (nearbyText) {
    // Primary check: Multilingual high-confidence keywords (21 languages)
    // This fixes Turkish/Spanish/German/etc text scoring that was blocked by English-only filter
    const hasHighConfidence = HIGH_CONFIDENCE_KEYWORDS.test(nearbyText)
    const hasNegativeSignal = NEGATIVE_SIGNALS.test(nearbyText)

    if (hasNegativeSignal) {
      // Penalty: Contains password/email/username keywords
      score += 5
      scoreBreakdown.push('nearby:5 (negative-signal)')
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
  if (pattern && HTML_PATTERN_DETECTION.digits.test(pattern)) {
    const match = pattern.match(HTML_PATTERN_DETECTION.digits)
    const length = match ? parseInt(match[1], 10) : 0
    if (length >= TYPICAL_CODE_LENGTHS.min && length <= TYPICAL_CODE_LENGTHS.max) {
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
    metadata: {
      layer: 'label',
      labelMatch: labelMatch || undefined,
      placeholderMatch: placeholderMatch || undefined,
      formContext,
      buttonIntent,
    },
  }
}
