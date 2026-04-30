import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { buildSignString, signParams } from '@/lib/flow/client'

describe('buildSignString', () => {
  it('ordena llaves alfabéticamente y concatena clave+valor', () => {
    // Ejemplo de la spec oficial Flow:
    //   apiKey=XXXX-XXXX-XXXX, currency=CLP, amount=5000
    //   → "amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP"
    const result = buildSignString({
      apiKey: 'XXXX-XXXX-XXXX',
      currency: 'CLP',
      amount: 5000,
    })
    expect(result).toBe('amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP')
  })

  it('excluye el parámetro s (la firma misma)', () => {
    const result = buildSignString({
      apiKey: 'K',
      s: 'firma-falsa',
      token: 'T',
    })
    expect(result).toBe('apiKeyKtokenT')
    expect(result).not.toContain('firma-falsa')
  })

  it('omite valores undefined y null', () => {
    const result = buildSignString({
      apiKey: 'K',
      optional: undefined,
      timeout: null,
      token: 'T',
    })
    expect(result).toBe('apiKeyKtokenT')
  })

  it('convierte números a string concatenando directamente', () => {
    const result = buildSignString({ a: 1, b: 2 })
    expect(result).toBe('a1b2')
  })

  it('es determinístico independiente del orden de inserción', () => {
    const a = buildSignString({ z: '1', a: '2', m: '3' })
    const b = buildSignString({ a: '2', m: '3', z: '1' })
    expect(a).toBe(b)
  })
})

describe('signParams', () => {
  it('produce HMAC-SHA256 hex que coincide con la implementación nativa', () => {
    const secret = 'test-secret'
    const params = { apiKey: 'K', amount: 5000, currency: 'CLP' }

    const got = signParams(params, secret)

    const expectedString = 'amount5000apiKeyKcurrencyCLP'
    const expected = createHmac('sha256', secret)
      .update(expectedString)
      .digest('hex')

    expect(got).toBe(expected)
  })

  it('cambia si cambia el secret', () => {
    const params = { a: '1' }
    expect(signParams(params, 's1')).not.toBe(signParams(params, 's2'))
  })

  it('cambia si cambian los params', () => {
    expect(signParams({ a: '1' }, 's')).not.toBe(signParams({ a: '2' }, 's'))
  })

  it('produce un hex de 64 caracteres', () => {
    const sig = signParams({ a: '1' }, 'secret')
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })
})
