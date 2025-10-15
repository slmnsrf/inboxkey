/**
 * Unit tests for field-feedback-styles module (Shadow DOM CSS)
 *
 * Verifies the CSS string returned by generateShadowCSS() contains the
 * correct :host() attribute selectors, media queries, and namespaced
 * properties for the Shadow DOM overlay approach. Also verifies that
 * legacy wrapper-class selectors are absent.
 */

import { describe, it, expect } from 'vitest'
import { generateShadowCSS, generateEnhancedKeyframes } from '../../src/contents/field-feedback-styles'

describe('generateShadowCSS', () => {
  it('returns a non-empty CSS string', () => {
    const css = generateShadowCSS()
    expect(css.length).toBeGreaterThan(100)
  })

  // ─── Host attribute selectors ───────────────────────────────────────────

  it('contains :host([data-state="listening"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-state="listening"])')
  })

  it('contains :host([data-state="filled"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-state="filled"])')
  })

  it('contains :host([data-state="copied"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-state="copied"])')
  })

  it('contains :host([data-state="timeout"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-state="timeout"])')
  })

  it('contains :host([data-state="idle"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-state="idle"])')
  })

  it('contains :host([data-compact="true"]) selector for narrow inputs', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-compact="true"])')
  })

  it('contains :host([data-visible="false"]) selector for scroll gating', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-visible="false"])')
  })

  it('contains :host([data-theme="dark"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-theme="dark"])')
  })

  it('contains :host([data-text-pos="below"]) selector for viewport flip', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-text-pos="below"])')
  })

  it('contains :host([data-focused="true"]) selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain(':host([data-focused="true"])')
  })

  // ─── Media queries ──────────────────────────────────────────────────────

  it('contains @media (forced-colors: active) block', () => {
    const css = generateShadowCSS()
    expect(css).toContain('@media (forced-colors: active)')
  })

  it('contains @media (prefers-reduced-motion: reduce) block', () => {
    const css = generateShadowCSS()
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  // ─── Namespaced custom property ─────────────────────────────────────────

  it('contains --inboxkey-angle namespaced property reference', () => {
    const css = generateShadowCSS()
    expect(css).toContain('--inboxkey-angle')
  })

  // ─── Internal structure selectors ───────────────────────────────────────

  it('contains .border-ring selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain('.border-ring')
  })

  it('contains .status-text selector', () => {
    const css = generateShadowCSS()
    expect(css).toContain('.status-text')
  })

  it('contains mask-composite for border-only rendering', () => {
    const css = generateShadowCSS()
    expect(css).toContain('mask-composite: exclude')
  })

  it('contains conic-gradient for listening shimmer', () => {
    const css = generateShadowCSS()
    expect(css).toContain('conic-gradient')
  })

  it('includes shimmer-rotate keyframes', () => {
    const css = generateShadowCSS()
    expect(css).toContain('@keyframes shimmer-rotate')
  })

  it('includes listening-dots animation', () => {
    const css = generateShadowCSS()
    expect(css).toContain('.listening-dots')
    expect(css).toContain('@keyframes dots-cycle')
  })

  // ─── Legacy selectors must be absent ────────────────────────────────────

  it('does NOT contain .inboxkey-shimmer-wrap (old wrapper class)', () => {
    const css = generateShadowCSS()
    expect(css).not.toContain('.inboxkey-shimmer-wrap')
  })

  it('does NOT contain .inboxkey-field-tooltip (old tooltip class)', () => {
    const css = generateShadowCSS()
    expect(css).not.toContain('.inboxkey-field-tooltip')
  })

  it('does NOT contain .inboxkey-inline-text (old inline text class)', () => {
    const css = generateShadowCSS()
    expect(css).not.toContain('.inboxkey-inline-text')
  })
})

describe('generateEnhancedKeyframes', () => {
  it('returns a non-empty string', () => {
    const css = generateEnhancedKeyframes()
    expect(css.length).toBeGreaterThan(10)
  })

  it('contains shimmer-rotate keyframe using --inboxkey-angle', () => {
    const css = generateEnhancedKeyframes()
    expect(css).toContain('@keyframes shimmer-rotate')
    expect(css).toContain('--inboxkey-angle: 0deg')
    expect(css).toContain('--inboxkey-angle: 360deg')
  })

  it('contains shimmer-sweep keyframe', () => {
    const css = generateEnhancedKeyframes()
    expect(css).toContain('@keyframes shimmer-sweep')
  })
})
