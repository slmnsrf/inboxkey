/**
 * Tests for `isShadowReplacement` — the rate-limit replacement guard
 * that lets startWatch() relinquish a stale shadow-input session in
 * favor of a coexisting visible split-group session.
 *
 * The full startWatch flow is mocked-port-and-storage heavy; this
 * suite focuses on the helper directly. Behavioral coverage of the
 * fall-through path is tied to the helper return value.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isShadowReplacement } from '../watch-session'

// ─── helpers ──────────────────────────────────────────────────────

function buildShadowInput(parent: HTMLElement): HTMLInputElement {
  const el = document.createElement('input')
  el.type = 'text'
  el.id = 'otp-input'
  el.maxLength = 6
  // Inline opacity:0 produces a CSS suppression cue. happy-dom rect
  // returns zeros by default, which also satisfies the small-rect cue.
  el.setAttribute(
    'style',
    'opacity: 0; caret-color: transparent;'
  )
  parent.appendChild(el)
  return el
}

function buildVisibleSplitGroup(parent: HTMLElement): HTMLInputElement[] {
  const wrapper = document.createElement('div')
  wrapper.className = 'otp-cells'
  parent.appendChild(wrapper)

  const inputs: HTMLInputElement[] = []
  for (let i = 1; i <= 6; i++) {
    const cell = document.createElement('input')
    cell.type = 'text'
    cell.name = `num${i}`
    // asymmetric-leader pattern
    cell.maxLength = i === 1 ? 6 : 1
    wrapper.appendChild(cell)
    inputs.push(cell)
  }
  return inputs
}

describe('watch-session — isShadowReplacement', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ── D.7 ──
  it('D.7 allows replacement when oldField is shadow and newField leads a visible split group', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    const shadow = buildShadowInput(form)
    const cells = buildVisibleSplitGroup(form)
    const leader = cells[0]

    expect(isShadowReplacement(shadow, leader)).toBe(true)
  })

  // ── D.8 (REGRESSION) ──
  it('D.8 rejects replacement when oldField is itself a split-group cell with a small rect', () => {
    // Two unrelated split groups. Old session is on a cell of the first
    // group (which has small per-cell rect — happy-dom defaults to 0,
    // so isPotentiallyShadowed returns true for it). The
    // detectSplitInputGroup(oldField) === null guard MUST fire and
    // prevent the replacement, otherwise tiny visible split cells get
    // mistaken for shadow inputs.
    const formA = document.createElement('form')
    document.body.appendChild(formA)
    const cellsA = buildVisibleSplitGroup(formA)
    const oldField = cellsA[0]

    const formB = document.createElement('form')
    document.body.appendChild(formB)
    const cellsB = buildVisibleSplitGroup(formB)
    const newField = cellsB[0]

    expect(isShadowReplacement(oldField, newField)).toBe(false)
  })

  // ── extra: identity short-circuit ──
  it('returns false when oldField === newField', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const shadow = buildShadowInput(form)
    expect(isShadowReplacement(shadow, shadow)).toBe(false)
  })

  // ── extra: detached fields short-circuit ──
  it('returns false when either field is detached from the document', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    const shadow = buildShadowInput(form)
    const cells = buildVisibleSplitGroup(form)
    const leader = cells[0]

    // Detach the leader.
    leader.parentElement?.removeChild(leader)

    expect(isShadowReplacement(shadow, leader)).toBe(false)
  })

  // ── extra: not-shadowed oldField ──
  it('returns false when oldField shows no shadow cues (normal input)', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    // Normal input (no opacity/caret cues, no rect stub yet — happy-dom
    // returns 0x0, so isPotentiallyShadowed returns true based on rect
    // alone). Override the rect to a normal size to suppress that cue.
    const oldField = document.createElement('input')
    oldField.type = 'text'
    oldField.maxLength = 6
    form.appendChild(oldField)
    const rect = {
      width: 200, height: 40,
      top: 0, left: 0, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => ({}),
    }
    Object.defineProperty(oldField, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect as DOMRect,
    })

    const cells = buildVisibleSplitGroup(form)
    const leader = cells[0]

    expect(isShadowReplacement(oldField, leader)).toBe(false)
  })

  // ── extra: newField is not in a split group ──
  it('returns false when newField is a plain single input', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    const shadow = buildShadowInput(form)
    const lone = document.createElement('input')
    lone.type = 'text'
    lone.name = 'code'
    form.appendChild(lone)

    expect(isShadowReplacement(shadow, lone)).toBe(false)
  })
})
