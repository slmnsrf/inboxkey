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

  // Defensive runtime check: OAuth token fields must not be present on
  // any mailbox we persist. The TypeScript Mailbox interface no longer
  // declares accessToken/refreshToken/tokenExpiresAt, but a malformed
  // legacy record reaching this validator at runtime should be rejected
  // rather than passed through silently. This is the storage equivalent
  // of "no OAuth tokens are persisted in extension storage."
  const m = mailbox as unknown as Record<string, unknown>;
  if ('accessToken' in m || 'refreshToken' in m || 'tokenExpiresAt' in m) {
    throw new ValidationError(
      'Mailboxes cannot have OAuth token fields (accessToken, refreshToken, tokenExpiresAt)',
      'accessToken'
    );
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
