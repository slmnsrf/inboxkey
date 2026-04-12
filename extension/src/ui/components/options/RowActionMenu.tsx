import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'

import { t } from '@/lib/i18n'

/* ===========================
   Row Action Menu
   ===========================
   "..." dropdown for each account row.
   Contains: Test connection, Edit, Remove account.
   Remove triggers an inline confirmation panel.
*/

interface RowActionMenuProps {
  email: string
  editLabel?: string
  onTest: () => void
  onEdit?: () => void
  onRemove: () => void
}

/**
 * Dropdown menu for account row actions.
 *
 * Opens a 3-item menu from the "..." button.
 * "Remove account" triggers inline confirmation via callback
 * that the parent (AccountRowUnified) manages.
 */
export function RowActionMenu({
  email,
  editLabel,
  onTest,
  onEdit,
  onRemove,
}: RowActionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  /* ------ Close on outside click ------ */
  useEffect(() => {
    if (!menuOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [menuOpen])

  /* ------ Close on Escape ------ */
  useEffect(() => {
    if (!menuOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  /* ------ Toggle menu ------ */
  const toggleMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setMenuOpen((prev) => !prev)
    },
    [],
  )

  /* ------ Action handlers (close menu, then fire callback) ------ */
  const handleTest = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setMenuOpen(false)
      onTest()
    },
    [onTest],
  )

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setMenuOpen(false)
      onEdit()
    },
    [onEdit],
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setMenuOpen(false)
      onRemove()
    },
    [onRemove],
  )

  return (
    <div className="row-menu-wrapper" ref={wrapperRef}>
      <button
        className="row-menu"
        type="button"
        aria-label={t('row_menu_label') || 'More actions'}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={toggleMenu}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      <div
        className={`row-menu-dropdown${menuOpen ? ' open' : ''}`}
        role="menu"
        aria-label={`${email} actions`}
      >
        <button
          className="row-menu-option"
          type="button"
          role="menuitem"
          onClick={handleTest}
        >
          <Activity size={14} aria-hidden="true" />
          {t('row_test_connection')}
        </button>

        {onEdit && (
          <button
            className="row-menu-option"
            type="button"
            role="menuitem"
            onClick={handleEdit}
          >
            <Pencil size={14} aria-hidden="true" />
            {editLabel || t('row_edit')}
          </button>
        )}

        <button
          className="row-menu-option row-menu-option--danger"
          type="button"
          role="menuitem"
          onClick={handleRemove}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('row_remove')}
        </button>
      </div>
    </div>
  )
}
