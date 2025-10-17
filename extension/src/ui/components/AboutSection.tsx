/**
 * AboutSection Component
 *
 * Displays trust badges, privacy statement, support CTA, and version info.
 * Designed to build user trust through transparency.
 *
 * Reference: ui-components.md - "Trust Badge Row" and "About Panel"
 */

import React from 'react'
import { t } from '@/lib/i18n'
import { BuyMeACoffeeButton } from './BuyMeACoffeeButton'

const TRUST_PILL_KEYS = [
  'about_trust_pill_open_source',
  'about_trust_pill_verified',
  'about_trust_pill_builds'
] as const

export function AboutSection() {
  const manifest = chrome.runtime.getManifest()
  const version = manifest.version
  const buildHash = (process.env.BUILD_HASH || 'dev').substring(0, 8)
  const versionLine = t('about_version_line', [`v${version}`, buildHash])

  return (
    <section className="about-section" aria-labelledby="about-heading">
      <header className="about-section__header">
        <h2 id="about-heading" className="about-section__title">
          {t('about_trust_title')}
        </h2>
        <div className="about-section__pills" role="list" aria-label={t('about_trust_title')}>
          {TRUST_PILL_KEYS.map(key => (
            <span key={key} className="about-section__pill" role="listitem">
              {t(key)}
            </span>
          ))}
        </div>
      </header>

      <div className="about-section__row">
        <div className="about-section__info">
          <p className="about-section__label">{t('about_source_label')}</p>
          <p className="about-section__description">{t('about_source_description')}</p>
        </div>
        <div className="about-section__actions">
          <a
            href="https://github.com/inboxkey/inboxkey"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            {t('about_view_source')}
          </a>
          <a
            href={`https://github.com/inboxkey/inboxkey/tree/${buildHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            {t('about_verify_build')}
          </a>
        </div>
      </div>

      <div className="about-section__row about-section__row--borderless">
        <div className="about-section__info">
          <p className="about-section__label">{t('about_support_label')}</p>
          <p className="about-section__description">{t('about_support_message')}</p>
        </div>
        <div className="about-section__actions">
          <BuyMeACoffeeButton
            variant="about"
            label={t('about_buy_coffee')}
            ariaLabel={t('about_support_cta_aria')}
          />
        </div>
      </div>

      <p className="about-section__hint">{t('about_support_disclaimer')}</p>

      <footer className="about-section__footer" aria-live="polite">
        <span>{versionLine}</span>
      </footer>
    </section>
  )
}
