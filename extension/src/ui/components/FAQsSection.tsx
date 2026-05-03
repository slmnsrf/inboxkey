/**
 * FAQsSection Component
 *
 * Reference tab with common questions users ask about the extension:
 * Gmail single-account limit, Google SMS limitation, InboxBridge,
 * privacy, unsigned installer warnings, GM phone pairing.
 *
 * Design: single bordered card with native <details> accordions
 * divided by borders. Matches Security/About visual weight.
 */

import React from 'react'
import { ChevronRight } from 'lucide-react'
import { t } from '@/lib/i18n'

interface FAQItemProps {
  qKey: string
  aKey: string
}

function FAQItem({ qKey, aKey }: FAQItemProps) {
  const answer = t(aKey)
  const paragraphs = answer.split('\n\n')

  return (
    <details className="faq-item">
      <summary className="faq-item__q">
        <span className="faq-item__q-text">{t(qKey)}</span>
        <span className="faq-item__chev" aria-hidden="true">
          <ChevronRight size={16} />
        </span>
      </summary>
      <div className="faq-item__a">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </details>
  )
}

export function FAQsSection() {
  return (
    <article className="faqs">
      <header className="faqs__head">
        <h1 className="faqs__title">{t('faqs_heading')}</h1>
        <p className="faqs__intro">{t('faqs_intro')}</p>
      </header>

      <div className="faqs__list">
        <FAQItem qKey="faqs_q4" aKey="faqs_a4" />
        <FAQItem qKey="faqs_q3" aKey="faqs_a3" />
        <FAQItem qKey="faqs_q8" aKey="faqs_a8" />
        <FAQItem qKey="faqs_q7" aKey="faqs_a7" />
        <FAQItem qKey="faqs_q5" aKey="faqs_a5" />
        <FAQItem qKey="faqs_q2" aKey="faqs_a2" />
        <FAQItem qKey="faqs_q6" aKey="faqs_a6" />
      </div>
    </article>
  )
}
