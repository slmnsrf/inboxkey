/**
 * Shared OS detection utility.
 *
 * Uses Navigator.userAgentData (preferred, Chromium 93+) with fallback
 * to navigator.platform for older browsers.
 */

export function detectOS(): 'windows' | 'macos' | 'linux' {
  const platform = (navigator as any).userAgentData?.platform
  if (platform) {
    if (platform === 'Windows') return 'windows'
    if (platform === 'macOS') return 'macos'
    return 'linux'
  }
  const ua = navigator.platform
  if (ua.startsWith('Win')) return 'windows'
  if (ua.startsWith('Mac')) return 'macos'
  return 'linux'
}
