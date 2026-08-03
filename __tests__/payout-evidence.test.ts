import { describe, expect, it } from 'vitest'
import { getVerifiedPayoutEvidenceExtension } from '@/lib/payouts/evidence'

describe('payout evidence validation', () => {
  it('acepta firmas reales para los formatos permitidos', () => {
    expect(getVerifiedPayoutEvidenceExtension('application/pdf', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf')
    expect(getVerifiedPayoutEvidenceExtension('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(getVerifiedPayoutEvidenceExtension('image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
    expect(getVerifiedPayoutEvidenceExtension('image/webp', Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]))).toBe('webp')
  })

  it('rechaza MIME falsificado y formatos no permitidos', () => {
    expect(getVerifiedPayoutEvidenceExtension('application/pdf', new TextEncoder().encode('<html>'))).toBeNull()
    expect(getVerifiedPayoutEvidenceExtension('text/html', new TextEncoder().encode('<html>'))).toBeNull()
  })
})
