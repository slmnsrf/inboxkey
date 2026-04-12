import React from 'react'

import { t } from '@/lib/i18n'

interface RecentCode {
  code: string
  domain: string
  email: string
  provider: string
  timeAgo: string
}

interface RecentActivityProps {
  codes: RecentCode[]
}

const PROVIDER_DOT_CLASS: Record<string, string> = {
  gmail: 'recent-row__provider-dot--gmail',
  'imap-bridge': 'recent-row__provider-dot--imap',
  'google-messages': 'recent-row__provider-dot--gm',
}

export function RecentActivity({ codes }: RecentActivityProps) {
  if (codes.length === 0) return null

  return (
    <div className="recent">
      <div className="recent__head">
        <h2 className="recent__title">{t('recent_activity_title')}</h2>
      </div>

      <div className="recent__list">
        {codes.map((item, index) => (
          <div className="recent-row" key={index}>
            <span className="recent-row__code">{item.code}</span>
            <div className="recent-row__info">
              <span className="recent-row__source">{item.domain}</span>
              <span className="recent-row__provider">
                <span
                  className={`recent-row__provider-dot ${PROVIDER_DOT_CLASS[item.provider] || 'recent-row__provider-dot--imap'}`}
                />
                {item.email}
              </span>
            </div>
            <span className="recent-row__time">{item.timeAgo}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export type { RecentCode, RecentActivityProps }
