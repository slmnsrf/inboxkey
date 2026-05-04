/**
 * IMAP Bridge Provider
 * Implements IIMAPProvider interface for IMAP account management
 */

import { getNativeClient } from '../../native-messaging';
import type { IIMAPProvider, EmailMessage, FetchOptions } from './types';

export class IMAPBridgeProvider implements IIMAPProvider {
  readonly providerId = 'imap-bridge' as const;
  readonly displayName = 'IMAP (via InboxBridge)';

  private client = getNativeClient();

  async configureAccount(params: {
    label: string;
    server: string;
    port: number;
    tls: boolean;
    email: string;
    password: string;
  }): Promise<{ accountId: string }> {
    const result = await this.client.call<{ accountId: string }>('account.add', {
      label: params.label,
      host: params.server,
      port: params.port,
      tls: params.tls,
      username: params.email,
      password: params.password
    });

    return { accountId: result.accountId };
  }

  async testConnection(params: {
    server: string;
    port: number;
    tls: boolean;
    email: string;
    password: string;
  }): Promise<{ success: boolean; roundTripMs: number }> {
    const result = await this.client.call<{ success: boolean; roundTripMs?: number }>('account.test', {
      host: params.server,
      port: params.port,
      tls: params.tls,
      username: params.email,
      password: params.password
    });

    return {
      success: result.success,
      roundTripMs: result.roundTripMs || 0
    };
  }

  async disconnect(accountId: string): Promise<void> {
    await this.client.call('account.remove', { accountId });
  }

  async fetchEmails(accountId: string, options?: FetchOptions): Promise<EmailMessage[]> {
    const sinceMinutes = options?.newerThan
      ? Math.ceil((Date.now() - options.newerThan.getTime()) / 60000)
      : 10;

    const result = await this.client.call<{
      messages: Array<{
        uid: number
        date: string
        from: string
        subject: string
        snippet?: string
        text?: string
        html?: string
      }>
    }>('mail.fetchRecent', {
      accountId,
      sinceMinutes,
      limit: options?.maxResults || 15
    });

    return result.messages.map((msg) => ({
      uid: msg.uid,
      date: msg.date,
      from: msg.from,
      subject: msg.subject,
      snippet: msg.snippet,
      text: msg.text,
      html: msg.html
    }));
  }
}
