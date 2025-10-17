/**
 * InboxKey Options Page
 *
 * Settings page for configuring Lock Mode and security options.
 */

import React, { useState, useEffect } from 'react'
import { LockProvider } from './ui/contexts/LockContext'
import { ToastProvider } from './ui/contexts/ToastContext'
import { ThemeProvider } from './ui/contexts/ThemeContext'
import { SecuritySettings } from './ui/components/security'
import { TabNavigation, type Tab } from './ui/components/TabNavigation'
import { AboutSection } from './ui/components/AboutSection'
import { AccountsPanel } from './ui/components/AccountsPanel'
import { AppearanceSettings } from './ui/components/AppearanceSettings'
import { DataManagement } from './ui/components/DataManagement'
import { BuyMeACoffeeButton } from './ui/components/BuyMeACoffeeButton'
import { t } from './lib/i18n'
import './options.css'

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
    if (tabParam && ['accounts', 'security', 'advanced', 'about'].includes(tabParam)) {
      setActiveTab(tabParam)
    } else if (mailboxCount !== null && mailboxCount === 0) {
      // Default to accounts tab if no mailboxes
      setActiveTab('accounts')
    }
  }, [mailboxCount])

  return (
    <ThemeProvider>
      <LockProvider>
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
                <BuyMeACoffeeButton
                  variant="options"
                  label={t('about_buy_coffee')}
                  ariaLabel={t('about_support_cta_aria')}
                  className="options-header__support"
                />
              </header>

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
                    <SecuritySettings />
                  </section>
                </div>

                <div
                  id="advanced-panel"
                  role="tabpanel"
                  aria-labelledby="advanced-tab"
                  hidden={activeTab !== 'advanced'}
                  className="tab-panel"
                >
                  <section className="section advanced-section">
                    <header className="advanced-section__header">
                      <h2>{t('settings_tab_advanced')}</h2>
                      <p className="advanced-section__description">
                        {t('settings_advanced_coming_soon')}
                      </p>
                    </header>
                    <AppearanceSettings />
                    <DataManagement />
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
      </LockProvider>
    </ThemeProvider>
  )
}

export default OptionsApp
