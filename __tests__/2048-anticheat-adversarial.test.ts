import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ prev: { client_timestamp: 1000, server_timestamp: '' },
  recent: [] as { move_number: number; server_timestamp: string }[],
  writes: [] as { table: string; filters: [string, unknown][] }[],
  readError: false, writeError: false, gameWriteError: false, profileMissing: false,
}))
vi.mock('@/lib/env', () => ({ getAnticheatConfig: () => ({ minHumanMoveMs: 80,
  botBurstThreshold: 5, minMovesForScoreCheck: 20, maxAvgPtsPerMove: 350 }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => { fixture.writes.push({ table: name, filters: [['p_user_id', args.p_user_id]] }); return { data: fixture.profileMissing ? null : { ok: true, banned: true, invalidatedGames: 1, settledGames: 0 }, error: fixture.writeError || fixture.gameWriteError ? { message: 'atomic failure' } : null } }, from: (table: string) => {
  const filters: [string, unknown][] = []; let write = false; let max = Infinity; let limit = Infinity
  const run = async () => {
    if (write) {
      fixture.writes.push({ table, filters })
      return { data: table === 'profiles' && !fixture.profileMissing ? { id: 'account' } : null,
        error: fixture.writeError || table === 'games' && fixture.gameWriteError ? { message: 'write failed' } : null }
    }
    if (fixture.readError) return { data: null, error: { message: 'read failed' } }
    return { data: filters.some(([key]) => key === 'move_number') ? fixture.prev
      : fixture.recent.filter(row => row.move_number <= max).slice(0, limit), error: null }
  }
  const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q },
    lte: (_key: string, value: number) => { max = value; return q }, order: () => q,
    limit: (value: number) => { limit = value; return q }, single: run,
    update: () => { write = true; return q }, then: (resolve: (value: unknown) => unknown) => run().then(resolve) }
  return q
} }) }))
import { analyzeMove } from '@/lib/anticheat/detector'
import { reviewWinnerStats } from '@/lib/anticheat/winner-review'

const time = (ms: number) => new Date(Date.UTC(2026, 9, 4) + ms).toISOString()
const input = { userId: 'account', gameId: 'game', moveNumber: 12, moveCount: 11,
  clientTimestamp: 2000, currentScore: 128, serverTimestamp: time(1000) }
beforeEach(() => {
  fixture.prev = { client_timestamp: 1000, server_timestamp: time(990) }
  fixture.recent = []; fixture.writes = []; fixture.readError = false; fixture.writeError = false
  fixture.gameWriteError = false; fixture.profileMissing = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
function burst(rows: number) {
  fixture.recent = Array.from({ length: rows }, (_, i) => ({ move_number: 12 - i, server_timestamp: time(1000 - i * 10) }))
}
describe('actual detector with adversarial inputs', () => {
  it('does not ban on four intervals when the threshold is five', async () => {
    burst(5)
    expect(await analyzeMove(input)).toMatchObject({ suspicious: true, reason: 'fast_move' })
    expect(fixture.writes).toEqual([])
  })
  it('uses five positive server intervals, even with a forged slow client clock', async () => {
    burst(6)
    expect(await analyzeMove({ ...input, clientTimestamp: 999999999 })).toMatchObject({ autoBanned: true, reason: 'bot_timing' })
    expect(fixture.writes).toEqual([{ table: 'set_2048_account_sanction', filters: [['p_user_id', 'account']] }])
  })
  it.each(['invalid', 'duplicate', 'slow'])('does not ban a broken %s burst', async kind => {
    burst(6); fixture.recent[3].server_timestamp = kind === 'invalid' ? 'bad'
      : kind === 'duplicate' ? fixture.recent[2].server_timestamp : time(500)
    expect((await analyzeMove(input)).autoBanned).not.toBe(true); expect(fixture.writes).toEqual([])
  })
  it('does not let future queued moves extend the current burst', async () => {
    burst(5)
    fixture.recent.unshift({ move_number: 13, server_timestamp: time(1010) })
    expect((await analyzeMove(input)).autoBanned).not.toBe(true)
    expect(fixture.writes).toEqual([])
  })
  it('treats a client clock rollback as a signal rather than proof for an account ban', async () => {
    fixture.prev.server_timestamp = time(500)
    expect(await analyzeMove({ ...input, clientTimestamp: 1000 })).toMatchObject({ suspicious: true, reason: 'client_clock' })
    expect(fixture.writes).toEqual([])
  })
  it.each(['error', 'missing', 'game error'])('does not report a fully applied sanction after %s', async kind => {
    burst(6); fixture.writeError = kind === 'error'; fixture.profileMissing = kind === 'missing'
    fixture.gameWriteError = kind === 'game error'
    await expect(analyzeMove(input)).rejects.toThrow()
    if (kind !== 'game error') expect(fixture.writes).toHaveLength(1)
  })
  it('does not infer a ban from missing timing data', async () => {
    fixture.readError = true
    expect(await analyzeMove(input)).toEqual({ suspicious: false }); expect(fixture.writes).toEqual([])
  })
  it('documents that paced automation can pass both current heuristics', async () => {
    for (let i = 2; i <= 40; i++) {
      fixture.prev = { client_timestamp: i * 500 - 500, server_timestamp: time(i * 500 - 500) }
      expect(await analyzeMove({ ...input, moveNumber: i + 1, moveCount: i, clientTimestamp: i * 500,
        serverTimestamp: time(i * 500), currentScore: i * 32 })).toEqual({ suspicious: false })
    }
    expect(reviewWinnerStats({ moveCount: 40, finalScore: 1280, durationMs: 19500,
      minIntervalMs: 500, avgIntervalMs: 500 })).toEqual([])
    expect(fixture.writes).toEqual([])
  })
})
