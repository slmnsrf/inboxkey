/**
 * Migration Dialog Component
 *
 * CRITICAL: This dialog handles one-time migration from encrypted to plaintext storage.
 * User data safety is paramount - clear messaging and error handling required.
 *
 * Flow:
 * 1. Prompt user for password
 * 2. Show progress during migration
 * 3. Display success with details
 * 4. Handle errors with clear messaging
 */

import React, { useState } from 'react'
import { migrateToPlaintext, skipMigration, type MigrationResult } from '@/lib/storage/migration-to-plaintext'
import { PIN_LENGTH, PIN_REGEX } from '@/lib/crypto/crypto-utils'

export interface MigrationDialogProps {
  onComplete: () => void
  onSkip: () => void
}

type MigrationStep = 'prompt' | 'migrating' | 'success' | 'error'

export function MigrationDialog({ onComplete, onSkip }: MigrationDialogProps) {
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<MigrationStep>('prompt')
  const [error, setError] = useState('')
  const [result, setResult] = useState<MigrationResult | null>(null)

  const handleMigrate = async () => {
    if (!PIN_REGEX.test(pin)) {
      setError('Please enter a valid 6-digit PIN')
      return
    }

    setStep('migrating')
    setError('')

    const migrationResult = await migrateToPlaintext(pin)
    setResult(migrationResult)

    if (migrationResult.status === 'success') {
      setStep('success')
      // Auto-close after 2 seconds on success
      setTimeout(() => onComplete(), 2000)
    } else if (migrationResult.status === 'not_needed') {
      // Migration not needed, just complete
      onComplete()
    } else {
      setStep('error')
      setError(migrationResult.error || 'Migration failed')
    }
  }

  const handleSkip = async () => {
    const confirmed = confirm(
      '⚠️ WARNING: Skipping migration will delete your connected email accounts and verification codes.\n\n' +
      'You will need to reconnect your email accounts.\n\n' +
      'Are you sure you want to continue?'
    )

    if (confirmed) {
      await skipMigration()
      onSkip()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && pin.length === PIN_LENGTH) {
      handleMigrate()
    }
  }

  return (
    <div className="migration-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="migration-title">
      <div className="migration-dialog">
        {step === 'prompt' && (
          <>
            <h2 id="migration-title">Security Update Required</h2>
            <p className="migration-message">
              InboxKey no longer requires a password for enhanced security and ease of use.
              Please enter your 6-digit PIN to migrate your connected email accounts.
            </p>
            <div className="pin-input-group">
              <label htmlFor="migration-pin" className="sr-only">
                Enter your 6-digit PIN
              </label>
              <input
                id="migration-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter 6-digit PIN"
                autoFocus
                aria-describedby="migration-description"
              />
            </div>
            {error && (
              <div className="error-message" role="alert" aria-live="assertive">
                {error}
              </div>
            )}
            <div className="button-group">
              <button
                onClick={handleMigrate}
                disabled={pin.length !== PIN_LENGTH}
                className="button-primary"
              >
                Migrate Data
              </button>
              <button onClick={handleSkip} className="button-secondary">
                Skip Migration
              </button>
            </div>
            <div id="migration-description" className="info-text">
              Your email accounts and verification codes will be preserved.
              This is a one-time step.
            </div>
          </>
        )}

        {step === 'migrating' && (
          <>
            <h2 id="migration-title">Migrating Your Data</h2>
            <div className="spinner" role="status" aria-label="Migration in progress" />
            <p className="migration-message">
              Please wait while we securely migrate your data.
              <br />
              Do not close this window.
            </p>
          </>
        )}

        {step === 'success' && result?.details && (
          <>
            <h2 id="migration-title">✓ Migration Complete</h2>
            <p className="migration-message success-message">
              Successfully migrated your data:
            </p>
            <ul className="migration-results">
              <li>{result.details.mailboxesMigrated} email {result.details.mailboxesMigrated === 1 ? 'account' : 'accounts'}</li>
              <li>{result.details.codesMigrated} verification {result.details.codesMigrated === 1 ? 'code' : 'codes'}</li>
            </ul>
            <p className="info-text">
              Redirecting...
            </p>
          </>
        )}

        {step === 'error' && (
          <>
            <h2 id="migration-title">Migration Failed</h2>
            <p className="error-message" role="alert">
              {error}
            </p>
            <div className="button-group">
              <button
                onClick={() => {
                  setStep('prompt')
                  setPin('')
                  setError('')
                }}
                className="button-primary"
              >
                Try Again
              </button>
              <button onClick={handleSkip} className="button-secondary">
                Skip Migration
              </button>
            </div>
            <div className="info-text">
              If you've forgotten your PIN, you can skip migration to reset the extension.
              <strong> This will delete your connected accounts.</strong>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
