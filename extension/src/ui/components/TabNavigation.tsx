import React from 'react'
import { t } from '@/lib/i18n'

export type Tab = 'accounts' | 'security' | 'advanced' | 'about'

interface TabNavigationProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const TABS: Tab[] = ['accounts', 'security', 'advanced', 'about']

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  /**
   * Handle arrow key navigation for ARIA tablist pattern.
   * See: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TABS.indexOf(activeTab)

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        onTabChange(TABS[(currentIndex + 1) % TABS.length])
        break
      case 'ArrowLeft':
        e.preventDefault()
        onTabChange(TABS[(currentIndex - 1 + TABS.length) % TABS.length])
        break
      case 'Home':
        e.preventDefault()
        onTabChange(TABS[0])
        break
      case 'End':
        e.preventDefault()
        onTabChange(TABS[TABS.length - 1])
        break
    }
  }

  return (
    <nav className="tab-navigation" role="tablist" onKeyDown={handleKeyDown}>
      <button
        role="tab"
        aria-selected={activeTab === 'accounts'}
        aria-controls="accounts-panel"
        id="accounts-tab"
        tabIndex={activeTab === 'accounts' ? 0 : -1}
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
        tabIndex={activeTab === 'security' ? 0 : -1}
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
        tabIndex={activeTab === 'advanced' ? 0 : -1}
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
        tabIndex={activeTab === 'about' ? 0 : -1}
        className={`tab-button ${activeTab === 'about' ? 'tab-button--active' : ''}`}
        onClick={() => onTabChange('about')}
      >
        {t('settings_tab_about')}
      </button>
    </nav>
  )
}
