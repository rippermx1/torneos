import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/dev/local-environment', () => ({ isLocalEnvironment: () => false }))
import { sendOperationalEmail } from '@/lib/email/operational'
const notification = { id: 'immutable-id', recipient: 'ops@example.test', subject: 'Condition', text_body: '<script>mock & only</script>' }
const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal('fetch', fetchMock);fetchMock.mockReset();vi.stubEnv('RESEND_API_KEY', 'synthetic-test-only') })
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs() })
describe('operational email acceptance and retry semantics (mock network only)', () => {
  it('lost response retry uses identical key, recipient and body', async () => {
    fetchMock.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(Response.json({ id: 'provider-id' }))
    await expect(sendOperationalEmail(notification)).rejects.toThrow('lost response')
    expect(await sendOperationalEmail(notification)).toBe('provider-id')
    const first=fetchMock.mock.calls[0][1],second=fetchMock.mock.calls[1][1]
    expect(first.headers['Idempotency-Key']).toBe('ops/immutable-id');expect(second.body).toBe(first.body)
    expect(second.headers).toEqual(first.headers);expect(first.body).toContain('&lt;script&gt;');expect(first.signal).toBeDefined()
  })
  it.each([429,500,503])('HTTP %s remains retryable without false acceptance', async status => {
    fetchMock.mockResolvedValue(new Response('', { status }))
    await expect(sendOperationalEmail(notification)).rejects.toMatchObject({ retryable: true })
  })
  it.each([400,401,403,422])('HTTP %s is a permanent visible failure', async status => {
    fetchMock.mockResolvedValue(new Response('', { status }))
    await expect(sendOperationalEmail(notification)).rejects.toMatchObject({ retryable: false })
  })
  it('missing recipient or key cannot return success or issue a request', async () => {
    await expect(sendOperationalEmail({ ...notification, recipient: null })).rejects.toThrow('Destinatario')
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(sendOperationalEmail(notification)).rejects.toThrow('RESEND_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('success without provider identifier remains uncertain', async () => {
    fetchMock.mockResolvedValue(Response.json({}))
    await expect(sendOperationalEmail(notification)).rejects.toThrow('sin identificador')
  })
})
