// Read-only result verification against the identified, already-closed local fixture.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServerClient } from '@supabase/ssr'
import { localEnv } from './2048-integrity-local.mjs'

async function main() {
  const env = await localEnv(), origin = 'http://127.0.0.1:65175'
  const fixture = JSON.parse(await fs.readFile('artifacts/2048-background/manifest.json', 'utf8'))
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
    await fs.writeFile('artifacts/2048-result/real-ranking.json', JSON.stringify({ at: new Date().toISOString(),
      status: 'PASS', origin, data, checks: ['real authenticated local PostgreSQL ranking',
        'same source as public ranking page', 'no private user ids/emails',
        'no cached personalized payload', 'guest still requires sign-in', 'invalid id rejected'],
      schemaOrGameWrites: false }, null, 2) + '\n')
    console.log(JSON.stringify({ status: 'PASS_REAL_DB_READ_ONLY', phase: data.phase, score: data.rows.find(row => row.isMe).score }))
  } finally { await auth.auth.signOut({ scope: 'local' }) }
}
await main().catch(() => { console.error('Local ranking check failed; inspect the identified candidate and fixture before retrying.'); process.exitCode = 1 })
