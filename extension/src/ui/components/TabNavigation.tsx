import React from 'react'
import { Users, Shield, Settings, Info } from 'lucide-react'
import { t } from '@/lib/i18n'

export type Tab = 'accounts' | 'security' | 'settings' | 'about'

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  accounts: <Users size={16} />,
  security: <Shield size={16} />,
  settings: <Settings size={16} />,
  about: <Info size={16} />,
}

interface TabNavigationProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const TABS: Tab[] = ['accounts', 'security', 'settings', 'about']

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
      {TABS.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          aria-controls={`${tab}-panel`}
          id={`${tab}-tab`}
          tabIndex={activeTab === tab ? 0 : -1}
          className={`tab-button ${activeTab === tab ? 'tab-button--active' : ''}`}
          onClick={() => onTabChange(tab)}
        >
          <span className="tab-button__icon" aria-hidden="true">{TAB_ICONS[tab]}</span>
          {t(`settings_tab_${tab}`)}
        </button>
      ))}
    </nav>
  )
}
