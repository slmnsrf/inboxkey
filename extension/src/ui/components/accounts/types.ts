export type ProviderKey = 'gmail' | 'outlook'

export type ProviderStatus = 'connected' | 'disconnected' | 'connecting' | 'locked'

export interface ProviderSlotState {
  provider: ProviderKey
  displayName: string
  status: ProviderStatus
  email?: string
  lastSyncedLabel?: string
  infoLine: string
  microcopy: string
  isBusy?: boolean
  stageLabel?: string
  errorMessage?: string | null
  connectDisabled?: boolean
}

export interface ImapAccountRow {
  id: string
  email: string
  host?: string
  lastSyncedLabel?: string
  statusText?: string
}

export type RecentItemKind = 'code' | 'link'

export interface RecentItem {
  id: string
  kind: RecentItemKind
  provider?: 'gmail' | 'outlook' | 'imap'
  from?: string
  subject?: string
  receivedAt: number
  receivedLabel: string
  code?: string
  url?: string
  domain?: string
}
