/**
 * BlacklistModal Component
 *
 * Modal dialog for managing blacklisted domains and URLs.
 * Features two tabs: Domains and URLs.
 * Each tab allows adding, removing, and clearing entries.
 */

import React, { useState } from 'react'
import { Modal } from '@/ui/components/Modal'
import { BlacklistDomainTab } from './BlacklistDomainTab'
import { BlacklistUrlTab } from './BlacklistUrlTab'
import './BlacklistModal.css'

export type BlacklistTab = 'domains' | 'urls'

export interface BlacklistModalProps {
  isOpen: boolean
  onClose: () => void
}

export function BlacklistModal({ isOpen, onClose }: BlacklistModalProps) {
  const [activeTab, setActiveTab] = useState<BlacklistTab>('domains')

  const handleClose = () => {
    // Reset to domains tab when closing
    setActiveTab('domains')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Manage Ignored Sites"
      size="large"
      className="blacklist-modal"
    >
      <div className="blacklist-modal-container">
        {/* Tab Navigation */}
        <div className="blacklist-tabs" role="tablist" aria-label="Blacklist management tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'domains'}
            aria-controls="domains-panel"
            id="domains-tab"
            className={`blacklist-tab ${activeTab === 'domains' ? 'blacklist-tab--active' : ''}`}
            onClick={() => setActiveTab('domains')}
            data-testid="blacklist-tab-domains"
          >
            Domains
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'urls'}
            aria-controls="urls-panel"
            id="urls-tab"
            className={`blacklist-tab ${activeTab === 'urls' ? 'blacklist-tab--active' : ''}`}
            onClick={() => setActiveTab('urls')}
            data-testid="blacklist-tab-urls"
          >
            URLs
          </button>
        </div>

        {/* Tab Content */}
        <div className="blacklist-content">
          {activeTab === 'domains' ? (
            <div
              role="tabpanel"
              id="domains-panel"
              aria-labelledby="domains-tab"
              className="blacklist-panel"
            >
              <BlacklistDomainTab />
            </div>
          ) : (
            <div
              role="tabpanel"
              id="urls-panel"
              aria-labelledby="urls-tab"
              className="blacklist-panel"
            >
              <BlacklistUrlTab />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
