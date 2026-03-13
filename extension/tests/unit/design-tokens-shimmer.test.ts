import { SHIMMER_BLUE, SHIMMER_GREEN, SHIMMER_RED } from '../../src/lib/design-tokens'

describe('Shimmer color tokens', () => {
  it('exports RGB channel strings for light theme', () => {
    expect(SHIMMER_BLUE.light).toBe('37, 99, 235')
    expect(SHIMMER_GREEN.light).toBe('16, 185, 129')
    expect(SHIMMER_RED.light).toBe('239, 68, 68')
  })

  it('exports RGB channel strings for dark theme', () => {
    expect(SHIMMER_BLUE.dark).toBe('10, 132, 255')
    expect(SHIMMER_GREEN.dark).toBe('48, 209, 88')
    expect(SHIMMER_RED.dark).toBe('255, 69, 58')
  })
})
