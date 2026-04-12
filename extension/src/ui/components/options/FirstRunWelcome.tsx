import React from 'react'
import { ArrowRight, KeyRound, Server } from 'lucide-react'

import { t } from '@/lib/i18n'
import { ProviderLogo } from './ProviderLogo'

type Provider = 'gmail' | 'imap-bridge' | 'google-messages'

interface FirstRunWelcomeProps {
  onProviderSelect: (provider: Provider) => void
}

export function FirstRunWelcome({ onProviderSelect }: FirstRunWelcomeProps) {
  return (
    <section className="firstrun">
      {/* Hero */}
      <header className="firstrun__hero">
        <div className="firstrun__icon">
          <KeyRound size={28} aria-hidden="true" />
        </div>
        <h2 className="firstrun__headline">{t('firstrun_headline')}</h2>
        <p className="firstrun__sub">{t('firstrun_sub')}</p>
      </header>

      {/* Primary: Gmail */}
      <div className="firstrun__providers">
        <button
          className="provider-card provider-card--primary"
          onClick={() => onProviderSelect('gmail')}
          type="button"
        >
          <span className="provider-card__icon provider-card__icon--gmail">
            <ProviderLogo provider="gmail" size={30} />
          </span>
          <div className="provider-card__body">
            <h3 className="provider-card__title">{t('firstrun_gmail_title')}</h3>
            <p className="provider-card__detail">{t('firstrun_gmail_detail')}</p>
          </div>
          <span className="provider-card__arrow" aria-hidden="true">
            <ArrowRight size={20} />
          </span>
        </button>
      </div>

      {/* Alternatives heading */}
      <p className="firstrun__alt-head">{t('firstrun_alt_heading')}</p>

      {/* Secondary provider grid */}
      <div className="firstrun__alt-grid">
        {/* IMAP / Other email providers */}
        <button
          className="provider-card provider-card--secondary"
          onClick={() => onProviderSelect('imap-bridge')}
          type="button"
        >
          <span className="provider-card__icon provider-card__icon--imap">
            <Server size={18} aria-hidden="true" />
          </span>
          <div className="provider-card__body">
            <h3 className="provider-card__title">{t('firstrun_imap_title')}</h3>
            <p className="provider-card__detail">{t('firstrun_imap_detail')}</p>
          </div>
          <span className="provider-card__arrow" aria-hidden="true">
            <ArrowRight size={16} />
          </span>
        </button>

        {/* Google Messages / Phone (Android) */}
        <button
          className="provider-card provider-card--secondary"
          onClick={() => onProviderSelect('google-messages')}
          type="button"
        >
          <span className="provider-card__icon provider-card__icon--gm">
            <ProviderLogo provider="google-messages" size={24} />
          </span>
          <div className="provider-card__body">
            <h3 className="provider-card__title">{t('firstrun_gm_title')}</h3>
            <p className="provider-card__detail">{t('firstrun_gm_detail')}</p>
          </div>
          <span className="provider-card__arrow" aria-hidden="true">
            <ArrowRight size={16} />
          </span>
        </button>
      </div>
    </section>
  )
}
