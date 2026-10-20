import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { signParams } from '@/lib/flow/client'
import { isLocalEnvironment } from '../local-environment'
import { handleLocalFlow, readLocalPayment, confirmLocalPayment, verifyLocalFlowSignature } from '../local-flow'

let folder: string
const tournament = '00000000-0000-0000-0000-000000000001'
function signed(params: Record<string, string>) {
  const request = { ...params, apiKey: 'local-key' }
  return { ...request, s: signParams(request, 'local-secret') }
}
async function checkout(overrides = {}) {
  return handleLocalFlow('payment/create', signed({ commerceOrder: 'test-order', subject: 'Torneo local',
    currency: 'CLP', amount: '5000', email: 'player@example.com', urlConfirmation: 'http://127.0.0.1:3081/api/webhooks/flow',
    urlReturn: `http://127.0.0.1:3081/tournaments/${tournament}/return`, ...overrides }))
}
beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), 'torneos-local-flow-'))
  for (const [key, value] of Object.entries({ TORNEOS_LOCAL_MODE: '1', APP_URL: 'http://127.0.0.1:3081',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVER_URL: 'http://host.docker.internal:54321',
    FLOW_API_BASE: 'http://127.0.0.1:3000/api/local-flow', FLOW_API_KEY: 'local-key', FLOW_API_SECRET: 'local-secret', LOCAL_FLOW_DATA_DIR: folder })) vi.stubEnv(key, value)
})
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(folder, { recursive: true, force: true }) })
describe('isolated persistent local payment provider', () => {
  it('cannot be enabled against a public app or database', () => {
    expect(isLocalEnvironment()).toBe(true)
    expect(isLocalEnvironment({ ...process.env, APP_URL: 'https://www.torneosplay.cl' })).toBe(false)
    expect(isLocalEnvironment({ ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false)
    expect(isLocalEnvironment({ ...process.env, SUPABASE_SERVER_URL: 'https://example.supabase.co' })).toBe(false)
    expect(isLocalEnvironment({ ...process.env, TORNEOS_LOCAL_MODE: '' })).toBe(false)
  })
  it('accepts the exact local Docker backend while keeping public environments excluded', () => {
    const local = { ...process.env, SUPABASE_SERVER_URL: 'http://supabase_kong_torneos:8000' }
    expect(isLocalEnvironment(local)).toBe(true)
    expect(isLocalEnvironment({ ...local, APP_URL: 'https://www.torneosplay.cl' })).toBe(false)
    expect(isLocalEnvironment({ ...local, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false)
    expect(isLocalEnvironment({ ...local, SUPABASE_SERVER_URL: 'http://supabase_kong_torneos:54321' })).toBe(false)
  })
  it('rejects changed parameters and malformed signatures', () => {
    const params = signed({ amount: '5000' })
    expect(verifyLocalFlowSignature(params)).toBe(true)
    expect(verifyLocalFlowSignature({ ...params, amount: '1' })).toBe(false)
    expect(verifyLocalFlowSignature({ ...params, s: 'bad' })).toBe(false)
  })
  it('persists pending payments and rejects external callbacks and token traversal', async () => {
    const response = await checkout()
    const payment = await response.json()
    expect(payment.url).toBe('http://127.0.0.1:3081/dev/flow/payment')
    expect((await readLocalPayment(payment.token)).status).toBe(1)
    await expect(checkout({ urlConfirmation: 'https://evil.example/api/webhooks/flow' })).rejects.toThrow('Destino inválido')
    await expect(readLocalPayment('../secrets')).rejects.toThrow('Token inválido')
  })
  it('preserves a payment when a callback fails and safely retries confirmation', async () => {
    const { token } = await (await checkout()).json()
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(confirmLocalPayment(token, 2)).rejects.toThrow('reintenta')
    expect((await readLocalPayment(token)).status).toBe(2)
    expect((await confirmLocalPayment(token, 2)).searchParams.get('token')).toBe(token)
    await expect(confirmLocalPayment(token, 3)).rejects.toThrow('definitivo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0].toString()).toContain('/api/webhooks/flow')
  })
  it('refunds only confirmed payments and refuses excessive amounts', async () => {
    const { token, flowOrder } = await (await checkout()).json()
    const refund = (value: string) => handleLocalFlow('refund/create', signed({ amount: value, flowTrxId: String(flowOrder),
      refundCommerceOrder: 'refund-test', urlCallBack: 'http://127.0.0.1:3081/api/webhooks/flow/refund' }))
    await expect(refund('5000')).rejects.toThrow('Reembolso inválido')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    await confirmLocalPayment(token, 2)
    await expect(refund('5001')).rejects.toThrow('Reembolso inválido')
    const result = await (await refund('5000')).json()
    expect(result.status).toBe('pending')
    const final = await (await handleLocalFlow('refund/getStatus', signed({ token: result.token }))).json()
    expect(final.status).toBe('completed')
  })
})
