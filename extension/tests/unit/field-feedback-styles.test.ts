import { generateFieldFeedbackCSS } from '../../src/contents/field-feedback-styles'

describe('generateFieldFeedbackCSS', () => {
  it('returns a non-empty CSS string', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css.length).toBeGreaterThan(100)
  })

  it('includes shimmer-wrap selector', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('.inboxkey-shimmer-wrap')
  })

  it('includes listening state pseudo-element', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('.inboxkey-shimmer-wrap--listening::before')
  })

  it('includes tooltip selector', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('.inboxkey-field-tooltip')
  })

  it('includes inline text selector', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('.inboxkey-inline-text')
  })

  it('uses correct blue RGB for light theme', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('37, 99, 235')
  })

  it('uses correct blue RGB for dark theme', () => {
    const css = generateFieldFeedbackCSS('dark')
    expect(css).toContain('10, 132, 255')
  })

  it('includes @property for shimmer angle', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('@property --inboxkey-shimmer-angle')
  })

  it('includes reduced motion media query', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('includes dismiss button selector', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('.inboxkey-field-tooltip-dismiss')
  })

  it('includes conic-gradient for listening shimmer', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('conic-gradient')
  })

  it('includes mask-composite for border-only rendering', () => {
    const css = generateFieldFeedbackCSS('light')
    expect(css).toContain('mask-composite: exclude')
  })

  it('prefixes all classes with inboxkey-', () => {
    const css = generateFieldFeedbackCSS('light')
    // Extract all class selectors
    const classMatches = css.match(/\.[a-zA-Z][\w-]*/g) || []
    const nonPrefixed = classMatches.filter(c => !c.startsWith('.inboxkey-'))
    expect(nonPrefixed).toEqual([])
  })
})
