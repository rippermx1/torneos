import { describe, expect, it } from 'vitest'
import { generateTotpCode } from '../scripts/e2e-totp.mjs'

describe('E2E TOTP helper', () => {
  it('matches the six-digit RFC 6238 SHA-1 vector', () => {
    expect(
      generateTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000),
    ).toBe('287082')
  })
})
