import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPlayer2048RetentionReport } from '../lib/game/player-2048-retention'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), mfa: vi.fn(), rate: vi.fn(), appUrl: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }), createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: mocks.mfa }))
vi.mock('@/lib/env', () => ({ getAppUrl: mocks.appUrl }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate,
  rateLimitResponse: (rate: { unavailable?: boolean }) => Response.json({ error: 'limited' }, { status: rate.unavailable ? 503 : 429 }) }))

import { POST } from '../app/api/2048/activity/route'
import { GET } from '../app/api/admin/reports/2048-retention/route'

const userId = '00000000-0000-4000-8000-000000000001'
const request = (body: unknown = { mode: 'practice' }, extra: Record<string, string> = {}, origin = 'https://torneos.example') =>
  new Request('https://torneos.example/api/2048/activity', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) })
const reportRequest = (query = 'from=2026-10-01&to=2026-10-02') => new Request(`https://torneos.example/api/admin/reports/2048-retention?${query}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId, is_anonymous: false } }, error: null })
  mocks.mfa.mockResolvedValue({ ok: true, access: { userId } })
  mocks.rate.mockResolvedValue({ ok: true })
  mocks.appUrl.mockImplementation((fallback: string) => fallback)
  mocks.rpc.mockResolvedValue({ data: { activityDay: '2026-10-15' }, error: null })
})

describe('authenticated 2048 activity endpoint', () => {
  it('derives the identity from getUser and the day from DB, returning no PII', async () => {
    const response = await POST(request({ mode: 'daily' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, activityDay: '2026-10-15' })
    expect(mocks.rpc).toHaveBeenCalledWith('record_2048_player_activity', { p_user_id: userId, p_mode: 'daily' })
    expect(mocks.rate).toHaveBeenCalledWith({ key: `2048:activity:${userId}`, limit: 30, windowMs: 60_000, onError: 'deny' })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('does not record a guest, a Supabase anonymous account or a missing session', async () => {
    for (const result of [
      { data: { user: null }, error: null },
      { data: { user: { id: userId, is_anonymous: true } }, error: null },
      { data: { user: null }, error: { name: 'AuthSessionMissingError' } },
    ]) { mocks.getUser.mockResolvedValue(result); expect((await POST(request())).status).toBe(401) }
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.rate).not.toHaveBeenCalled()
  })

  it('fails closed when Auth, the distributed rate limit or persistence is unavailable', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthApiError', status: 401 } })
    expect((await POST(request())).status).toBe(503)
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 500 } })
    expect((await POST(request())).status).toBe(503)
    mocks.rate.mockResolvedValueOnce({ ok: false, unavailable: true })
    expect((await POST(request())).status).toBe(503)
    mocks.rate.mockResolvedValueOnce({ ok: false })
    expect((await POST(request())).status).toBe(429)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: `private ${userId}` } })
    const failed = await POST(request())
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain(userId)
  })

  it('requires exact same origin and uses configured APP_URL for a standalone internal URL', async () => {
    expect((await POST(request({}, {}, 'https://other.example'))).status).toBe(403)
    expect((await POST(request({ mode: 'practice' }, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await POST(new Request('https://torneos.example/api/2048/activity', { method: 'POST', body: '{}' }))).status).toBe(403)
    expect(mocks.getUser).not.toHaveBeenCalled()
    mocks.appUrl.mockReturnValue('https://torneos.example')
    const internal = new Request('http://localhost:3081/api/2048/activity', { method: 'POST', headers: { origin: 'https://torneos.example', 'content-type': 'application/json' }, body: '{"mode":"practice"}' })
    expect((await POST(internal)).status).toBe(200)
  })

  it('rejects forged fields, invalid JSON and unsupported bodies before Auth/DB', async () => {
    for (const body of [{ mode: 'practice', userId: 'other' }, { mode: 'daily', timestamp: 'yesterday' }, { mode: 'tournament' }, null, [], {}]) expect((await POST(request(body))).status).toBe(400)
    expect((await POST(request({ mode: 'practice' }, { 'content-type': 'text/plain' }))).status).toBe(415)
    const invalid = new Request('https://torneos.example/api/2048/activity', { method: 'POST', headers: { origin: 'https://torneos.example', 'content-type': 'application/json' }, body: '{broken' })
    expect((await POST(invalid)).status).toBe(400)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('enforces actual byte size even with absent or lying content-length', async () => {
    expect((await POST(request({ mode: 'practice' }, { 'content-length': '257' }))).status).toBe(413)
    expect((await POST(request({ mode: 'practice' }, { 'content-length': 'invalid' }))).status).toBe(400)
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(' '.repeat(128)))
      controller.enqueue(new TextEncoder().encode(' '.repeat(128) + '{"mode":"practice"}'))
      controller.close()
    } })
    const streamed = new Request('https://torneos.example/api/2048/activity', { method: 'POST', headers: { origin: 'https://torneos.example', 'content-type': 'application/json', 'content-length': '1' }, body: stream, duplex: 'half' } as RequestInit)
    expect((await POST(streamed)).status).toBe(413)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })
})

describe('2048 retention administrative report', () => {
  it('requires the existing administrative MFA guard before queries', async () => {
    mocks.mfa.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'MFA required' }, { status: 403 }) })
    expect((await GET(reportRequest())).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns only whitelisted aggregates and static limitations, with no cache', async () => {
    const report = buildPlayer2048RetentionReport([{ userId, activityDay: '2026-10-01', practice: true, daily: false }], '2026-10-01', '2026-10-02', '2026-10-15')
    mocks.rpc.mockResolvedValueOnce({ data: { ...report, users: [userId], cohorts: report.cohorts.map(row => ({ ...row, userId })) }, error: null })
    const response = await GET(reportRequest())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ ...report, limitations: expect.any(Array) })
    expect(JSON.stringify(body)).not.toContain(userId)
    expect(mocks.rpc).toHaveBeenCalledWith('report_2048_player_retention', { p_from: '2026-10-01', p_to: '2026-10-02' })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('rejects missing, invalid, reversed, oversized or duplicate date ranges and client asOf', async () => {
    for (const query of ['', 'from=2026-10-01', 'from=2026-02-30&to=2026-03-01', 'from=2026-10-02&to=2026-10-01',
      'from=2026-01-01&to=2026-04-01', 'from=2026-10-01&from=2026-10-02&to=2026-10-03', 'from=2026-10-01&to=2026-10-02&asOf=2030-01-01']) expect((await GET(reportRequest(query))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not turn a missing migration or inconsistent aggregates into a zero report', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private schema detail' } })
    const missing = await GET(reportRequest())
    expect(missing.status).toBe(503)
    expect(await missing.text()).not.toContain('schema')
    const wrong = buildPlayer2048RetentionReport([], '2026-10-01', '2026-10-02', '2026-10-15')
    wrong.totals.accounts = 99
    mocks.rpc.mockResolvedValueOnce({ data: wrong, error: null })
    expect((await GET(reportRequest())).status).toBe(503)
  })
})
