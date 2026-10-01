import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
const fixture = vi.hoisted(() => ({ existing: true, registered: true, readError: false, filters: [] as [string, unknown][] }))
vi.mock('@/lib/supabase/auth', () => ({ requireUserRole: async () => ({ userId: 'result-user' }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const run = async () => table === 'tournaments' ? { data: { game_type: '2048_score', name: 'Closed', status: 'completed',
    play_window_start: '2026-01-01T00:00:00Z', play_window_end: '2026-01-01T01:00:00Z' } }
    : table === 'registrations' ? { data: fixture.registered ? { id: 'registration' } : null }
      : { data: fixture.existing ? { id: 'result-game' } : null, error: fixture.readError ? { message: 'failed' } : null }
  const q = { select: () => q, eq: (key: string, value: unknown) => { if (table === 'games') fixture.filters.push([key, value]); return q },
    single: run, maybeSingle: run }
  return q
} }) }))
import UnityPage from '@/app/(public)/tournaments/[id]/play/unity/page'
import WebPage from '@/app/(public)/tournaments/[id]/play/page'
import { Unity2048 } from '@/components/game/unity-2048'
import { GameBoardClient } from '@/components/game/game-board-client'
function hasClient(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some(child => hasClient(child, type))
  if (!isValidElement<{ children?: ReactNode }>(node)) return false
  return node.type === type || hasClient(node.props.children, type)
}
beforeEach(() => { fixture.existing = true; fixture.registered = true; fixture.readError = false; fixture.filters = [] })
describe.each([['Unity',UnityPage,Unity2048],['web',WebPage,GameBoardClient]] as const)('%s result access', (_name, page, client) => {
  it('allows an owned existing game to be recovered after tournament completion', async () => {
    const tree = await page({ params: Promise.resolve({ id: 'closed-tournament' }) })
    expect(hasClient(tree, client)).toBe(true)
    expect(fixture.filters).toEqual([['tournament_id','closed-tournament'],['user_id','result-user']])
  })
  it('does not offer a new game after the window closes', async () => {
    fixture.existing = false
    expect(hasClient(await page({ params: Promise.resolve({ id: 'closed-tournament' }) }), client)).toBe(false)
  })
  it('does not offer start or recovery without registration or when lookup is unknown', async () => {
    fixture.registered = false
    expect(hasClient(await page({ params: Promise.resolve({ id: 'closed-tournament' }) }), client)).toBe(false)
    fixture.registered = true; fixture.readError = true
    expect(hasClient(await page({ params: Promise.resolve({ id: 'closed-tournament' }) }), client)).toBe(false)
  })
})
