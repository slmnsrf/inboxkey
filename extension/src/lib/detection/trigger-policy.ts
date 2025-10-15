/**
 * Trigger Policy - Lightweight decision function
 *
 * Combines channel classification, non-email intent, and OTP evidence
 * into a single trigger/block decision. This is the "email eligibility
 * is first-class" principle encoded as a function.
 *
 * Rules:
 * 1. SMS-only or authenticator-only => always block
 * 2. Non-email intent detected => always block
 * 3. Email or hybrid-email => trigger if OTP score meets threshold
 * 4. Unknown channel => trigger only with very strong OTP evidence (score >= threshold * 1.3)
 */

export interface TriggerPolicyInput {
  channel: 'email' | 'sms' | 'authenticator' | 'unknown'
  hasEmailOption: boolean
  nonEmailCategory: string | null
  otpScore: number
  threshold: number
}

export interface TriggerPolicyResult {
  action: 'trigger' | 'block'
  reason: string
}

/**
 * Determine whether InboxKey should auto-trigger for this field
 */
export function shouldAutoTrigger(input: TriggerPolicyInput): TriggerPolicyResult {
  const { channel, hasEmailOption, nonEmailCategory, otpScore, threshold } = input

  // Rule 1: Non-email intent always blocks
  if (nonEmailCategory) {
    return {
      action: 'block',
      reason: `Non-email context: ${nonEmailCategory}`,
    }
  }

  // Rule 2: SMS-only or authenticator-only blocks
  if ((channel === 'sms' || channel === 'authenticator') && !hasEmailOption) {
    return {
      action: 'block',
      reason: `${channel}-only channel (no email option)`,
    }
  }

  // Rule 3: Email or hybrid-email triggers normally
  if (channel === 'email' || hasEmailOption) {
    if (otpScore >= threshold) {
      return {
        action: 'trigger',
        reason: `Email-eligible, OTP score ${otpScore} >= ${threshold}`,
      }
    }
    return {
      action: 'block',
      reason: `Email-eligible but OTP score ${otpScore} < ${threshold}`,
    }
  }

  // Rule 4: Unknown channel - require elevated evidence
  const elevatedThreshold = Math.round(threshold * 1.3)
  if (otpScore >= elevatedThreshold) {
    return {
      action: 'trigger',
      reason: `Unknown channel but strong OTP evidence: ${otpScore} >= ${elevatedThreshold}`,
    }
  }

  return {
    action: 'block',
    reason: `Unknown channel, insufficient evidence: ${otpScore} < ${elevatedThreshold}`,
  }
}
