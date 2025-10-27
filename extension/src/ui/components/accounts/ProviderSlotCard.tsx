import React, { useState } from 'react'
import { ProviderIcon } from '../icons/ProviderIcon'
import { LoadingSpinner } from '../icons/LoadingSpinner'
import { WarningIcon } from '../icons/StatusIcons'
import { ConfirmDisconnectModal } from './ConfirmDisconnectModal'
import type { ProviderKey, ProviderSlotState } from './types'
import { t } from '@/lib/i18n'

interface ProviderSlotCardProps {
  slot: ProviderSlotState
  onConnect?: () => void
  onDisconnect?: () => void
}

function getProviderBadgeColor(provider: ProviderKey) {
  if (provider === 'gmail') return 'provider-dot gmail'
  if (provider === 'outlook') return 'provider-dot outlook'
  return 'provider-dot'
}

function getStatusVariant(status: ProviderSlotState['status']) {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'pending'
    case 'locked':
      return 'pending'
    default:
      return 'disconnected'
  }
}

function getStatusLabel(slot: ProviderSlotState) {
  if (slot.status === 'connecting' && slot.stageLabel) return slot.stageLabel
  if (slot.status === 'connected') return t('accounts_status_connected')
  if (slot.status === 'locked') return t('accounts_status_locked')
  return t('accounts_status_not_connected')
}

export function ProviderSlotCard({
  slot,
  onConnect,
  onDisconnect,
}: ProviderSlotCardProps) {
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const statusVariant = getStatusVariant(slot.status)
  const statusLabel = getStatusLabel(slot)

  const handleDisconnectClick = () => {
    setShowDisconnectModal(true)
  }

  const handleConfirmDisconnect = () => {
    setShowDisconnectModal(false)
    onDisconnect?.()
  }

  const handleCancelDisconnect = () => {
    setShowDisconnectModal(false)
  }

  return (
    <>
      <article className="provider-card" data-status={slot.status}>
      <div className="provider-card__head">
        <div className="provider-card__title">
          <span className={getProviderBadgeColor(slot.provider)} aria-hidden="true" />
          <span>{slot.displayName}</span>
        </div>
        <span className="status-chip" data-variant={statusVariant} aria-live="polite">
          {slot.isBusy && <LoadingSpinner size="xsmall" />}
          {statusLabel}
        </span>
      </div>

      <div className="provider-card__meta">
        <span>{slot.infoLine}</span>
        {slot.lastSyncedLabel && (
          <span>{t('accounts_last_synced', slot.lastSyncedLabel)}</span>
        )}
      </div>

      <div className="provider-actions" role="group" aria-label={slot.displayName}>
        <button
          type="button"
          onClick={onConnect}
          className="btn btn--primary"
          disabled={
            slot.connectDisabled ||
            slot.status === 'connecting' ||
            slot.status === 'locked' ||
            slot.status === 'connected'
          }
          aria-label={
            slot.provider === 'gmail' ? t('aria_connect_gmail') : t('aria_connect_outlook')
          }
        >
          {slot.status === 'connecting' ? (
            <>
              <LoadingSpinner size="small" />
              {slot.stageLabel}
            </>
          ) : (
            <>
              <ProviderIcon provider={slot.provider} />
              {slot.provider === 'gmail'
                ? t('accounts_connect_gmail')
                : t('accounts_connect_outlook')}
            </>
          )}
        </button>

        <button
          type="button"
          className="btn btn--danger"
          onClick={handleDisconnectClick}
          disabled={slot.status !== 'connected' || slot.status === 'locked'}
          aria-label={
            slot.provider === 'gmail' ? t('aria_disconnect_gmail') : t('aria_disconnect_outlook')
          }
        >
          {t('accounts_disconnect')}
        </button>
      </div>

      <p className="microcopy">{slot.microcopy}</p>

      {slot.errorMessage && (
        <div className="error-banner" role="alert">
          <WarningIcon size={16} />
          <span>{slot.errorMessage}</span>
        </div>
      )}
    </article>

    <ConfirmDisconnectModal
      isOpen={showDisconnectModal}
      provider={slot.provider}
      email={slot.email || ''}
      onConfirm={handleConfirmDisconnect}
      onCancel={handleCancelDisconnect}
    />
    </>
  )
}
