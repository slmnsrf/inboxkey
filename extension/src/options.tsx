/**
 * InboxKey Options Page
 *
 * Settings page for managing accounts, appearance, and security information.
 */

import React, { useState, useEffect } from 'react'
import { ToastProvider } from './ui/contexts/ToastContext'
import { ThemeProvider } from './ui/contexts/ThemeContext'
import { SecurityInfo } from './ui/components/security/SecurityInfo'
import { TabNavigation, type Tab } from './ui/components/TabNavigation'
import { AboutSection } from './ui/components/AboutSection'
import { AccountsPanel } from './ui/components/AccountsPanel'
import { AppearanceSettings } from './ui/components/AppearanceSettings'
import { AutomationSettings } from './ui/components/AutomationSettings'
import { DataManagement } from './ui/components/DataManagement'
import { AdvancedSettings } from './ui/components/AdvancedSettings'
import { BuyMeACoffeeButton } from './ui/components/BuyMeACoffeeButton'
import { t } from './lib/i18n'
import './options.css'
import './ui/components/security/SecurityInfo.css'

function OptionsApp() {
  const [mailboxCount, setMailboxCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('security')

  // Fetch mailbox count
  useEffect(() => {
    const fetchMailboxCount = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_MAILBOXES' })
        if (response.success) {
          setMailboxCount(response.mailboxes.length)
        }
      } catch (error) {
        console.error('Failed to fetch mailboxes:', error)
      }
    }
    fetchMailboxCount()
  }, [])

  // Check URL params for tab override
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab') as Tab | null
    if (tabParam && ['accounts', 'security', 'settings', 'about'].includes(tabParam)) {
      setActiveTab(tabParam)
    } else if (mailboxCount !== null && mailboxCount === 0) {
      // Default to accounts tab if no mailboxes
      setActiveTab('accounts')
    }
  }, [mailboxCount])

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="options-container">
            <div className="options-shell">
              <header className="options-header" aria-labelledby="options-title">
                <div className="options-header__identity">
                  <span className="brand__icon" aria-hidden="true">
                    🔑
                  </span>
                  <div className="brand">
                    <h1 id="options-title" className="brand__title">
                      {t('settings_title')}
                    </h1>
                    <p className="privacy-line">{t('footer_local_only')}</p>
                  </div>
                </div>
                <div className="options-header__actions">
                  <a
                    className="support-link"
                    href="https://github.com/inboxkey/extension"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('settings_view_source_aria')}
                  >
                    {t('settings_view_source')}
                  </a>
                  <BuyMeACoffeeButton
                    variant="options"
                    label={t('about_buy_coffee')}
                    ariaLabel={t('about_support_cta_aria')}
                    className="options-header__support"
                  />
                </div>
              </header>

              <section
                className="trust-banner"
                role="region"
                aria-label={t('settings_trust_region_label')}
              >
                <span className="trust-chip">🧩 {t('settings_trust_open_source')}</span>
                <span className="trust-chip">🔒 {t('settings_trust_local_only')}</span>
                <span className="trust-chip">🛡️ {t('settings_trust_safe')}</span>
                <span className="trust-banner__spacer" aria-hidden="true" />
                <span className="trust-banner__note">
                  {t('settings_trust_summary')}
                </span>
              </section>

              <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

              <main className="options-content">
                <div
                  id="accounts-panel"
                  role="tabpanel"
                  aria-labelledby="accounts-tab"
                  hidden={activeTab !== 'accounts'}
                  className="tab-panel"
                >
                  <section className="section">
                    <AccountsPanel />
                  </section>
                </div>

                <div
                  id="security-panel"
                  role="tabpanel"
                  aria-labelledby="security-tab"
                  hidden={activeTab !== 'security'}
                  className="tab-panel"
                >
                  <section className="section">
                    <SecurityInfo />
                  </section>
                </div>

                <div
                  id="settings-panel"
                  role="tabpanel"
                  aria-labelledby="settings-tab"
                  hidden={activeTab !== 'settings'}
                  className="tab-panel"
                >
                  <section className="section settings-section">
                    <AutomationSettings />
                    <AppearanceSettings />
                    <DataManagement />
                    <AdvancedSettings />
                  </section>
                </div>

                <div
                  id="about-panel"
                  role="tabpanel"
                  aria-labelledby="about-tab"
                  hidden={activeTab !== 'about'}
                  className="tab-panel"
                >
                  <section className="section">
                    <AboutSection />
                  </section>
                </div>
              </main>
            </div>
          </div>
        </ToastProvider>
    </ThemeProvider>
  )
}

export default OptionsApp
