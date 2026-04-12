import React from 'react'
import { Server } from 'lucide-react'

import gmailLogo from 'url:~assets/providers/gmail.svg'
import googleMessagesLogo from 'url:~assets/providers/google-messages.svg'
import yahooLogo from 'url:~src/assets/providers/yahoo.svg'
import outlookLogo from 'url:~src/assets/providers/microsoft-outlook.svg'
import protonmailLogo from 'url:~src/assets/providers/protonmail.svg'
import icloudLogo from 'url:~src/assets/providers/icloud.svg'

const PROVIDER_LOGOS: Record<string, string | null> = {
  gmail: gmailLogo,
  'imap-bridge': null,
  'google-messages': googleMessagesLogo,
  yahoo: yahooLogo,
  outlook: outlookLogo,
  protonmail: protonmailLogo,
  icloud: icloudLogo,
}

interface ProviderLogoProps {
  provider: string
  imapHost?: string
  size?: number
}

export function ProviderLogo({ provider, imapHost, size = 18 }: ProviderLogoProps) {
  const resolvedProvider = imapHost ? resolveImapProvider(imapHost) : provider
  const logo = PROVIDER_LOGOS[resolvedProvider]

  if (logo) {
    return <img src={logo} alt="" width={size} height={size} style={{ display: 'block' }} />
  }

  return <Server size={size} aria-hidden="true" />
}

function resolveImapProvider(host: string): string {
  if (host.includes('yahoo')) return 'yahoo'
  if (host.includes('outlook') || host.includes('office365')) return 'outlook'
  if (host.includes('protonmail') || host.includes('proton.me')) return 'protonmail'
  if (host.includes('icloud') || host.includes('apple')) return 'icloud'
  if (host.includes('gmail') || host.includes('google')) return 'gmail'
  return 'imap-bridge'
}
