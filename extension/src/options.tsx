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
import { FAQsSection } from './ui/components/FAQsSection'
import { AccountsPanel } from './ui/components/AccountsPanel'
import { AppearanceSettings } from './ui/components/AppearanceSettings'
import { AutomationSettings } from './ui/components/AutomationSettings'
import { AdvancedSettings } from './ui/components/AdvancedSettings'
import { BridgeStatusRow } from './ui/components/BridgeStatusRow'
import { BuyMeACoffeeButton } from './ui/components/BuyMeACoffeeButton'
import { ToastContainer } from './ui/components/ToastContainer'
import { BlacklistManageButton } from './ui/components/blacklist/BlacklistManageButton'
import { BlacklistModal } from './ui/components/blacklist/BlacklistModal'
import { ShieldCheck, EyeOff, Code2, Github } from 'lucide-react'
import { t } from './lib/i18n'
import { GITHUB_REPO_URL } from './lib/constants'
import markWhiteBase64 from 'data-base64:~/assets/mark-white.svg'
import './options.css'

function OptionsApp() {
  const [mailboxCount, setMailboxCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('accounts')
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false)
  const [blacklistInitialTab, setBlacklistInitialTab] = useState<'domains' | 'urls'>('domains')

  // Fetch mailbox count
  useEffect(() => {
    const fetchMailboxCount = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_MAILBOXES' })
        if (response.success) {
          setMailboxCount(response.mailboxes.length)
        }
      } catch (error) {
        console.warn('Failed to fetch mailboxes:', error)
      }
    }
    fetchMailboxCount()
  }, [])

  // Check URL params for tab override, or set default based on account status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab') as Tab | null
    if (tabParam && ['accounts', 'security', 'settings', 'faqs', 'about'].includes(tabParam)) {
      setActiveTab(tabParam)
    } else if (mailboxCount !== null) {
      // Always default to accounts tab
      setActiveTab('accounts')
    }
  }, [mailboxCount])

  // Listen for OPEN_BLACKLIST_MODAL message from popup
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'OPEN_BLACKLIST_MODAL') {
        setBlacklistInitialTab(message.tab || 'domains')
        setIsBlacklistModalOpen(true)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="options-container">
            <div className="options-shell">
              <header className="options-header" aria-labelledby="options-title">
                <div className="options-header__identity">
                  <span className="brand__icon" aria-hidden="true">
                    <img src={markWhiteBase64} alt="" width={24} height={24} />
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
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('settings_view_source_aria')}
                  >
                    <Code2 size={14} aria-hidden="true" />
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
                  <div className="settings-doc">
                    {/* Automation hero panel (full-width, dominant) */}
                    <AutomationSettings />

                    {/* InboxBridge status (after Automation, before Appearance) */}
                    <BridgeStatusRow />

                    {/* Appearance section */}
                    <section className="settings-section" aria-labelledby="theme-heading">
                      <header className="settings-section__head">
                        <h2 id="theme-heading" className="settings-section__title">
                          {t('settings_appearance_heading')}
                        </h2>
                        <p className="settings-section__intro">
                          {t('settings_appearance_description')}
                        </p>
                      </header>
                      <AppearanceSettings />
                    </section>

                    {/* Excluded sites section */}
                    <section className="settings-section" aria-labelledby="excluded-heading">
                      <header className="settings-section__head">
                        <h2 id="excluded-heading" className="settings-section__title">
                          {t('settings_blacklist_card_title')}
                        </h2>
                        <p className="settings-section__intro">
                          {t('settings_blacklist_card_description')}
                        </p>
                      </header>
                      <BlacklistManageButton onClick={() => setIsBlacklistModalOpen(true)} />
                    </section>

                    {/* Advanced (collapsible) */}
                    <AdvancedSettings />
                  </div>
                </div>

                {/* Blacklist Modal */}
                <BlacklistModal
                  isOpen={isBlacklistModalOpen}
                  onClose={() => setIsBlacklistModalOpen(false)}
                  initialTab={blacklistInitialTab}
                />

                <div
                  id="faqs-panel"
                  role="tabpanel"
                  aria-labelledby="faqs-tab"
                  hidden={activeTab !== 'faqs'}
                  className="tab-panel"
                >
                  <section className="section">
                    <FAQsSection />
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

              <section
                className="trust-banner"
                role="region"
                aria-label={t('settings_trust_region_label')}
              >
                <p className="trust-banner__headline">
                  {t('settings_trust_summary')}
                </p>
                <div className="trust-banner__pillars">
                  <div className="trust-pillar">
                    <span className="trust-pillar__icon" aria-hidden="true"><ShieldCheck size={14} /></span>
                    <span className="trust-pillar__label">{t('settings_trust_local_only')}</span>
                  </div>
                  <div className="trust-pillar">
                    <span className="trust-pillar__icon" aria-hidden="true"><EyeOff size={14} /></span>
                    <span className="trust-pillar__label">{t('settings_trust_safe')}</span>
                  </div>
                  <a
                    className="trust-pillar trust-pillar--link"
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('settings_trust_see_source_aria')}
                  >
                    <span className="trust-pillar__icon" aria-hidden="true"><Github size={14} /></span>
                    <span className="trust-pillar__label">{t('settings_trust_see_github')}</span>
                  </a>
                </div>
              </section>
            </div>
          </div>
          <ToastContainer />
        </ToastProvider>
    </ThemeProvider>
  )
}

export default OptionsApp
