import { describe, expect, it } from 'vitest'
import { getAdminMfaQrSource } from '@/lib/supabase/admin-mfa-qr'

describe('admin MFA QR source', () => {
  it('removes trailing whitespace from the data URL returned by Supabase', () => {
    expect(getAdminMfaQrSource('data:image/svg+xml;utf-8,%3Csvg%2F%3E\n')).toBe(
      'data:image/svg+xml;utf-8,%3Csvg%2F%3E',
    )
  })

  it('encodes a raw SVG as a data URL', () => {
    expect(getAdminMfaQrSource('  <svg><rect /></svg>\n')).toBe(
      'data:image/svg+xml;utf-8,%3Csvg%3E%3Crect%20%2F%3E%3C%2Fsvg%3E',
    )
  })
})
