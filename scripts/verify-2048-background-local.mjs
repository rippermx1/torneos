// Real-background acceptance requires a human Chrome run; this script never simulates visibility.
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { localEnv, docker, sha256, assertInstalled } from './2048-integrity-local.mjs'

async function main() {
const mode = process.argv[2]
assert.ok(['prepare', 'state', 'checkpoint', 'watch', 'verify-closed'].includes(mode))
const root = 'artifacts/2048-background'
await mkdir(root, { recursive: true })
const env = await localEnv()
const instance = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
const runtime = Object.fromEntries(instance.Config.Env.map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]))
assert.equal(instance.State.Health.Status, 'healthy')
assert.equal(runtime.TORNEOS_LOCAL_MODE, '1')
assert.equal(runtime.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL)
assert.equal(sha256(runtime.SUPABASE_SECRET_KEY ?? ''), sha256(env.SUPABASE_SECRET_KEY ?? ''))
assertInstalled()
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
  } })
async function checked(query) {
  const { data, error } = await query
  assert.ok(error === null, 'Local fixture or query failed')
  return data
}
const save = (path, data, options) => writeFile(path, JSON.stringify(data, null, 2) + '\n', options)
let manifest
if (mode === 'prepare') {
  try {
    await readFile(`${root}/manifest.json`)
    throw new Error('Existing identified fixture: inspect or continue it; never restart it')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const run = randomUUID(), suffix = run.replaceAll('-', '').slice(0, 12)
  const email = `g2048.background.${suffix}@example.com`, password = randomBytes(24).toString('base64url') + '!aA1'
  manifest = { task: 'G2048-04.4', at: new Date().toISOString(), run, imageId: instance.Image,
    userId: null, tournamentId: randomUUID(), status: 'PREPARING', realBackground: 'NOT_RUN' }
  await save(`${root}/manifest.json`, manifest, { flag: 'wx' })
  const { user } = await checked(service.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: '2048 local background fixture' } }))
  assert.ok(user?.id)
  manifest.userId = user.id
  await save(`${root}/manifest.json`, manifest)
  await save(`${root}/credentials.private.json`, { email, password }, { flag: 'wx' })
  await checked(service.from('profiles').update({ username: `bg_${suffix}`, full_name: 'Fixture segundo plano',
    terms_accepted_at: new Date().toISOString(), terms_version: '1.3' }).eq('id', user.id))
  await checked(service.from('profile_roles').upsert({ profile_id: user.id, role: 'user', granted_by: user.id },
    { onConflict: 'profile_id,role' }))
  await checked(service.from('tournaments').insert({ id: manifest.tournamentId, name: `2048 · regreso real ${suffix}`,
    description: 'Fixture local identificada de G2048-04.4. Sin cobros reales.',
    game_type: '2048_score', tournament_type: 'freeroll', preset_key: 'internal_test_v1', is_test: true,
    entry_fee_cents: 0, prize_1st_cents: 100, prize_2nd_cents: 0, prize_3rd_cents: 0,
    min_players: 1, max_players: 1, max_game_duration_seconds: 300, status: 'live',
    registration_opens_at: new Date(Date.now() - 120000).toISOString(),
    play_window_start: new Date(Date.now() - 60000).toISOString(),
    play_window_end: new Date(Date.now() + 86400000).toISOString(), created_by: user.id }))
  await checked(service.from('registrations').insert({ tournament_id: manifest.tournamentId, user_id: user.id }))
  manifest.status = 'READY_FOR_HUMAN_CHROME'
  manifest.url = `${env.APP_URL}/tournaments/${manifest.tournamentId}/play`
  await save(`${root}/manifest.json`, manifest)
  await writeFile(`${root}/login.private.txt`, `Cuenta de prueba local, sin permisos administrativos.\nCorreo: ${email}\nContraseña: ${password}\n\nPartida: ${manifest.url}\nNo guardes la contraseña en Chrome.\n`, { flag: 'wx' })
  console.log(JSON.stringify({ status: manifest.status, url: manifest.url, credentials: `${root}/login.private.txt`,
    durationSeconds: 300, clockAdjustment: false }))
} else {
  manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'))
  assert.equal(manifest.task, 'G2048-04.4')
  assert.equal(manifest.imageId, instance.Image, 'Runtime changed since fixture preparation')
  const tournament = await checked(service.from('tournaments').select('id,is_test,max_game_duration_seconds,play_window_end')
    .eq('id', manifest.tournamentId).single())
  assert.equal(tournament.is_test, true)
  const readGames = () => checked(service.from('games').select('id,status,current_board,final_score,move_count,started_at,ended_at,end_reason')
    .eq('tournament_id', manifest.tournamentId).eq('user_id', manifest.userId))
  if (mode === 'watch') {
    const timeline = [], finishBy = Date.now() + 900000
    let previous = ''
    while (Date.now() < finishBy) {
      const current = await readGames()
      assert.ok(current.length <= 1)
      const digest = sha256(JSON.stringify(current))
      if (digest !== previous) {
        previous = digest
        const entry = { at: new Date().toISOString(), game: current[0] ?? null }
        timeline.push(entry)
        await save(`${root}/timeline.json`, { startedAt: timeline[0].at, observations: timeline,
          scope: 'Read-only PostgreSQL snapshots; background visibility requires separate Chrome observation' })
        console.log(JSON.stringify(entry))
      }
      if (current[0]?.status === 'completed') break
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    return
  }
  const games = await readGames()
  assert.ok(games.length <= 1)
  const game = games[0] ?? null
  const moves = game ? await checked(service.from('game_moves').select('move_number,direction,server_timestamp')
    .eq('game_id', game.id).order('move_number')) : []
  const observed = { at: new Date().toISOString(), game, moves, deadlineAt: game
    ? new Date(Math.min(Date.parse(tournament.play_window_end), Date.parse(game.started_at) + tournament.max_game_duration_seconds * 1000)).toISOString() : null }
  if (mode === 'checkpoint') {
    const label = process.argv[3]
    assert.match(label ?? '', /^[a-z0-9-]{1,50}$/)
    await save(`${root}/${label}.json`, observed, { flag: 'wx' })
  } else if (mode === 'verify-closed') {
    assert.ok(game, 'Human game has not started')
    assert.equal(game.status, 'completed', 'Observe the browser closure before verifying; do not close it from the verifier')
    assert.equal(game.end_reason, 'timeout')
    assert.ok(Date.now() >= Date.parse(observed.deadlineAt))
    const credentials = JSON.parse(await readFile(`${root}/credentials.private.json`, 'utf8')), jar = new Map()
    const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookieOptions: { name: 'sb-127-auth-token' }, cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: cookies => cookies.forEach(cookie => jar.set(cookie.name, cookie.value)),
        } })
    const signed = await checked(auth.auth.signInWithPassword(credentials))
    assert.equal(signed.user.id, manifest.userId)
    const checks = []
    for (const [action, body, expectedStatus] of [
      ['start', { recoverOnly: true, gameId: game.id }, 200],
      ['timeout', { gameId: game.id }, 200],
      ['move', { gameId: game.id, direction: 'left', moveNumber: game.move_count + 2, clientTimestamp: Date.now() }, 400],
    ]) {
      const response = await fetch(`${env.APP_URL}/api/tournaments/${manifest.tournamentId}/game/${action}`, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', origin: env.APP_URL,
          cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
      assert.equal(response.status, expectedStatus)
      const data = await response.json()
      assert.equal(data.gameId, game.id); assert.equal(data.score, game.final_score)
      assert.deepEqual(data.board, game.current_board); assert.equal(data.status, game.status)
      checks.push({ action, status: response.status, score: data.score })
    }
    assert.deepEqual(await checked(service.from('games').select('id,status,current_board,final_score,move_count,started_at,ended_at,end_reason')
      .eq('id', game.id).single()), game)
    assert.deepEqual(await checked(service.from('game_moves').select('move_number,direction,server_timestamp')
      .eq('game_id', game.id).order('move_number')), moves)
    await save(`${root}/closed-verification.json`, { ...observed, checks, status: 'PASS_PERSISTED_CLOSURE',
      realBackground: 'Requires separate actual Chrome observation; API checks alone do not close the feature' })
    console.log(JSON.stringify({ status: 'PASS_PERSISTED_CLOSURE', checks }))
  }
  await save(`${root}/state.json`, observed)
  console.log(JSON.stringify(observed))
}
}

await main().catch(error => {
  // Handle rejected preconditions without an unhandled top-level rejection after fetch.
  // Keep runtime configuration, credentials and response bodies out of errors.
  const known = ['Existing identified fixture: inspect or continue it; never restart it',
    'Human game has not started', 'Observe the browser closure before verifying; do not close it from the verifier']
  console.error(known.includes(error.message) ? error.message : 'Local background verification did not complete; inspect the scoped fixture before retrying')
  process.exitCode = 1
})
