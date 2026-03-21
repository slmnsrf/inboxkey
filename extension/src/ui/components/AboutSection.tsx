/**
 * AboutSection Component
 *
 * Editorial-style brand page with the developer note as the hero.
 * Displays: brand hero, "Why this exists" letter, resource links,
 * support CTA, footer credits, and build verification.
 *
 * Reference: prototypes/settings/about.html
 */

import React, { useState, useCallback } from 'react'
import {
  KeyRound,
  Tag,
  Code2,
  Bug,
  FileText,
  ArrowUpRight,
  Scale,
  ChevronRight,
} from 'lucide-react'
import { t } from '@/lib/i18n'
import { useToast } from '@/ui/contexts/ToastContext'
import { BuyMeACoffeeButton } from './BuyMeACoffeeButton'
import { GITHUB_REPO_URL } from '@/lib/constants'
import './about/AboutSection.css'

const LINKEDIN_URL = 'https://www.linkedin.com/in/selmanseref/'

interface ResourceLink {
  icon: React.ReactNode
  label: string
  hint: string
  href: string
}

export function AboutSection() {
  const { showToast } = useToast()
  const [verifyOpen, setVerifyOpen] = useState(false)

  const manifest = chrome.runtime.getManifest()
  const version = manifest.version
  const buildHash = (process.env.PLASMO_PUBLIC_GIT_HASH || 'dev').substring(0, 8)
  const fullVersionString = `v${version}+${buildHash}`

  const handleCopyVersion = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullVersionString)
      showToast(t('about_version_copied'), 'success')
    } catch {
      showToast(t('about_version_copy_failed'), 'error')
    }
  }, [fullVersionString, showToast])

  const toggleVerify = useCallback(() => {
    setVerifyOpen(prev => !prev)
  }, [])

  const resources: ResourceLink[] = [
    {
      icon: <Code2 size={18} />,
      label: t('about_resource_source'),
      hint: t('about_resource_source_hint'),
      href: GITHUB_REPO_URL,
    },
    {
      icon: <Bug size={18} />,
      label: t('about_resource_issues'),
      hint: t('about_resource_issues_hint'),
      href: `${GITHUB_REPO_URL}/issues`,
    },
    {
      icon: <FileText size={18} />,
      label: t('about_resource_privacy'),
      hint: t('about_resource_privacy_hint'),
      href: '#',
    },
  ]

  return (
    <div className="about-page">
      {/* Hero */}
      <div className="about-hero">
        <div className="about-hero__logo" aria-hidden="true">
          <KeyRound size={36} />
        </div>
        <h2 className="about-hero__name">{t('about_hero_name')}</h2>
        <div className="about-hero__version-row">
          <button
            className="about-hero__version"
            type="button"
            aria-label={t('about_version_aria', [fullVersionString])}
            title={t('about_version_click_hint')}
            onClick={handleCopyVersion}
          >
            <Tag size={12} aria-hidden="true" />
            {`v${version}`} &middot; {`build ${buildHash}`}
            <span className="about-hero__version-copy-hint" aria-hidden="true">
              {t('about_version_click_hint')}
            </span>
          </button>
        </div>
      </div>

      {/* Developer Note */}
      <div className="about-dev-note about-dev-note--letter">
        <h3 className="about-dev-note__heading">{t('about_devnote_heading')}</h3>
        <p className="about-dev-note__text">{t('about_devnote_p1')}</p>
        <p className="about-dev-note__text">{t('about_devnote_p2')}</p>
        <div className="about-dev-note__signature">
          <span className="about-dev-note__sig-line" aria-hidden="true" />
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="about-dev-note__sig-name"
          >
            {t('about_devnote_signature')}
          </a>
          <span className="about-dev-note__sig-line" aria-hidden="true" />
        </div>
      </div>

      {/* Resources */}
      <div className="about-links">
        <h3 className="about-links__title">{t('about_resources_title')}</h3>
        <div className="about-links__grid">
          {resources.map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="about-link-card"
            >
              <span className="about-link-card__icon" aria-hidden="true">
                {link.icon}
              </span>
              <span className="about-link-card__text">
                <span className="about-link-card__label">{link.label}</span>
                <span className="about-link-card__hint">{link.hint}</span>
              </span>
              <span className="about-link-card__arrow" aria-hidden="true">
                <ArrowUpRight size={14} />
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Support CTA */}
      <div className="about-support">
        <h3 className="about-support__heading">{t('about_support_heading')}</h3>
        <p className="about-support__message">{t('about_support_body')}</p>
        <BuyMeACoffeeButton
          variant="about"
          label={t('about_buy_coffee')}
          ariaLabel={t('about_support_cta_aria')}
        />
        <p className="about-support__disclaimer">{t('about_support_optional')}</p>
      </div>

      {/* Footer */}
      <footer className="about-footer">
        <span className="about-footer__license">
          <Scale size={12} aria-hidden="true" />
          {t('about_license')}
        </span>
        <p className="about-footer__credits">
          {t('about_credits_made_by')}{' '}
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            SelmanSeref
          </a>
          .
          <br />
          {t('about_credits_verified')}
        </p>
        <p className="about-footer__build">{fullVersionString}</p>
      </footer>

      {/* Build Verification */}
      <div className="about-build-verify">
        <button
          className="about-build-verify__toggle"
          type="button"
          aria-expanded={verifyOpen}
          aria-controls="about-build-verify-content"
          onClick={toggleVerify}
        >
          <span
            className={`about-build-verify__toggle-icon${verifyOpen ? ' about-build-verify__toggle-icon--expanded' : ''}`}
            aria-hidden="true"
          >
            <ChevronRight size={14} />
          </span>
          {t('about_verify_toggle')}
        </button>
        {verifyOpen && (
          <div
            className="about-build-verify__content"
            id="about-build-verify-content"
            role="region"
            aria-labelledby="about-build-verify-toggle"
          >
            <p>{t('about_verify_intro')}</p>
            <p>
              <strong>{t('about_verify_step1_label')}</strong>{' '}
              {t('about_verify_step1_text')}
            </p>
            <p>
              <strong>{t('about_verify_step2_label')}</strong>{' '}
              {t('about_verify_step2_text_before')}{' '}
              <code>chrome://extensions</code>
              {t('about_verify_step2_text_after')}
            </p>
            <p>
              <strong>{t('about_verify_step3_label')}</strong>{' '}
              {t('about_verify_step3_text_before')}{' '}
              <code>npm run build</code>{' '}
              {t('about_verify_step3_text_after')}
            </p>
            <p>{t('about_verify_closing')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
