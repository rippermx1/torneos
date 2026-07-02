import { describe, expect, it } from 'vitest'
import { readFlowToken, isTerminalRegistrationFailure } from '@/lib/flow/settlement'

describe('readFlowToken', () => {
  it('lee token desde query string', async () => {
    const req = new Request('https://www.torneosplay.cl/api/flow/return?token=query-token', {
      method: 'POST',
    })

    await expect(readFlowToken(req)).resolves.toBe('query-token')
  })

  it('lee token desde body form-urlencoded', async () => {
    const req = new Request('https://www.torneosplay.cl/api/flow/return', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'form-token' }),
    })

    await expect(readFlowToken(req)).resolves.toBe('form-token')
  })

  it('lee token desde body json', async () => {
    const req = new Request('https://www.torneosplay.cl/api/flow/return', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'json-token' }),
    })

    await expect(readFlowToken(req)).resolves.toBe('json-token')
  })

  it('lee token desde body urlencoded aunque el content-type no sea el esperado', async () => {
    const req = new Request('https://www.torneosplay.cl/api/flow/return', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'token=raw-token',
    })

    await expect(readFlowToken(req)).resolves.toBe('raw-token')
  })

  it('retorna null si no existe token', async () => {
    const req = new Request('https://www.torneosplay.cl/api/flow/return', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ other: 'value' }),
    })

    await expect(readFlowToken(req)).resolves.toBeNull()
  })

  it('aborta y retorna null si el body excede el limite', async () => {
    const huge = 'x'.repeat(10_000)
    const req = new Request('https://www.torneosplay.cl/api/flow/return', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `token=${huge}`,
    })

    await expect(readFlowToken(req, 4096)).resolves.toBeNull()
  })

  it('respeta el query token aunque el body sea enorme (no lee body)', async () => {
    const huge = 'x'.repeat(10_000)
    const req = new Request('https://www.torneosplay.cl/api/flow/return?token=q', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `token=${huge}`,
    })

    await expect(readFlowToken(req, 4096)).resolves.toBe('q')
  })
})

// Un pago Flow confirmado cuya inscripción no puede asentarse por estas causas
// debe gatillar reembolso automático (terminal), no un reintento indefinido.
describe('isTerminalRegistrationFailure', () => {
  it('clasifica como terminales las fallas de negocio de register_for_tournament', () => {
    expect(isTerminalRegistrationFailure('Torneo lleno')).toBe(true)
    expect(isTerminalRegistrationFailure('Inscripciones cerradas')).toBe(true)
    expect(isTerminalRegistrationFailure('Cuota inconsistente: esperado=1000, recibido=500')).toBe(true)
  })

  it('trata como transitorios (reintentables) los demás errores', () => {
    expect(isTerminalRegistrationFailure('deadlock detected')).toBe(false)
    expect(isTerminalRegistrationFailure('could not serialize access')).toBe(false)
    // Monto inconsistente indica manipulación/datos corruptos: se investiga, no se auto-reembolsa.
    expect(isTerminalRegistrationFailure('Monto inconsistente: esperado=1000, recibido=999')).toBe(false)
    expect(isTerminalRegistrationFailure('Attempt no encontrado: tour-x')).toBe(false)
  })
})
