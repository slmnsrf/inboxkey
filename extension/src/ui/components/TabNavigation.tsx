import React from 'react'
import { t } from '@/lib/i18n'

export type Tab = 'accounts' | 'security' | 'advanced' | 'about'

interface TabNavigationProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="tab-navigation" role="tablist">
      <button
        role="tab"
        aria-selected={activeTab === 'accounts'}
        aria-controls="accounts-panel"
        id="accounts-tab"
        className={`tab-button ${activeTab === 'accounts' ? 'tab-button--active' : ''}`}
        onClick={() => onTabChange('accounts')}
      >
        {t('settings_tab_accounts')}
      </button>

      <button
        role="tab"
        aria-selected={activeTab === 'security'}
        aria-controls="security-panel"
        id="security-tab"
        className={`tab-button ${activeTab === 'security' ? 'tab-button--active' : ''}`}
        onClick={() => onTabChange('security')}
      >
        {t('settings_tab_security')}
      </button>

      <button
        role="tab"
        aria-selected={activeTab === 'advanced'}
        aria-controls="advanced-panel"
        id="advanced-tab"
        className={`tab-button ${activeTab === 'advanced' ? 'tab-button--active' : ''}`}
        onClick={() => onTabChange('advanced')}
      >
        {t('settings_tab_advanced')}
      </button>

      <button
        role="tab"
        aria-selected={activeTab === 'about'}
        aria-controls="about-panel"
        id="about-tab"
        className={`tab-button ${activeTab === 'about' ? 'tab-button--active' : ''}`}
        onClick={() => onTabChange('about')}
      >
        {t('settings_tab_about')}
      </button>
    </nav>
  )
}
