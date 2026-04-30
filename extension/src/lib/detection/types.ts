/**
 * Shared type definitions for the detection system
 *
 * This file centralizes interfaces used across multiple detection layers
 * to prevent duplication and maintain consistency.
 */

/**
 * Text sources for context analysis and channel classification
 *
 * Used by:
 * - context-validator.ts (negative keyword detection)
 * - signal-classifier.ts (email/SMS/authenticator channel detection)
 * - tier2-deep.ts (label and nearby text scoring)
 */
export interface TextSources {
  /** Label text from <label>, aria-labelledby, or parent <label> */
  label: string
  /** Placeholder attribute text */
  placeholder: string
  /** Nearby text from siblings and parents (up to 4 levels) */
  nearbyText: string
  /** ARIA label attribute (optional for backward compatibility) */
  ariaLabel?: string
  /** ARIA describedby resolved text (optional) */
  ariaDescribedby?: string
  /** Page title for setup page detection (optional) */
  pageTitle?: string
}

/**
 * Detection metadata indicates layer decision outcome
 *
 * Metadata semantics:
 * - { layer: 'cooldown' } = Field in cooldown period (Tier1, skip)
 * - { layer: 'attribute' } = Tier1 REJECTED due to password type, excluded patterns, or custom attributes (skip Tier2)
 * - { layer: 'autocomplete' } = Tier1 DETECTED via autocomplete attribute
 * - { layer: 'signal-classifier-tier1' } = Tier1 REJECTED due to authenticator/SMS detection (skip Tier2)
 * - { layer: 'context' } = Tier1 REJECTED due to negative keywords in 21 languages (skip Tier2)
 * - undefined = No decision (allow next tier to run)
 * - { layer: 'label' } = Tier2 scoring completed (may be below threshold)
 * - { layer: 'structural' } = Tier2 REJECTED due to form/button analysis
 * - { layer: 'channel-classifier' } = DEPRECATED - Legacy Layer 2.5 (use signal-classifier-tier1 instead)
 *
 * Contract:
 * - Tier1 returns metadata ONLY for definitive rejections or detections
 * - Tier1 returns NO metadata when it has "no opinion" (defers to Tier2)
 * - field-detector.ts skips Tier2 if metadata.layer === 'attribute' | 'context' | 'signal-classifier-tier1'
 */
export interface DetectionMetadata {
  /** Detection layer that made the decision */
  layer: 'cooldown' | 'attribute' | 'autocomplete' | 'context' | 'label' | 'structural' | 'signal-classifier-tier1' | 'trigger-policy' | 'channel-classifier'
  /** Matched attribute name (for Tier1 attribute/autocomplete detections) */
  matchedAttribute?: string
  /** Delivery channel classification (for Layer 2.5) */
  channel?: 'email' | 'sms' | 'authenticator'
  /** Matched keywords (for Layer 2.5 and context validator) */
  keywords?: string[]
  /** Matched negative keywords (for context validator) */
  matchedNegatives?: string[]
  /** Form context analysis (for Layer 3 structural) */
  formContext?: {
    hasPasswordField: boolean
    hasSubmitButton: boolean
  }
  /** Button intent analysis (for Layer 3 structural) */
  buttonIntent?: {
    primaryIntent: 'login' | 'verify' | 'submit' | 'unknown'
    confidence: number
  }
}

/**
 * Delivery channel classification result (Layer 2.5)
 */
export interface ChannelClassification {
  /** Detected delivery channel */
  channel: 'email' | 'sms' | 'authenticator' | 'unknown'
  /** Confidence level 0.0-1.0 */
  confidence: number
  /** Keywords that triggered the classification */
  matchedKeywords: string[]
  /** Detected language (ISO 639-1 code) or null */
  language: string | null
  /** All detected channels (ordered by InboxKey capability: email > sms > authenticator) */
  allChannels?: Array<'email' | 'sms' | 'authenticator'>
  /** Individual confidence scores per detected channel */
  channelConfidences?: {
    email?: number
    sms?: number
    authenticator?: number
  }
}

/**
 * Lightweight decision trace for debugging false positives
 * Attached to detection results for local-only investigation
 */
export interface DecisionTrace {
  /** Input field identifier (name or id) */
  fieldId: string
  /** Tier that made the decision (1 or 2) */
  tier: 1 | 2
  /** Channel classification result */
  channel: 'email' | 'sms' | 'authenticator' | 'unknown'
  /** Whether email option was available */
  hasEmailOption: boolean
  /** Non-email intent category if detected */
  nonEmailCategory: string | null
  /** OTP-likeness score (Tier 2 only) */
  otpScore?: number
  /** Final action taken */
  action: 'trigger' | 'block'
  /** Human-readable reason chain */
  reasons: string[]
}
