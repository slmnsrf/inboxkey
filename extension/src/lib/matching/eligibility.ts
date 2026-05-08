/**
 * Phase 2 — Positive-Signal Channel Eligibility Gate
 *
 * Decides whether a matched code may surface as an autofill chip on
 * pages where the field-level signal classifier returned no positive
 * email channel evidence. The gate enforces a strict domain match:
 * sender eTLD+1 must equal page eTLD+1 OR be in the audited alias map.
 * Token-overlap matches (domainAffinity 0.6) are explicitly rejected —
 * they are useful as ranking signals inside the matcher but not as
 * eligibility evidence.
 *
 * Pages on shared-hosting suffixes (github.io, vercel.app, etc.)
 * cannot satisfy this gate because tldts returns the shared suffix
 * as the registrable domain — see SHARED_HOST_BLOCKLIST in constants.
 */

import { domainAffinity, extractETLD } from "@/lib/matching/domain-affinity"
import { SHARED_HOST_BLOCKLIST } from "@/lib/constants"

type SessionChannel = 'email' | 'sms'

export interface NewArrivalCandidateEligibilityInput {
  siteETLD: string
  detectedChannels: ReadonlyArray<SessionChannel>
  provider?: string
  source?: string
  siteMatch?: string
  senderETLD?: string
  googleMessagesSessionExpired?: boolean
}

function hasSmsChannel(channels: ReadonlyArray<SessionChannel>): boolean {
  return channels.includes('sms')
}

function isLegacySmsOnlyCandidate(
  channels: ReadonlyArray<SessionChannel>,
  source: string | undefined,
  siteMatch: string | undefined,
  provider: string | undefined,
): boolean {
  return (
    provider === undefined &&
    channels.length === 1 &&
    channels[0] === 'sms' &&
    !siteMatch &&
    !!source &&
    !source.includes('@')
  )
}

function looksLikeLegacyGoogleMessagesCode(
  source: string | undefined,
  siteMatch: string | undefined,
  provider: string | undefined,
): boolean {
  return provider === undefined && !siteMatch && !!source && !source.includes('@')
}

/**
 * Decides whether a post-session-arrival candidate is eligible to enter
 * the matcher. Email candidates use domain affinity. Google Messages
 * candidates use SMS-session provenance instead because branded SMS
 * senders are often short codes or labels, not domains.
 */
export function isNewArrivalCandidateEligibleForAutofill(
  input: NewArrivalCandidateEligibilityInput,
): boolean {
  const isGoogleMessagesCandidate = input.provider === 'google-messages'
  const isLegacySmsCandidate = isLegacySmsOnlyCandidate(
    input.detectedChannels,
    input.source,
    input.siteMatch,
    input.provider,
  )

  if (
    input.googleMessagesSessionExpired &&
    (isGoogleMessagesCandidate ||
      looksLikeLegacyGoogleMessagesCode(
        input.source,
        input.siteMatch,
        input.provider,
      ))
  ) {
    return false
  }

  if (isGoogleMessagesCandidate) {
    return hasSmsChannel(input.detectedChannels)
  }

  if (isLegacySmsCandidate) {
    return true
  }

  const senderETLDForAffinity =
    input.senderETLD || extractETLD(input.siteMatch || '')
  const affinity = domainAffinity(
    input.siteETLD,
    senderETLDForAffinity,
    input.source,
  )
  return affinity >= 0.6
}

/**
 * Returns true when the matched code's sender domain strictly matches
 * the page domain.
 *
 * Strict =
 *   - exact eTLD+1 match (domainAffinity 1.0), OR
 *   - audited alias match (domainAffinity 0.9)
 *
 * Anything else (token-overlap 0.6, no relation 0.0, missing sender,
 * shared-host page) returns false.
 */
export function isStrictDomainMatch(
  pageHost: string,
  senderETLD: string | undefined,
): boolean {
  if (!senderETLD || senderETLD.length === 0) return false
  if (!pageHost || pageHost.length === 0) return false

  const siteETLD = extractETLD(pageHost)
  if (!siteETLD) return false

  // Shared-host pages can't use the domain-match path. PSL gap:
  // tldts returns the shared suffix as the registrable domain for
  // arbitrary subdomains (e.g. attacker.github.io → github.io).
  if (SHARED_HOST_BLOCKLIST.has(siteETLD)) return false

  // Pass `senderETLD` as both senderETLD and (no subject) so token-
  // overlap via subject does not contribute. We deliberately do NOT
  // forward subject text — the gate is about explicit domain evidence,
  // not subject heuristics.
  const affinity = domainAffinity(siteETLD, senderETLD)
  return affinity >= 0.9
}

/**
 * Decision helper: should the session-controller suppress a matched
 * code from being surfaced to the content script?
 *
 * Returns true when ALL of:
 *   - feature flag is on
 *   - session has 'unknown' channel evidence
 *   - session is email-only (preserves SMS / hybrid / GM-bypass)
 *   - the matched code's sender does NOT strictly match the page domain
 *
 * Returns false in any other case (gate doesn't apply, or it does and
 * the code passes).
 */
export function shouldSuppressMatch(
  gateEnabled: boolean,
  evidence: 'positive' | 'unknown' | undefined,
  detectedChannels: ReadonlyArray<'email' | 'sms'>,
  pageHost: string,
  senderETLD: string | undefined,
): boolean {
  if (!gateEnabled) return false
  if (evidence !== 'unknown') return false

  const isEmailOnly =
    detectedChannels.length === 1 && detectedChannels[0] === 'email'
  if (!isEmailOnly) return false

  return !isStrictDomainMatch(pageHost, senderETLD)
}
