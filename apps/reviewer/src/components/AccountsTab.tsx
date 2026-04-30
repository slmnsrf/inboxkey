/**
 * Accounts Tab - OAuth Account Management
 */

import React, { useState, useEffect } from 'react'
import { GmailPKCEProvider } from '../lib/providers/gmail-pkce'
import { OutlookPKCEProvider } from '../lib/providers/outlook-pkce'
import { saveAccount, getAllAccounts, removeAccount } from '../lib/providers/token-storage'
import type { StoredAccount } from '../lib/providers/types'

export default function AccountsTab() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load accounts on mount
  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      const allAccounts = await getAllAccounts()
      setAccounts(allAccounts)
    } catch (err) {
      console.error('Failed to load accounts:', err)
      setError('Failed to load accounts')
    }
  }

  const handleConnectGmail = async () => {
    setLoading(true)
    setError(null)

    try {
      const provider = new GmailPKCEProvider()
      const tokens = await provider.authenticate()
      const email = await provider.getUserEmail(tokens.access_token)

      await saveAccount('gmail', email, tokens)
      await loadAccounts()

      console.log('Gmail connected:', email)
    } catch (err) {
      console.error('Gmail auth error:', err)
      setError(`Gmail connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleConnectOutlook = async () => {
    setLoading(true)
    setError(null)

    try {
      const provider = new OutlookPKCEProvider()
      const tokens = await provider.authenticate()
      const email = await provider.getUserEmail(tokens.access_token)

      await saveAccount('outlook', email, tokens)
      await loadAccounts()

      console.log('Outlook connected:', email)
    } catch (err) {
      console.error('Outlook auth error:', err)
      setError(`Outlook connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (account: StoredAccount) => {
    if (!confirm(`Disconnect ${account.email}?`)) {
      return
    }

    try {
      // Revoke tokens
      if (account.provider === 'gmail') {
        const provider = new GmailPKCEProvider()
        await provider.revokeTokens(account.tokens.access_token)
      } else {
        const provider = new OutlookPKCEProvider()
        await provider.revokeTokens(account.tokens.access_token)
      }

      // Remove from storage
      await removeAccount(account.provider, account.email)
      await loadAccounts()

      console.log('Disconnected:', account.email)
    } catch (err) {
      console.error('Disconnect error:', err)
      setError(`Failed to disconnect: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Connected Accounts</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Connect your email accounts to review messages
      </p>

      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '30px' }}>
        <button
          onClick={handleConnectGmail}
          disabled={loading}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            fontSize: '14px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Connecting...' : 'Connect Gmail'}
        </button>

        <button
          onClick={handleConnectOutlook}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            backgroundColor: '#0078d4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Connecting...' : 'Connect Outlook'}
        </button>
      </div>

      {accounts.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          color: '#666'
        }}>
          No accounts connected yet. Click a button above to get started.
        </div>
      ) : (
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          border: '1px solid #ddd'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Provider</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Email</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Last Sync</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account, idx) => (
              <tr key={`${account.provider}-${account.email}`} style={{
                borderBottom: idx < accounts.length - 1 ? '1px solid #eee' : 'none'
              }}>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: account.provider === 'gmail' ? '#e8f0fe' : '#cfe4fc',
                    color: account.provider === 'gmail' ? '#1967d2' : '#0078d4'
                  }}>
                    {account.provider.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>{account.email}</td>
                <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
                  {formatLastSync(account.lastSync)}
                </td>
                <td style={{ padding: '12px' }}>
                  <button
                    onClick={() => handleDisconnect(account)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Disconnect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
