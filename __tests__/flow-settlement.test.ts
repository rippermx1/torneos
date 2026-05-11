import { describe, expect, it } from 'vitest'
import { readFlowToken } from '@/lib/flow/settlement'

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
