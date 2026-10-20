import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
const fixture = vi.hoisted(() => ({ existing: true, registered: true, readError: false, live: false, gameType: '2048_score',
  auth: vi.fn(async () => ({ userId: 'result-user' })), filters: [] as [string, unknown][] }))
vi.mock('@/lib/supabase/auth', () => ({ requireUserRole: fixture.auth }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const run = async () => table === 'tournaments' ? { data: { game_type: fixture.gameType, name: 'Tournament', status: fixture.live ? 'live' : 'completed',
    play_window_start: new Date(Date.now() - 60000).toISOString(), play_window_end: new Date(Date.now() + 60000).toISOString() } }
    : table === 'registrations' ? { data: fixture.registered ? { id: 'registration' } : null }
      : { data: fixture.existing ? { id: 'result-game' } : null, error: fixture.readError ? { message: 'failed' } : null }
  const q = { select: () => q, eq: (key: string, value: unknown) => { if (table === 'games') fixture.filters.push([key, value]); return q },
    single: run, maybeSingle: run }
  return q
} }) }))
import UnityPage from '@/app/(public)/tournaments/[id]/play/page'
import { Unity2048 } from '@/components/game/unity-2048'
function hasClient(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some(child => hasClient(child, type))
  if (!isValidElement<{ children?: ReactNode }>(node)) return false
  return node.type === type || hasClient(node.props.children, type)
}
beforeEach(() => { vi.clearAllMocks(); fixture.existing = true; fixture.registered = true; fixture.readError = false;
  fixture.live = false; fixture.gameType = '2048_score'; fixture.filters = [] })
describe('Unity result access at the canonical tournament entry', () => {
  it('offers Unity through the normal play route to a registered user in the window', async () => {
    fixture.live = true; fixture.existing = false
    expect(hasClient(await UnityPage({ params: Promise.resolve({ id: 'live-tournament' }) }), Unity2048)).toBe(true)
    expect(fixture.auth).toHaveBeenCalledOnce()
  })
  it('requires authentication before querying games or mounting Unity', async () => {
    fixture.auth.mockRejectedValueOnce(new Error('sign-in required'))
    await expect(UnityPage({ params: Promise.resolve({ id: 'live-tournament' }) })).rejects.toThrow('sign-in required')
    expect(fixture.filters).toEqual([])
  })
  it('does not turn other game types into a 2048 competition', async () => {
    fixture.gameType = 'snake_arena'
    await expect(UnityPage({ params: Promise.resolve({ id: 'other-game' }) })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })
  it('allows an owned existing game to be recovered after tournament completion', async () => {
    const tree = await UnityPage({ params: Promise.resolve({ id: 'closed-tournament' }) })
    expect(hasClient(tree, Unity2048)).toBe(true)
    expect(fixture.filters).toEqual([['tournament_id','closed-tournament'],['user_id','result-user']])
  })
  it('does not offer a new game after the window closes', async () => {
    fixture.existing = false
    expect(hasClient(await UnityPage({ params: Promise.resolve({ id: 'closed-tournament' }) }), Unity2048)).toBe(false)
  })
  it('does not offer start or recovery without registration or when lookup is unknown', async () => {
    fixture.registered = false
    expect(hasClient(await UnityPage({ params: Promise.resolve({ id: 'closed-tournament' }) }), Unity2048)).toBe(false)
    fixture.registered = true; fixture.readError = true
    expect(hasClient(await UnityPage({ params: Promise.resolve({ id: 'closed-tournament' }) }), Unity2048)).toBe(false)
  })
})
