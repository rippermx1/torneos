import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { closeExpiredGame } from '@/lib/tournament/close-expired-game'

let server: Server | undefined
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined } })
const identity = { gameId: 'game-local', tournamentId: 'tournament-local', userId: 'user-local' }
const closed = { id: identity.gameId, status: 'completed', final_score: 64,
  end_reason: 'timeout', ended_at: '2026-10-01T16:00:00Z' }
async function database(replies: { status: number; body: unknown }[]) {
  const requests: { method: string; url: URL; body: unknown }[] = []
  server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk.toString()
    requests.push({ method: req.method!, url: new URL(req.url!, 'http://localhost'), body: text ? JSON.parse(text) : null })
    const reply = replies.shift() ?? { status: 500, body: { message: 'unexpected query' } }
    res.writeHead(reply.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(reply.body))
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture server unavailable')
  const client = createClient(`http://127.0.0.1:${address.port}`, 'local-test-placeholder', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as Parameters<typeof closeExpiredGame>[0]
  return { client, requests }
}
describe('Closure against the real Supabase HTTP client, isolated local PostgREST fixture', () => {
  it('returns the persisted row and sends owner, tournament and active filters in PATCH', async () => {
    const { client, requests } = await database([{ status: 200, body: [closed] }])
    const result = await closeExpiredGame(client, identity)
    expect(result).toEqual({ ok: true, game: closed })
    expect(requests).toHaveLength(1); expect(requests[0].method).toBe('PATCH')
    for (const [key, value] of [['id',identity.gameId],['tournament_id',identity.tournamentId],['user_id',identity.userId],['status','active']]) {
      expect(requests[0].url.searchParams.get(key)).toBe(`eq.${value}`)
    }
    expect(requests[0].url.searchParams.get('select')).toContain('final_score')
    expect(requests[0].url.searchParams.get('select')).toContain('current_board')
    expect(requests[0].url.searchParams.get('select')).toContain('move_count')
    expect(requests[0].body).toMatchObject({ status: 'completed', end_reason: 'timeout' })
  })
  it('handles actual zero-row PostgREST response by reading the concurrent winner', async () => {
    const winner = { ...closed, final_score: 128, end_reason: 'no_moves' }
    const { client, requests } = await database([
      { status: 200, body: [] },
      { status: 200, body: [winner] },
    ])
    expect(await closeExpiredGame(client, identity)).toEqual({ ok: true, game: winner })
    expect(requests.map(x => x.method)).toEqual(['PATCH','GET'])
    expect(requests[1].url.searchParams.get('user_id')).toBe('eq.user-local')
  })
  it('does not retry or confirm an update rejected by PostgREST', async () => {
    const { client, requests } = await database([{ status: 403, body: { code: '42501', message: 'permission denied' } }])
    const result = await closeExpiredGame(client, identity)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(503)
    expect(requests.map(x => x.method)).toEqual(['PATCH'])
  })
})
