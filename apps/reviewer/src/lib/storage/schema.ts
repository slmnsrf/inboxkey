import Dexie, { Table } from 'dexie'

export interface Message {
  msgIdHash: string // PK
  provider: 'gmail' | 'outlook'
  messageId: string
  from: string
  senderETLD: string
  subject: string
  receivedAt: number
  bodyText?: string
  bodyHtml?: string
}

export interface Label {
  msgIdHash: string // PK (one label per message)
  label: 'TRUE' | 'FALSE' | 'MISSED'
  selectedCandidateIndex: number
  falseReason?: 'NOT_OTP' | 'WRONG_VALUE'
  correctValue?: string
  reasons: string[]
  note?: string
  createdAt: number
  updatedAt: number
}

export interface PreTag {
  msgIdHash: string // PK
  preTag: 'OTP' | 'MAGIC_LINK' | 'NONE'
  candidates: Array<{
    type: 'OTP' | 'MAGIC_LINK'
    value: string
    score: number
    [key: string]: any // Other extraction features
  }>
  topScore: number
  createdAt: number
}

export class ReviewerDB extends Dexie {
  messages!: Table<Message, string>
  labels!: Table<Label, string>
  preTags!: Table<PreTag, string>

  constructor() {
    super('InboxKeyReviewer')
    this.version(1).stores({
      messages: 'msgIdHash, provider, receivedAt, senderETLD',
      labels: 'msgIdHash, label, createdAt',
      preTags: 'msgIdHash, preTag, topScore',
    })
  }
}

export const db = new ReviewerDB()
