/**
 * InboxBridge version and protocol compatibility checks.
 *
 * Two layers:
 * - Protocol gate (hard): blocks IMAP if protocol versions incompatible
 * - App version gate (soft): non-blocking "update available" notice
 */

import type { PingResult } from './types'
import {
  EXTENSION_MIN_PROTOCOL,
  EXTENSION_MAX_PROTOCOL,
  RECOMMENDED_INBOXBRIDGE_VERSION,
  INBOXBRIDGE_RELEASES_URL,
} from '@/lib/constants'

export type CompatibilityStatus =
  | { compatible: true; updateAvailable: boolean }
  | { compatible: false; reason: 'native_too_old' | 'extension_too_old' }

export function checkCompatibility(ping: PingResult): CompatibilityStatus {
  if (ping.protocolVersion < EXTENSION_MIN_PROTOCOL) {
    return { compatible: false, reason: 'native_too_old' }
  }

  if (ping.minProtocolVersion && ping.minProtocolVersion > EXTENSION_MAX_PROTOCOL) {
    return { compatible: false, reason: 'extension_too_old' }
  }

  const updateAvailable = !isVersionSatisfied(
    ping.version,
    RECOMMENDED_INBOXBRIDGE_VERSION
  )

  return { compatible: true, updateAvailable }
}

function isVersionSatisfied(current: string, minimum: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [cMaj, cMin, cPat] = parse(current)
  const [mMaj, mMin, mPat] = parse(minimum)
  if (cMaj !== mMaj) return cMaj > mMaj
  if (cMin !== mMin) return cMin > mMin
  return cPat >= mPat
}

export function getUpdateUrl(): string {
  return `${INBOXBRIDGE_RELEASES_URL}/latest`
}
