/**
 * Storage validation utilities for InboxKey
 *
 * Validates mailbox schema before writing to storage.
 * Ensures OAuth and IMAP fields are mutually exclusive.
 */

import type { Mailbox } from './schema';
import { isMailbox } from './schema';
import { ValidationError } from './errors';

/**
 * Validates mailbox schema before writing to storage.
 * Ensures OAuth and IMAP fields are mutually exclusive.
 *
 * @throws ValidationError if mailbox is invalid
 */
export function validateMailboxBeforeWrite(mailbox: Mailbox): void {
  if (!isMailbox(mailbox)) {
    throw new ValidationError('Invalid mailbox schema: missing required fields');
  }

  if (mailbox.providerId === 'google-messages') {
    if (mailbox.accessToken || mailbox.refreshToken || mailbox.tokenExpiresAt) {
      throw new ValidationError('Google Messages mailboxes cannot have OAuth tokens');
    }
    if (mailbox.imapServer || mailbox.imapPort || mailbox.imapAccountId) {
      throw new ValidationError('Google Messages mailboxes cannot have IMAP fields');
    }
    if (!mailbox.gmPhoneNumber) {
      throw new ValidationError('Google Messages mailboxes require gmPhoneNumber');
    }
  } else if (mailbox.providerId === 'imap-bridge') {
    // IMAP mailboxes must NOT have OAuth tokens
    if (mailbox.accessToken || mailbox.refreshToken || mailbox.tokenExpiresAt) {
      throw new ValidationError('IMAP mailboxes cannot have OAuth tokens');
    }

    // IMAP mailboxes MUST have IMAP-specific fields
    if (!mailbox.imapAccountId || !mailbox.imapServer || !mailbox.imapPort) {
      throw new ValidationError('IMAP mailboxes require imapAccountId, imapServer, and imapPort');
    }
  } else {
    // Gmail OAuth provider

    // Gmail mailboxes must NOT have IMAP fields
    if (mailbox.imapServer || mailbox.imapPort || mailbox.imapAccountId) {
      throw new ValidationError('Gmail mailboxes cannot have IMAP fields');
    }

    // Gmail mailboxes MUST have tokens
    if (!mailbox.accessToken || !mailbox.tokenExpiresAt) {
      throw new ValidationError('Gmail mailboxes require accessToken and tokenExpiresAt');
    }
  }
}
