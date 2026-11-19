import { describe, expect, it } from 'vitest'
import { themeToCssVariables } from '@shared/ui/theme/brand-theme'

describe('brand theme', () => {
  it('maps valid colors to design tokens', () => {
    expect(themeToCssVariables({ brand: '#0a7cff', brandContrast: 'oklch(0.98 0 0)' }))
      .toEqual({ ok: true, value: { '--ds-color-brand': '#0a7cff', '--ds-color-brand-contrast': 'oklch(0.98 0 0)' } })
  })
  it.each(['red;background:url(//x)', 'var(--x)', '#12', 'oklch(1 0 0);x:y'])('rejects unsafe value %s', (brand) => {
    expect(themeToCssVariables({ brand, brandContrast: '#fff' })).toEqual({ ok: false, error: 'INVALID_COLOR' })
  })
  it('rejects an unsafe contrast color too', () => {
    expect(themeToCssVariables({ brand: '#fff', brandContrast: 'red;x:y' })).toEqual({ ok: false, error: 'INVALID_COLOR' })
  })
})
