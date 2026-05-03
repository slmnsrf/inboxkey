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
    if (mailbox.imapServer || mailbox.imapPort || mailbox.imapAccountId) {
      throw new ValidationError('Google Messages mailboxes cannot have IMAP fields');
    }
    if (!mailbox.gmPhoneNumber) {
      throw new ValidationError('Google Messages mailboxes require gmPhoneNumber');
    }
  } else if (mailbox.providerId === 'imap-bridge') {
    // IMAP mailboxes MUST have IMAP-specific fields
    if (!mailbox.imapAccountId || !mailbox.imapServer || !mailbox.imapPort) {
      throw new ValidationError('IMAP mailboxes require imapAccountId, imapServer, and imapPort');
    }
  } else {
    throw new ValidationError(`Unsupported providerId: ${mailbox.providerId}`, 'providerId');
  }
}
