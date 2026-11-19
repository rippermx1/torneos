// Read-only result verification against the identified, already-closed local fixture.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { localEnv, docker } from './2048-integrity-local.mjs'

async function main() {
  const env = await localEnv(), operative = process.argv.includes('--operative')
  const origin = operative ? env.APP_URL : 'http://127.0.0.1:65175'
  const candidate = JSON.parse(await fs.readFile('artifacts/2048-result/candidate.json', 'utf8'))
  if (operative) {
    const instance = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
    assert.equal(instance.Image, candidate.imageId); assert.equal(instance.State.Health.Status, 'healthy')
  }
  const fixture = JSON.parse(await fs.readFile('artifacts/2048-background/manifest.json', 'utf8'))
  const closed = JSON.parse(await fs.readFile('artifacts/2048-background/closed-verification.json', 'utf8'))
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const assertClosed = async () => {
    const game = await service.from('games').select('id,status,current_board,final_score,move_count,started_at,ended_at,end_reason')
      .eq('id', closed.game.id).single()
    assert.equal(game.error, null); assert.deepEqual(game.data, closed.game)
    const moves = await service.from('game_moves').select('move_number,direction,server_timestamp')
      .eq('game_id', closed.game.id).order('move_number')
    assert.equal(moves.error, null); assert.deepEqual(moves.data, closed.moves)
  }
  await assertClosed()
  const credentials = JSON.parse(await fs.readFile('artifacts/2048-background/credentials.private.json', 'utf8'))
  const jar = new Map()
  const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookieOptions: { name: 'sb-127-auth-token' }, cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => cookies.forEach(cookie => jar.set(cookie.name, cookie.value)),
    } })
  const signed = await auth.auth.signInWithPassword(credentials)
  assert.equal(signed.error, null); assert.equal(signed.data.user.id, fixture.userId)
  try {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
    const url = `${origin}/api/tournaments/${fixture.tournamentId}/leaderboard`
    const response = await fetch(url, { headers: { cookie }, redirect: 'manual' })
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/json/)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const data = await response.json()
    assert.equal(data.tournamentId, fixture.tournamentId); assert.equal(data.phase, 'provisional')
    assert.equal(data.rows.find(row => row.isMe).score, 4)
    assert.ok(data.rows.every(row => !('user_id' in row) && !('email' in row)))
    const page = await fetch(`${origin}/tournaments/${fixture.tournamentId}/leaderboard`, { headers: { cookie } }).then(response => response.text())
    assert.ok(page.includes('Ranking')); assert.ok(page.includes(data.rows.find(row => row.isMe).name))
    const guest = await fetch(url, { redirect: 'manual' })
    assert.ok([307,401].includes(guest.status))
    assert.equal((await fetch(`${origin}/api/tournaments/not-a-uuid/leaderboard`, { headers: { cookie }, redirect: 'manual' })).status, 400)
    await assertClosed()
    await fs.writeFile(`artifacts/2048-result/${operative ? 'operative-ranking' : 'real-ranking'}.json`, JSON.stringify({ at: new Date().toISOString(),
      status: 'PASS', origin, data, checks: ['real authenticated local PostgreSQL ranking',
        'same source as public ranking page', 'no private user ids/emails',
        'no cached personalized payload', 'guest still requires sign-in', 'invalid id rejected'],
      closedGameAndMoveHistoryUnchanged: true, schemaOrGameWrites: false }, null, 2) + '\n')
    console.log(JSON.stringify({ status: 'PASS_REAL_DB_READ_ONLY', phase: data.phase, score: data.rows.find(row => row.isMe).score }))
  } finally { await auth.auth.signOut({ scope: 'local' }) }
}
await main().catch(() => { console.error('Local ranking check failed; inspect the identified candidate and fixture before retrying.'); process.exitCode = 1 })
