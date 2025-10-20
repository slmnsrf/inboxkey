/**
 * Settings Page - Main UI for InboxKey Reviewer
 * Tab-based interface for account management, testing, and documentation
 */

import React, { useState, useEffect } from 'react'
import AccountsTab from './components/AccountsTab'
import TestingTab from './components/TestingTab'
import HowItWorksTab from './components/HowItWorksTab'

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'testing' | 'howto'>('accounts')

  // Read URL hash on mount to set initial tab
  useEffect(() => {
    const hash = window.location.hash.slice(1) // Remove '#'
    if (hash === 'accounts' || hash === 'testing' || hash === 'howto') {
      setActiveTab(hash)
    }
  }, [])

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      backgroundColor: '#f8f9fa'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#fff',
        borderBottom: '2px solid #e9ecef',
        padding: '20px 30px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '24px',
          color: '#212529',
          fontWeight: 600
        }}>
          InboxKey Reviewer - DEV TOOL
        </h1>
        <p style={{
          margin: '5px 0 0 0',
          fontSize: '14px',
          color: '#6c757d'
        }}>
          Local-only batch review for algorithm improvements
        </p>
      </header>

      {/* Tabs Navigation */}
      <nav style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #dee2e6',
        padding: '0 30px'
      }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={() => setActiveTab('accounts')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              backgroundColor: activeTab === 'accounts' ? '#fff' : 'transparent',
              color: activeTab === 'accounts' ? '#0d6efd' : '#6c757d',
              border: 'none',
              borderBottom: activeTab === 'accounts' ? '3px solid #0d6efd' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ACCOUNTS
          </button>
          <button
            onClick={() => setActiveTab('testing')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              backgroundColor: activeTab === 'testing' ? '#fff' : 'transparent',
              color: activeTab === 'testing' ? '#0d6efd' : '#6c757d',
              border: 'none',
              borderBottom: activeTab === 'testing' ? '3px solid #0d6efd' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            TESTING
          </button>
          <button
            onClick={() => setActiveTab('howto')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              backgroundColor: activeTab === 'howto' ? '#fff' : 'transparent',
              color: activeTab === 'howto' ? '#0d6efd' : '#6c757d',
              border: 'none',
              borderBottom: activeTab === 'howto' ? '3px solid #0d6efd' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            HOW IT WORKS
          </button>
        </div>
      </nav>

      {/* Tab Content */}
      <main style={{
        backgroundColor: '#fff',
        margin: '20px 30px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        minHeight: 'calc(100vh - 200px)'
      }}>
        {activeTab === 'accounts' && <AccountsTab />}
        {activeTab === 'testing' && <TestingTab />}
        {activeTab === 'howto' && <HowItWorksTab />}
      </main>
    </div>
  )
}
