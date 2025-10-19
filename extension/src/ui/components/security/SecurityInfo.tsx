import React from 'react'
import './SecurityInfo.css'

export function SecurityInfo() {
  const openSourceUrl = 'https://github.com/[YOUR-REPO]/inboxkey'
  const docsUrl = '/docs/SECURITY_ARCHITECTURE.md'

  return (
    <div className="security-info">
      <div className="security-section">
        <div className="section-icon">🔒</div>
        <h3>Privacy First</h3>
        <ul className="feature-list">
          <li>100% local processing - no servers, no cloud</li>
          <li>Your emails never leave your device</li>
          <li>No tracking, no analytics, no data collection</li>
        </ul>
      </div>

      <div className="security-section">
        <div className="section-icon">🛡️</div>
        <h3>Data Security</h3>
        <ul className="feature-list">
          <li>Secured by Chrome's encrypted storage (OS-level)</li>
          <li>OAuth tokens protected using industry standards</li>
          <li>Automatic security updates via Chrome Web Store</li>
        </ul>
      </div>

      <div className="security-section">
        <div className="section-icon">🔍</div>
        <h3>Transparency</h3>
        <ul className="feature-list">
          <li>Fully open source - verify security yourself</li>
          <li>Published by verified developer</li>
          <li>Regular security audits</li>
        </ul>
      </div>

      <div className="action-links">
        <a
          href={openSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="link-button"
        >
          View Source Code →
        </a>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="link-button secondary"
        >
          Security Documentation →
        </a>
      </div>

      <hr className="divider" />

      <div className="permissions-section">
        <div className="section-icon">📋</div>
        <h3>Permissions Explained</h3>
        <div className="permissions-list">
          <div className="permission-item">
            <span className="permission-name">Read emails</span>
            <span className="permission-reason">Extract verification codes from Gmail</span>
          </div>
          <div className="permission-item">
            <span className="permission-name">Storage</span>
            <span className="permission-reason">Save your settings and preferences</span>
          </div>
          <div className="permission-item">
            <span className="permission-name">Active tab</span>
            <span className="permission-reason">Detect OTP input fields on pages</span>
          </div>
        </div>
      </div>

      <hr className="divider" />

      <div className="contact-section">
        <h4>Questions or Concerns?</h4>
        <p>
          Report security issues:{' '}
          <a href="mailto:security@inboxkey.com">security@inboxkey.com</a>
        </p>
      </div>
    </div>
  )
}
