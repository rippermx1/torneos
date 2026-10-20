import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ load: vi.fn(), user: vi.fn() }))
vi.mock('@/lib/tournament/leaderboard', () => ({ loadTournamentLeaderboard: mocks.load }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
import { GET } from '@/app/api/tournaments/[id]/leaderboard/route'
const id = '82f51723-acf1-4676-8d9a-49906a11e47f'
const row = { user_id: 'private-id', final_score: 256, highest_tile: 128, move_count: 50, status: 'completed' }
const result = { tournament: { status: 'live', game_type: '2048_score' }, rows: [row], usernameMap: { 'private-id': 'Jugador' } }
const get = (value = id) => GET(new Request(`http://localhost/api/tournaments/${value}/leaderboard`), { params: Promise.resolve({ id: value }) })
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue(result); mocks.user.mockResolvedValue({ data: { user: { id: 'private-id' } } }) })
it('returns only public ranking fields, with no private ids or provisional prizes', async () => {
  const response = await get(), data = await response.json()
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(data).toEqual({ tournamentId: id, phase: 'provisional', rows: [{ position: 1, name: 'Jugador', score: 256, highestTile: 128, prizeCents: null, isMe: true }] })
  expect(JSON.stringify(data)).not.toContain('private-id')
})
it('uses persisted official ranks and awards only after tournament completion', async () => {
  mocks.load.mockResolvedValue({ ...result, tournament: { ...result.tournament, status: 'completed' }, rows: [{ ...row, rank: 3, prize_awarded_cents: 1000 }] })
  const data = await (await get()).json()
  expect(data.phase).toBe('official'); expect(data.rows[0]).toMatchObject({ position: 3, prizeCents: 1000 })
})
it('keeps finalizing results provisional', async () => {
  mocks.load.mockResolvedValue({ ...result, tournament: { ...result.tournament, status: 'finalizing' } })
  const data = await (await get()).json()
  expect(data.phase).toBe('provisional')
})
it('requires a session before reading the ranking, consistently with the platform proxy', async () => {
  mocks.user.mockResolvedValue({ data: { user: null } })
  expect((await get()).status).toBe(401); expect(mocks.load).not.toHaveBeenCalled()
})
it('fails visibly instead of passing a database error off as an empty ranking', async () => {
  mocks.load.mockRejectedValue(new Error('secret database detail'))
  const response = await get()
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret')
})
it('rejects invalid ids, missing tournaments and other games', async () => {
  expect((await get('invalid')).status).toBe(400); expect(mocks.load).not.toHaveBeenCalled()
  mocks.load.mockResolvedValue(null); expect((await get()).status).toBe(404)
  mocks.load.mockResolvedValue({ ...result, tournament: { ...result.tournament, game_type: 'snake_arena' } })
  expect((await get()).status).toBe(404)
})
