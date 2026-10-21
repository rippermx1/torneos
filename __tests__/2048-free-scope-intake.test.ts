import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server'
import { isFree2048IntakePathBlocked, isFree2048OutOfCatalogPath } from '@/lib/release/free-2048'

vi.mock('@supabase/ssr', () => ({ createServerClient: () => { throw new Error('Denials must not initialize Auth') } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => { throw new Error('No account operation') },
  createAdminClient: () => { throw new Error('No database operation') } }))
import { proxy, config } from '../proxy'
import * as intake from '@/app/api/profile/kyc/route'
import KycPage from '@/app/(user)/profile/kyc/page'

const origin = 'https://torneos.example'

describe('free identity intake and catalog boundary', () => {
  it.each(['/profile/kyc', '/profile/kyc/', '/api/profile/kyc', '/api/profile/kyc/upload',
    '/api/profile/%6byc', '/api/profile/%256byc', '/API/PROFILE/KYC'])('rejects every method before Auth for %s', async pathname => {
    expect(isFree2048IntakePathBlocked(pathname)).toBe(true)
    expect(doesProxyMatch({ config, nextConfig: {}, url: pathname })).toBe(true)
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await proxy(new NextRequest(origin + pathname, { method }))
      expect(response.status).toBe(423)
      expect((await response.json()).code).toBe('IDENTITY_INTAKE_DISABLED_FREE_RELEASE')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('location')).toBeNull()
    }
  })

  it('keeps every exported handler closed independently of the proxy and without reading a body', async () => {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
      const response = intake[method]()
      expect(response.status).toBe(423)
      expect((await response.json()).code).toBe('IDENTITY_INTAKE_DISABLED_FREE_RELEASE')
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
    const html = renderToStaticMarkup(KycPage())
    expect(html).toContain('2048 gratuito')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('type="file"')
  })

  it.each(['/play/factory-empire', '/play/factory-empire/challenge', '/play/snake-arena',
    '/play/ted-runner', '/play/alien-run', '/play/rts-duel', '/tournaments/snake-arena/event',
    '/api/snake-arena/practice/season', '/api/rts-duel/session',
    '/games/factory-empire/factory-empire-3d-035/Build/client.wasm.gz',
    '/games/snake-arena/Build/client.js', '/games/alien-run/index.html',
    '/play/%2573nake-arena'])('denies direct out-of-scope access to %s', async pathname => {
    expect(isFree2048OutOfCatalogPath(pathname)).toBe(true)
    expect(doesProxyMatch({ config, nextConfig: {}, url: pathname })).toBe(true)
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const response = await proxy(new NextRequest(origin + pathname, { method }))
      expect(response.status).toBe(404)
      expect((await response.json()).code).toBe('GAME_OUTSIDE_FREE_RELEASE')
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
  })

  it.each(['/play', '/play/catalog', '/play/unity', '/play/web', '/play/2048/ticket',
    '/games/2048/unity-2048-007/Build/client.wasm.gz', '/api/2048/activity', '/api/2048/daily',
    '/profile', '/api/profile/update', '/sign-up', '/auth/callback', '/legal/privacidad'])('keeps %s in the release boundary', pathname => {
    expect(isFree2048OutOfCatalogPath(pathname)).toBe(false)
    expect(isFree2048IntakePathBlocked(pathname)).toBe(false)
  })
})
