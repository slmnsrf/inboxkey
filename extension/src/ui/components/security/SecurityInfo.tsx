/**
 * SecurityInfo Component (v2)
 *
 * Magazine-style single-document security page with hero headline,
 * architecture diagram, numbered sections, and source-available footer.
 * All text via i18n. No actions, purely informational.
 */

import React from 'react'
import {
  Cloud,
  Globe,
  TextCursorInput,
  ArrowRight,
  Github,
  FileText,
} from 'lucide-react'
import { t } from '@/lib/i18n'
import { GITHUB_REPO_URL } from '@/lib/constants'

const LICENSE_URL = 'https://polyformproject.org/licenses/noncommercial/1.0.0/'

/* ------------------------------------------------------------------ */
/*  Section 01: What is read                                          */
/* ------------------------------------------------------------------ */
interface ListItem {
  num: string
  titleKey: string
  detailKey: string
}

const READ_ITEMS: ListItem[] = [
  {
    num: '1.1',
    titleKey: 'security_read_scan_title',
    detailKey: 'security_read_scan_detail',
  },
  {
    num: '1.2',
    titleKey: 'security_accessed_readonly_title',
    detailKey: 'security_accessed_readonly_detail',
  },
  {
    num: '1.3',
    titleKey: 'security_accessed_local_title',
    detailKey: 'security_accessed_local_detail',
  },
]

/* ------------------------------------------------------------------ */
/*  Section 02: What is stored                                        */
/* ------------------------------------------------------------------ */
const STORE_ITEMS: ListItem[] = [
  {
    num: '2.1',
    titleKey: 'security_stored_connection_title',
    detailKey: 'security_stored_connection_detail',
  },
  {
    num: '2.2',
    titleKey: 'security_store_tokens_title',
    detailKey: 'security_store_tokens_detail',
  },
  {
    num: '2.3',
    titleKey: 'security_stored_preferences_title',
    detailKey: 'security_stored_preferences_detail',
  },
  {
    num: '2.4',
    titleKey: 'security_store_cache_title',
    detailKey: 'security_store_cache_detail',
  },
]

/* ------------------------------------------------------------------ */
/*  Section 03: Permissions (ordered by impact, descending)           */
/* ------------------------------------------------------------------ */
interface PermItem {
  num: string
  title: string
  reasonKey: string
  api: string
  optional?: boolean
}

const PERM_ITEMS: PermItem[] = [
  {
    num: '3.1',
    title: 'Show the autofill chip on any website where a verification field appears',
    reasonKey: 'security_perm_hostpermissions_reason',
    api: 'host_permissions: https://*/*',
  },
  {
    num: '3.2',
    title: 'Inject the autofill chip into login pages',
    reasonKey: 'security_perm_scripting_reason',
    api: 'scripting',
  },
  {
    num: '3.3',
    title: 'Talk to the local InboxBridge helper',
    reasonKey: 'security_perm_nativemessaging_reason',
    api: 'nativeMessaging',
  },
  {
    num: '3.4',
    title: 'Detect login and verification pages',
    reasonKey: 'security_perm_tabs_reason',
    api: 'tabs',
  },
  {
    num: '3.5',
    title: 'Save preferences locally',
    reasonKey: 'security_perm_storage_reason',
    api: 'storage',
  },
  {
    num: '3.6',
    title: 'Schedule background email checks',
    reasonKey: 'security_perm_alarms_reason',
    api: 'alarms',
  },
  {
    num: '3.7',
    title: 'Show system notifications when a code is found',
    reasonKey: 'security_perm_notifications_reason',
    api: 'notifications',
    optional: true,
  },
]

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function ArchitectureDiagram() {
  return (
    <section className="sec-arch" aria-labelledby="arch-heading">
      <h2 id="arch-heading" className="sr-only">
        How data flows
      </h2>
      <div
        className="sec-arch__diagram"
        role="img"
        aria-label="Diagram: your email provider sends verification codes to your browser. Inside your device, the browser passes them to the autofill chip. Nothing else leaves the device."
      >
        {/* External: The internet */}
        <div className="sec-arch__container sec-arch__container--external">
          <span className="sec-arch__container-label">The internet</span>
          <div className="sec-arch__node">
            <span className="sec-arch__node-icon sec-arch__node-icon--external" aria-hidden="true">
              <Cloud size={18} />
            </span>
            <span className="sec-arch__node-label">Your email provider</span>
          </div>
        </div>

        <div className="sec-arch__arrow" aria-hidden="true">
          <ArrowRight size={18} />
        </div>

        {/* Device: Your device */}
        <div className="sec-arch__container sec-arch__container--device">
          <span className="sec-arch__container-label">Your device</span>
          <div className="sec-arch__nodes">
            <div className="sec-arch__node">
              <span className="sec-arch__node-icon" aria-hidden="true">
                <Globe size={18} />
              </span>
              <span className="sec-arch__node-label">Your browser</span>
            </div>
            <div className="sec-arch__arrow" aria-hidden="true">
              <ArrowRight size={18} />
            </div>
            <div className="sec-arch__node">
              <span className="sec-arch__node-icon" aria-hidden="true">
                <TextCursorInput size={18} />
              </span>
              <span className="sec-arch__node-label">Autofill chip</span>
            </div>
          </div>
        </div>
      </div>
      <p className="sec-arch__caption">{t('security_arch_caption')}</p>
    </section>
  )
}

function SectionList({ items }: { items: ListItem[] }) {
  return (
    <ul className="sec-list">
      {items.map((item) => (
        <li key={item.num} className="sec-list__item">
          <span className="sec-list__num">{item.num}</span>
          <p className="sec-list__item-title">{t(item.titleKey)}</p>
          <p className="sec-list__item-detail">{t(item.detailKey)}</p>
        </li>
      ))}
    </ul>
  )
}

function PermissionsList() {
  return (
    <div className="sec-perms">
      {PERM_ITEMS.map((perm) => (
        <div key={perm.num} className="sec-perm">
          <span className="sec-perm__num">{perm.num}</span>
          <div className="sec-perm__head">
            <p className="sec-perm__title">{perm.title}</p>
            {perm.optional && <span className="sec-perm__tag">Optional</span>}
          </div>
          <p className="sec-perm__reason">{t(perm.reasonKey)}</p>
          <span className="sec-perm__api">{perm.api}</span>
        </div>
      ))}
    </div>
  )
}

function SourceMeta() {
  const version = chrome.runtime.getManifest().version
  const buildHash = (process.env.PLASMO_PUBLIC_GIT_HASH || 'dev').substring(0, 7)

  return (
    <div className="sec-source__meta">
      <span>
        <strong>Version</strong>
        {version}
      </span>
      <span>
        <strong>Build</strong>
        {buildHash}
      </span>
      <span>
        <strong>License</strong>
        PolyForm-Noncommercial-1.0.0
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function SecurityInfo() {
  return (
    <article className="sec-doc">
      {/* Hero */}
      <section className="sec-hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading" className="sec-hero__headline">
          {t('security_hero_headline_v2')}
        </h1>
        <p className="sec-hero__sub">{t('security_hero_sub_v2')}</p>
      </section>

      {/* Architecture diagram */}
      <ArchitectureDiagram />

      {/* 01 What is read */}
      <section className="sec-block" aria-labelledby="read-heading">
        <h2 id="read-heading" className="sec-block__heading">
          <span className="sec-block__num">01</span>
          {t('security_section_read')}
        </h2>
        <p className="sec-block__intro">
          The only data the extension reads from your email account.
        </p>
        <SectionList items={READ_ITEMS} />
      </section>

      {/* 02 What is stored */}
      <section className="sec-block" aria-labelledby="store-heading">
        <h2 id="store-heading" className="sec-block__heading">
          <span className="sec-block__num">02</span>
          {t('security_section_store')}
        </h2>
        <p className="sec-block__intro">
          Everything saved locally, and nothing else.
        </p>
        <SectionList items={STORE_ITEMS} />
      </section>

      {/* 03 Permissions */}
      <section className="sec-block" aria-labelledby="perm-heading">
        <h2 id="perm-heading" className="sec-block__heading">
          <span className="sec-block__num">03</span>
          {t('security_section_perms')}
        </h2>
        <p className="sec-block__intro">
          Each Chrome permission is listed by what it actually enables. The
          technical name is shown in muted mono next to it for verification
          against the manifest. Permissions are ordered by impact, highest first.
        </p>
        <PermissionsList />
      </section>

      {/* 04 Source available */}
      <section
        className="sec-block sec-source"
        aria-labelledby="source-heading"
      >
        <h2 id="source-heading" className="sec-block__heading">
          <span className="sec-block__num">04</span>
          {t('security_section_source')}
        </h2>
        <p className="sec-block__intro">{t('security_source_body')}</p>
        <SourceMeta />
        <div className="sec-source__links">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="sec-source__link"
          >
            <Github size={14} aria-hidden="true" />
            View source on GitHub
          </a>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="sec-source__link sec-source__link--ghost"
          >
            <FileText size={14} aria-hidden="true" />
            Read the license
          </a>
        </div>
      </section>
    </article>
  )
}
