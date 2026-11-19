import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), auth: vi.fn(), rate: vi.fn(), claims: vi.fn(), update: vi.fn(), out: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ requireAnyRoleForApi: h.auth }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, storage: { from: () => ({ createSignedUrl: h.sign }) } }), createClient: async () => ({ auth: { getClaims: h.claims, updateUser: h.update, signOut: h.out } }) }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: h.rate, rateLimitResponse: () => Response.json({}, { status: 429 }) }))
import { POST as password } from '@/app/api/account/password/route'
import { POST as requests } from '@/app/api/account/data-requests/route'
import { kycDocument } from '@/lib/account/documents'
import { nextConfig } from '@/next.config'
const id = '0ad3bb19-5d38-4bc9-b6d7-d37dbb33c762'
const req = (body: unknown, origin = 'https://fixture.test') => new Request('https://fixture.test/api/account/password', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('APP_URL', 'https://fixture.test')
  h.auth.mockResolvedValue({ ok: true, access: { userId: id } }); h.rate.mockResolvedValue({ ok: true })
  h.rpc.mockResolvedValue({ data: 'private/path.pdf', error: null }); h.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null })
  h.update.mockResolvedValue({ error: null }); h.out.mockResolvedValue({ error: null })
})
describe('RM14 account boundaries', () => {
  it('keeps the account support history reachable without the legacy redirect', async () => {
    expect((await nextConfig.redirects!()).some(r => r.source === '/support')).toBe(false)
  })
  it('rejects cross origin reset before auth or writes', async () => { expect((await password(req({}, 'https://evil.test'))).status).toBe(403); expect(h.auth).not.toHaveBeenCalled() })
  it.each(['password', 'totp'])('cannot reset with %s alone', async method => { h.claims.mockResolvedValue({ data: { claims: { amr: [{ method, timestamp: Date.now()/1000 }] } } }); expect((await password(req({ password: 'New-password-123!' }))).status).toBe(403); expect(h.update).not.toHaveBeenCalled() })
  it('rejects old email proof', async () => { h.claims.mockResolvedValue({ data: { claims: { amr: [{ method: 'otp', timestamp: Date.now()/1000-601 }] } } }); expect((await password(req({ password: 'New-password-123!' }))).status).toBe(403) })
  it('resets with fresh email proof then revokes every session', async () => { h.claims.mockResolvedValue({ data: { claims: { amr: [{ method: 'otp', timestamp: Math.floor(Date.now()/1000) }] } } }); expect((await password(req({ password: 'New-password-123!' }))).status).toBe(200); expect(h.rpc).toHaveBeenCalledWith('revoke_app_sessions', { p_user: id }); expect(h.out).toHaveBeenCalled() })
  it('rejects invalid privacy kind without recording it', async () => { expect((await requests(req({ kind: {}, description: 'Datos de mi cuenta' }))).status).toBe(400); expect(h.rpc).not.toHaveBeenCalled() })
  it('does not mint document URLs when access audit fails', async () => { h.rpc.mockResolvedValue({ error: { code: 'PT403', message: 'Sin permiso' } }); expect((await kycDocument(id, id, 'front', false)).status).toBe(403); expect(h.sign).not.toHaveBeenCalled() })
  it('mints only a 60 second document URL after audit', async () => { expect((await kycDocument(id, id, 'front', true)).status).toBe(303); expect(h.sign).toHaveBeenCalledWith('private/path.pdf',60) })
})
