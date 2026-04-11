/**
 * Global constants for InboxKey
 */

/**
 * GitHub repository URL
 * Used for InboxBridge downloads and source code links
 */
export const GITHUB_REPO_URL = 'https://github.com/slmnsrf/inboxkey'

/**
 * InboxBridge releases URL
 */
export const INBOXBRIDGE_RELEASES_URL = `${GITHUB_REPO_URL}/releases`

/**
 * Maximum number of IMAP accounts supported
 */
export const MAX_IMAP_ACCOUNTS = 10

/**
 * InboxBridge protocol compatibility range
 * Extension blocks IMAP operations if native app protocol is outside this range
 */
export const EXTENSION_MIN_PROTOCOL = 1
export const EXTENSION_MAX_PROTOCOL = 1

/**
 * Recommended InboxBridge app version
 * Shows non-blocking "update available" if native app is older (but protocol-compatible)
 */
export const RECOMMENDED_INBOXBRIDGE_VERSION = '1.1.0-rc1'
