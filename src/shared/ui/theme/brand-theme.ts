import { err, ok, type Result } from '../../kernel/result'
import { HEX_COLOR, OKLCH_COLOR } from '../config/color-patterns'

export interface BrandTheme {
  brand: string
  brandContrast: string
}

export interface BrandCssVariables {
  '--ds-color-brand': string
  '--ds-color-brand-contrast': string
}

function isSafeColor(value: string): boolean {
  return HEX_COLOR.test(value) || OKLCH_COLOR.test(value)
}

/** Maps an organization's theme to design tokens; anything but a literal color is rejected. */
export function themeToCssVariables(theme: BrandTheme): Result<BrandCssVariables, 'INVALID_COLOR'> {
  if (!isSafeColor(theme.brand) || !isSafeColor(theme.brandContrast)) return err('INVALID_COLOR')
  return ok({ '--ds-color-brand': theme.brand, '--ds-color-brand-contrast': theme.brandContrast })
}
