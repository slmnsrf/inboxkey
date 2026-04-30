/**
 * AboutSection Component (v2)
 *
 * Structured About tab: WHAT (one sentence) before WHY (developer note),
 * resources as a text link list, version pill with copy-to-clipboard,
 * and a footer with license/credits/companion-app/built-with.
 *
 * Reference: prototypes/settings/about-v2.html
 */

import React, { useState, useCallback } from 'react'
import { Copy, ArrowRight, ChevronDown } from 'lucide-react'
import brandMark from 'url:~assets/icon.svg'
import { t } from '@/lib/i18n'
import { BuyMeACoffeeButton } from './BuyMeACoffeeButton'
import {
  GITHUB_REPO_URL,
  INBOXBRIDGE_RELEASES_URL,
  INBOXKEY_WEBSITE_URL,
  RECOMMENDED_INBOXBRIDGE_VERSION,
} from '@/lib/constants'

const LINKEDIN_URL = 'https://www.linkedin.com/in/selmanseref/'
const PRIVACY_URL = `${GITHUB_REPO_URL}/blob/main/PRIVACY.md`

interface ResourceItem {
  label: string
  hint: string
  href: string
}

export function AboutSection() {
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const manifest = chrome.runtime.getManifest()
  const version = manifest.version
  const buildHash = (process.env.PLASMO_PUBLIC_GIT_HASH || 'dev').substring(
    0,
    8
  )
  const fullVersionString = `v${version}+${buildHash}`

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2500)
  }, [])

  const handleCopyVersion = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullVersionString)
      showToast(t('about_version_copied_toast'))
    } catch {
      showToast(`Could not copy. Version: ${fullVersionString}`)
    }
  }, [fullVersionString, showToast])

  const resources: ResourceItem[] = [
    {
      label: t('about_resource_website'),
      hint: t('about_resources_website_hint'),
      href: INBOXKEY_WEBSITE_URL,
    },
    {
      label: t('about_resource_source'),
      hint: t('about_resources_source_hint'),
      href: GITHUB_REPO_URL,
    },
    {
      label: t('about_resource_issues'),
      hint: t('about_resources_issues_hint'),
      href: `${GITHUB_REPO_URL}/issues`,
    },
    {
      label: t('about_resource_privacy'),
      hint: t('about_resources_privacy_hint'),
      href: PRIVACY_URL,
    },
  ]

  return (
    <article className="about">
      {/* Hero */}
      <header className="about-hero">
        <img className="about-hero__icon" src={brandMark} alt="" aria-hidden="true" />
        <h2 className="about-hero__name">{t('about_hero_name')}</h2>
        <button
          className="version-pill"
          type="button"
          aria-label={t('about_version_aria', [fullVersionString])}
          title={t('about_version_pill_hint')}
          onClick={handleCopyVersion}
        >
          <span className="version-pill__text">{fullVersionString}</span>
          <span className="version-pill__icon" aria-hidden="true">
            <Copy size={12} />
          </span>
        </button>
      </header>

      {/* WHAT (one sentence) */}
      <section className="about-what" aria-label="What InboxKey does">
        <p>{t('about_what')}</p>
      </section>

      {/* WHY (developer note) */}
      <section className="about-note" aria-labelledby="note-heading">
        <h2 id="note-heading" className="about-note__heading">
          {t('about_devnote_heading')}
        </h2>
        <p>{t('about_devnote_p1')}</p>
        <p>{t('about_devnote_p2')}</p>
        <p className="about-note__signature">
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('about_devnote_signature')}
          </a>
        </p>
      </section>

      {/* Resources */}
      <section className="about-section" aria-labelledby="resources-heading">
        <h2 id="resources-heading" className="about-section__heading">
          {t('about_resources_title')}
        </h2>
        <ul className="resource-list">
          {resources.map((resource) => (
            <li key={resource.href} className="resource-list__item">
              <a
                className="resource-link"
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="resource-link__label">
                  {resource.label}
                  <span className="resource-link__arrow" aria-hidden="true">
                    <ArrowRight size={14} />
                  </span>
                </span>
                <span className="resource-link__hint">{resource.hint}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="resource-list__footer">{t('about_contribute')}</p>
      </section>

      {/* Support CTA */}
      <section
        className="about-section about-support"
        aria-labelledby="support-heading"
      >
        <h2 id="support-heading" className="about-section__heading">
          {t('about_support_heading')}
        </h2>
        <p className="about-support__body">{t('about_support_body')}</p>
        <BuyMeACoffeeButton
          variant="about"
          label={t('about_buy_coffee')}
          ariaLabel={t('about_support_cta_aria')}
          className="coffee-cta"
        />
        <p className="about-support__disclaimer">
          {t('about_support_optional')}
        </p>
      </section>

      {/* Footer */}
      <footer className="about-footer">
        <p>
          Licensed under <strong>{t('about_license')}</strong>. Reproducible
          builds.
        </p>
        <p>
          {t('about_credits_made_by')}{' '}
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            SelmanSeref
          </a>
          .
        </p>
        <p>
          {t('about_companion_app', [`v${RECOMMENDED_INBOXBRIDGE_VERSION}`])}{' '}
          <a
            href={INBOXBRIDGE_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Downloads
          </a>
        </p>
        <p className="about-footer__build">{fullVersionString}</p>
        <p className="about-footer__credits">{t('about_built_with')}</p>
      </footer>

      {/* Build Verification (collapsed) */}
      <details className="about-verify">
        <summary className="about-verify__summary">
          <span>{t('about_verify_toggle')}</span>
          <span className="about-verify__chev" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </summary>
        <div className="about-verify__body">
          <p>{t('about_verify_intro')}</p>
          <ol>
            <li>
              Clone the repository:{' '}
              <code>git clone {GITHUB_REPO_URL}</code>
            </li>
            <li>
              Check out the exact commit:{' '}
              <code>git checkout {buildHash}</code>
            </li>
            <li>
              Build it locally:{' '}
              <code>cd extension && npm install && npm run build</code>
            </li>
          </ol>
          <p>
            Compare the resulting{' '}
            <code>build/chrome-mv3-prod</code> directory against the
            installed extension files. They should match byte-for-byte.
          </p>
        </div>
      </details>

      {/* Toast (version-copied feedback) */}
      <div
        className={`toast${toastVisible ? ' toast--visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>
    </article>
  )
}
