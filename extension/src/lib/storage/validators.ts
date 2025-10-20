/**
 * Storage validation utilities for InboxKey
 *
 * Validates mailbox schema before writing to storage.
 * Ensures OAuth and IMAP fields are mutually exclusive.
 */

import type { Mailbox } from './schema';
import { isMailbox } from './schema';

/**
 * Validates mailbox schema before writing to storage.
 * Ensures OAuth and IMAP fields are mutually exclusive.
 *
 * @throws Error if mailbox is invalid
 */
export function validateMailboxBeforeWrite(mailbox: Mailbox): void {
  if (!isMailbox(mailbox)) {
    throw new Error('Invalid mailbox schema: missing required fields');
  }

  if (mailbox.providerId === 'imap-bridge') {
    // IMAP mailboxes must NOT have OAuth tokens
    if (mailbox.accessToken || mailbox.refreshToken || mailbox.tokenExpiresAt) {
      throw new Error('IMAP mailboxes cannot have OAuth tokens');
    }

    // IMAP mailboxes MUST have IMAP-specific fields
    if (!mailbox.imapAccountId || !mailbox.imapServer || !mailbox.imapPort) {
      throw new Error('IMAP mailboxes require imapAccountId, imapServer, and imapPort');
    }
  } else {
    // OAuth providers (gmail, outlook)

    // OAuth mailboxes must NOT have IMAP fields
    if (mailbox.imapServer || mailbox.imapPort || mailbox.imapAccountId) {
      throw new Error('OAuth mailboxes cannot have IMAP fields');
    }

    // OAuth mailboxes MUST have tokens
    if (!mailbox.accessToken || !mailbox.tokenExpiresAt) {
      throw new Error('OAuth mailboxes require accessToken and tokenExpiresAt');
    }
  }
}
