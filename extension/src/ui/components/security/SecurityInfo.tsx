import React from 'react'
import {
  FileText,
  Eye,
  MailSearch,
  BookOpen,
  Cpu,
  Database,
  Plug,
  SlidersHorizontal,
  Clock,
  ShieldOff,
  BarChart2,
  WifiOff,
  Send,
  Key,
  User,
  AppWindow,
  MousePointerClick,
  HardDrive,
  Code2,
  Cable,
  Github,
  BookOpenCheck,
  PackageCheck,
  ArrowRight,
  Mail,
} from 'lucide-react'
import { t } from '@/lib/i18n'
import './SecurityInfo.css'

const GITHUB_URL = 'https://github.com/slmnsrf/inboxkey'
const SECURITY_EMAIL = 'security@inboxkey.com'

interface FactItemData {
  icon: React.ReactNode
  titleKey: string
  detailKey: string
}

interface PermissionData {
  icon: React.ReactNode
  code: string
  reasonKey: string
}

interface SectionData {
  id: string
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
  items: FactItemData[]
}

const SECTIONS: SectionData[] = [
  {
    id: 'accessed',
    icon: <Eye size={18} />,
    titleKey: 'security_accessed_title',
    descriptionKey: 'security_accessed_description',
    items: [
      {
        icon: <MailSearch size={14} />,
        titleKey: 'security_accessed_verification_title',
        detailKey: 'security_accessed_verification_detail',
      },
      {
        icon: <BookOpen size={14} />,
        titleKey: 'security_accessed_readonly_title',
        detailKey: 'security_accessed_readonly_detail',
      },
      {
        icon: <Cpu size={14} />,
        titleKey: 'security_accessed_local_title',
        detailKey: 'security_accessed_local_detail',
      },
    ],
  },
  {
    id: 'stored',
    icon: <Database size={18} />,
    titleKey: 'security_stored_title',
    descriptionKey: 'security_stored_description',
    items: [
      {
        icon: <Plug size={14} />,
        titleKey: 'security_stored_connection_title',
        detailKey: 'security_stored_connection_detail',
      },
      {
        icon: <SlidersHorizontal size={14} />,
        titleKey: 'security_stored_preferences_title',
        detailKey: 'security_stored_preferences_detail',
      },
      {
        icon: <Clock size={14} />,
        titleKey: 'security_stored_cache_title',
        detailKey: 'security_stored_cache_detail',
      },
    ],
  },
  {
    id: 'not-done',
    icon: <ShieldOff size={18} />,
    titleKey: 'security_notdone_title',
    descriptionKey: 'security_notdone_description',
    items: [
      {
        icon: <BarChart2 size={14} />,
        titleKey: 'security_notdone_analytics_title',
        detailKey: 'security_notdone_analytics_detail',
      },
      {
        icon: <WifiOff size={14} />,
        titleKey: 'security_notdone_connections_title',
        detailKey: 'security_notdone_connections_detail',
      },
      {
        icon: <Send size={14} />,
        titleKey: 'security_notdone_data_title',
        detailKey: 'security_notdone_data_detail',
      },
    ],
  },
  {
    id: 'opensource',
    icon: <Github size={18} />,
    titleKey: 'security_opensource_title',
    descriptionKey: 'security_opensource_description',
    items: [
      {
        icon: <BookOpenCheck size={14} />,
        titleKey: 'security_opensource_available_title',
        detailKey: 'security_opensource_available_detail',
      },
      {
        icon: <PackageCheck size={14} />,
        titleKey: 'security_opensource_builds_title',
        detailKey: 'security_opensource_builds_detail',
      },
    ],
  },
]

const PERMISSIONS: PermissionData[] = [
  {
    icon: <User size={16} />,
    code: 'identity',
    reasonKey: 'security_perm_identity_reason',
  },
  {
    icon: <AppWindow size={16} />,
    code: 'tabs',
    reasonKey: 'security_perm_tabs_reason',
  },
  {
    icon: <MousePointerClick size={16} />,
    code: 'activeTab',
    reasonKey: 'security_perm_activetab_reason',
  },
  {
    icon: <HardDrive size={16} />,
    code: 'storage',
    reasonKey: 'security_perm_storage_reason',
  },
  {
    icon: <Code2 size={16} />,
    code: 'scripting',
    reasonKey: 'security_perm_scripting_reason',
  },
  {
    icon: <Cable size={16} />,
    code: 'nativeMessaging',
    reasonKey: 'security_perm_nativemessaging_reason',
  },
]

function FactItem({ icon, titleKey, detailKey }: FactItemData) {
  return (
    <div className="fact-item">
      <div className="fact-item__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="fact-item__content">
        <p className="fact-item__title">{t(titleKey)}</p>
        <p className="fact-item__detail">{t(detailKey)}</p>
      </div>
    </div>
  )
}

function TransparencySection({ id, icon, titleKey, descriptionKey, items }: SectionData) {
  const headingId = `${id}-heading`

  return (
    <div className="transparency-section" aria-labelledby={headingId}>
      <div className="transparency-section__header">
        <div className="transparency-section__icon" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h3 id={headingId} className="transparency-section__title">
            {t(titleKey)}
          </h3>
          <p className="transparency-section__description">{t(descriptionKey)}</p>
        </div>
      </div>
      <div className="fact-list">
        {items.map((item) => (
          <FactItem key={item.titleKey} {...item} />
        ))}
      </div>
    </div>
  )
}

function PermissionRow({ icon, code, reasonKey }: PermissionData) {
  return (
    <div className="permission-row">
      <div className="permission-row__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="permission-row__name">
        <code>{code}</code>
      </div>
      <div className="permission-row__reason">{t(reasonKey)}</div>
    </div>
  )
}

function PermissionsSection() {
  return (
    <div className="transparency-section" aria-labelledby="permissions-heading">
      <div className="transparency-section__header">
        <div className="transparency-section__icon" aria-hidden="true">
          <Key size={18} />
        </div>
        <div>
          <h3 id="permissions-heading" className="transparency-section__title">
            {t('security_permissions_title')}
          </h3>
          <p className="transparency-section__description">
            {t('security_permissions_description')}
          </p>
        </div>
      </div>
      <div className="permissions-grid">
        {PERMISSIONS.map((perm) => (
          <PermissionRow key={perm.code} {...perm} />
        ))}
      </div>
    </div>
  )
}

function SourceCTA() {
  return (
    <div className="source-cta">
      <div className="source-cta__icon" aria-hidden="true">
        <Github size={20} />
      </div>
      <div className="source-cta__content">
        <p className="source-cta__title">{t('security_source_cta_title')}</p>
        <p className="source-cta__detail">{t('security_source_cta_detail')}</p>
      </div>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="source-cta__link"
        aria-label={t('security_source_cta_link')}
      >
        {t('security_source_cta_link')} <ArrowRight size={14} />
      </a>
    </div>
  )
}

function SecurityContact() {
  return (
    <div className="security-contact">
      <div className="security-contact__icon" aria-hidden="true">
        <Mail size={18} />
      </div>
      <div className="security-contact__content">
        <p className="security-contact__title">{t('security_contact_title')}</p>
        <p className="security-contact__detail">
          {t('security_contact_detail', SECURITY_EMAIL).split(SECURITY_EMAIL)[0]}
          <a
            href={`mailto:${SECURITY_EMAIL}`}
            aria-label={`Email security team at ${SECURITY_EMAIL}`}
          >
            {SECURITY_EMAIL}
          </a>
          {t('security_contact_detail', SECURITY_EMAIL).split(SECURITY_EMAIL)[1]}
        </p>
      </div>
    </div>
  )
}

export function SecurityInfo() {
  return (
    <div className="security-info">
      {/* Hero */}
      <div className="transparency-hero">
        <div className="transparency-hero__icon" aria-hidden="true">
          <FileText size={24} />
        </div>
        <h2 className="transparency-hero__title">{t('security_hero_title')}</h2>
        <p className="transparency-hero__subtitle">{t('security_hero_subtitle')}</p>
      </div>

      <hr className="section-divider" />

      {/* Data handling sections */}
      {SECTIONS.map((section, index) => (
        <React.Fragment key={section.id}>
          <TransparencySection {...section} />
          {index < SECTIONS.length - 1 && <hr className="section-divider" />}
        </React.Fragment>
      ))}

      {/* Permissions */}
      <hr className="section-divider" />
      <PermissionsSection />

      {/* Source CTA */}
      <SourceCTA />

      {/* Security contact */}
      <SecurityContact />
    </div>
  )
}
