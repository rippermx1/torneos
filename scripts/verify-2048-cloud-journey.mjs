// Owned synthetic fixture in the existing isolated development environment only.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { randomUUID, randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { validateCloudDevelopment } from './check-cloud-development.mjs'
import { generateTotpCode } from './e2e-totp.mjs'

const root = 'artifacts/2048-gap-closure', mode = process.argv[2]
assert.ok(['prepare', 'resume', 'finish', 'verify-final'].includes(mode))
const config = JSON.parse(await fs.readFile('config/cloud-development.json', 'utf8'))
const env = parseEnv(await fs.readFile('.env.cloud-development.local', 'utf8'))
validateCloudDevelopment(env, config)
assert.equal(config.supabaseProjectRef, 'jnoyjewsqbooqaiighcs')
assert.equal(env.APP_URL, 'https://torneos-dev.vercel.app')
assert.equal(env.FLOW_API_KEY ?? '', ''); assert.equal(env.FLOW_API_SECRET ?? '', '')
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } })
const checked = async query => { const { data, error } = await query; assert.equal(error, null); return data }
const save = (name, data) => fs.writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2) + '\n')
await fs.mkdir(root, { recursive: true })
const actors = []
async function actor(email, password) {
  const jar = new Map()
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)) } })
  const signed = await checked(client.auth.signInWithPassword({ email, password }))
  const result = { jar, client, user: signed.user }; actors.push(result); return result
}
async function call(who, route, body) {
  const headers = new Headers({ origin: env.APP_URL })
  if (who) headers.set('cookie', [...who.jar].map(([name, value]) => `${name}=${value}`).join('; '))
  if (body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(env.APP_URL + route, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(30000) })
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0], at = pair.indexOf('='); who?.jar.set(pair.slice(0, at), pair.slice(at + 1))
  }
  const text = await response.text(); let json; try { json = JSON.parse(text) } catch { json = null }
  return { status: response.status, json, text }
}
async function verifyFinal(fixture, player, admin) {
  const tournament = await checked(service.from('tournaments').select('id,status,is_test,created_by').eq('id', fixture.id).single())
  assert.equal(tournament.status, 'completed'); assert.equal(tournament.is_test, true)
  assert.equal(tournament.created_by, fixture.userId)
  const before = await checked(service.from('games').select('*').eq('id', fixture.gameId).single())
  const duplicate = await call(admin, `/api/admin/tournaments/${fixture.id}/finalize`, {})
  assert.equal(duplicate.status, 400) // Completed tournaments reject another finalization.
  const official = await call(player, `/api/tournaments/${fixture.id}/leaderboard`)
  assert.equal(official.status, 200); assert.equal(official.json.phase, 'official')
  assert.equal(official.json.rows[0].score, before.final_score); assert.equal(official.json.rows[0].prizeCents, 100)
  const credits = await checked(service.from('wallet_transactions').select('id').eq('reference_id', fixture.id).eq('type', 'prize_credit'))
  assert.equal(credits.length, 1)
  assert.deepEqual(await checked(service.from('games').select('*').eq('id', fixture.gameId).single()), before)
  fixture.status = 'PASS'; await save('cloud-fixture.private', fixture)
  await save('cloud-journey', { at: new Date().toISOString(), status: 'PASS', origin: env.APP_URL, tournamentId: fixture.id,
    gameId: fixture.gameId, score: before.final_score, syntheticOnly: true, realAuthMfaApiDatabase: true,
    reviewSignal: 'CONTROLLED_SYNTHETIC_FIXTURE', priorRun: 'all finish assertions through official results passed; duplicate request expectation corrected from 200 to 400',
    checks: [...fixture.checks, 'natural timeout', 'closed recovery', 'late move rejected', 'provisional ranking',
      'user and AAL1 admin denied', 'AAL2 admin inspection', 'pending review blocks finalization', 'review cleared with reason',
      'official persisted ranking', 'closed state unchanged', 'completed finalization rejected; one credit linked to owned is_test development tournament'],
    moneyOrFlow: false })
  console.log('PASS_AUTHENTICATED_CLOUD_JOURNEY')
}
try {
  if (mode === 'prepare') {
    await assert.rejects(fs.access(`${root}/cloud-fixture.private.json`))
    const id = randomUUID(), email = `g2048_${id.slice(0, 8)}@example.com`, password = randomBytes(24).toString('base64url') + 'aA1!'
    const created = await checked(service.auth.admin.createUser({ email, password, email_confirm: true }))
    const fixture = { id, userId: created.user.id, email, password, status: 'PREPARING', at: new Date().toISOString() }
    await save('cloud-fixture.private', fixture)
    await checked(service.from('profiles').update({ username: `g2048_${id.slice(0, 8)}`, full_name: '2048 synthetic development test',
      birth_date: '1994-01-01', terms_version: '1.3', terms_accepted_at: new Date().toISOString() }).eq('id', fixture.userId))
    await checked(service.from('profile_roles').upsert({ profile_id: fixture.userId, role: 'user', granted_by: fixture.userId }, { onConflict: 'profile_id,role' }))
    const starts = Date.now() + 25000
    await checked(service.from('tournaments').insert({ id, name: `2048 prueba técnica ${id.slice(0, 8)}`, created_by: fixture.userId,
      is_test: true, game_type: '2048_score', tournament_type: 'freeroll', preset_key: 'internal_test_v1',
      entry_fee_cents: 0, prize_1st_cents: 100, prize_2nd_cents: 0, prize_3rd_cents: 0, min_players: 1, max_players: 1,
      max_game_duration_seconds: 300, registration_opens_at: new Date(Date.now() - 60000).toISOString(),
      play_window_start: new Date(starts).toISOString(), play_window_end: new Date(starts + 360000).toISOString(), status: 'open' }))
    const player = await actor(email, password)
    const registration = await call(player, `/api/tournaments/${id}/register`, {})
    assert.equal(registration.status, 200)
    await new Promise(resolve => setTimeout(resolve, Math.max(0, starts - Date.now() + 500)))
    await checked(service.from('tournaments').update({ status: 'live' }).eq('id', id).eq('is_test', true).eq('created_by', fixture.userId))
    const start = await call(player, `/api/tournaments/${id}/game/start`, {})
    assert.equal(start.status, 200); assert.ok(start.json.gameId)
    fixture.gameId = start.json.gameId; fixture.deadline = start.json.deadlineAt ?? start.json.deadline
    fixture.checks = ['real Auth and registration API', 'real server-created game']
    await save('cloud-fixture.private', fixture)
    let state = start.json
    for (const direction of ['left', 'up', 'right', 'down']) {
      const move = await call(player, `/api/tournaments/${id}/game/move`, { gameId: fixture.gameId, direction,
        moveNumber: state.moveNumber, clientTimestamp: Date.now() })
      assert.equal(move.status, 200); state = { ...state, ...move.json }
    }
    const game = await checked(service.from('games').select('id,started_at,move_count,final_score,current_board,status').eq('id', fixture.gameId).single())
    fixture.deadline = new Date(Date.parse(game.started_at) + 300000).toISOString()
    fixture.snapshot = game; fixture.status = 'WAITING_NATURAL_TIMEOUT'; await save('cloud-fixture.private', fixture)
    await save('cloud-progress', { status: fixture.status, tournamentId: id, gameId: fixture.gameId, score: game.final_score,
      deadline: fixture.deadline, origin: env.APP_URL, syntheticOnly: true })
    console.log(JSON.stringify({ status: fixture.status, tournamentId: id, gameId: fixture.gameId, deadline: fixture.deadline }))
  } else if (mode === 'resume') {
    const fixture = JSON.parse(await fs.readFile(`${root}/cloud-fixture.private.json`, 'utf8'))
    assert.equal(fixture.status, 'PREPARING')
    const tournament = await checked(service.from('tournaments').select('is_test,created_by').eq('id', fixture.id).single())
    assert.equal(tournament.is_test, true); assert.equal(tournament.created_by, fixture.userId)
    const game = await checked(service.from('games').select('id,started_at,move_count,final_score,current_board,status')
      .eq('tournament_id', fixture.id).eq('user_id', fixture.userId).single())
    const player = await actor(fixture.email, fixture.password)
    const recovered = await call(player, `/api/tournaments/${fixture.id}/game/start`, { recoverOnly: true, gameId: game.id })
    assert.equal(recovered.status, 200); assert.equal(recovered.json.gameId, game.id)
    fixture.gameId = game.id; fixture.snapshot = game
    fixture.deadline = new Date(Date.parse(game.started_at) + 300000).toISOString()
    fixture.checks = ['real Auth and registration API', 'real server-created game', 'one real direction committed', 'existing fixture recovered after verifier sequence error']
    fixture.status = 'WAITING_NATURAL_TIMEOUT'; await save('cloud-fixture.private', fixture)
    await save('cloud-progress', { status: fixture.status, tournamentId: fixture.id, gameId: game.id, score: game.final_score,
      deadline: fixture.deadline, origin: env.APP_URL, syntheticOnly: true })
    console.log(JSON.stringify({ status: fixture.status, tournamentId: fixture.id, gameId: game.id, deadline: fixture.deadline }))
  } else if (mode === 'verify-final') {
    const fixture = JSON.parse(await fs.readFile(`${root}/cloud-fixture.private.json`, 'utf8'))
    assert.equal(fixture.status, 'WAITING_NATURAL_TIMEOUT')
    const player = await actor(fixture.email, fixture.password)
    const creds = parseEnv(await fs.readFile('.env.accounting-development-test.local', 'utf8'))
    const admin = await actor(creds.OPERATOR_EMAIL, creds.SUPABASE_E2E_PASSWORD)
    const factors = await checked(admin.client.auth.mfa.listFactors()); assert.equal(factors.totp.length, 1)
    await checked(admin.client.auth.mfa.challengeAndVerify({ factorId: factors.totp[0].id, code: generateTotpCode(creds.TOTP_SECRET) }))
    await verifyFinal(fixture, player, admin)
  } else {
    const fixture = JSON.parse(await fs.readFile(`${root}/cloud-fixture.private.json`, 'utf8'))
    assert.equal(fixture.status, 'WAITING_NATURAL_TIMEOUT'); assert.ok(Date.now() > Date.parse(fixture.deadline))
    const player = await actor(fixture.email, fixture.password), route = `/api/tournaments/${fixture.id}`
    const timeout = await call(player, `${route}/game/timeout`, { gameId: fixture.gameId })
    assert.equal(timeout.status, 200); assert.equal(timeout.json.status, 'completed'); assert.equal(timeout.json.endReason, 'timeout')
    const closed = await checked(service.from('games').select('*').eq('id', fixture.gameId).single())
    const recovery = await call(player, `${route}/game/start`, { recoverOnly: true, gameId: fixture.gameId })
    assert.equal(recovery.status, 200); assert.equal(recovery.json.score, closed.final_score)
    const late = await call(player, `${route}/game/move`, { gameId: fixture.gameId, direction: 'left', moveNumber: closed.move_count + 2, clientTimestamp: Date.now() })
    assert.equal(late.status, 400)
    const provisional = await call(player, `${route}/leaderboard`)
    assert.equal(provisional.status, 200); assert.equal(provisional.json.phase, 'provisional')
    assert.equal(provisional.json.rows.find(row => row.isMe).score, closed.final_score)
    const creds = parseEnv(await fs.readFile('.env.accounting-development-test.local', 'utf8'))
    const admin = await actor(creds.OPERATOR_EMAIL, creds.SUPABASE_E2E_PASSWORD), adminRoute = `/api/admin/tournaments/${fixture.id}`
    assert.equal((await call(player, `${adminRoute}/integrity`)).status, 403)
    assert.equal((await call(admin, `${adminRoute}/integrity`)).status, 403)
    const factors = await checked(admin.client.auth.mfa.listFactors()); assert.equal(factors.totp.length, 1)
    await checked(admin.client.auth.mfa.challengeAndVerify({ factorId: factors.totp[0].id, code: generateTotpCode(creds.TOTP_SECRET) }))
    const inspection = await call(admin, `${adminRoute}/integrity`); assert.equal(inspection.status, 200)
    const pending = inspection.json.reviews?.find(review => review.gameId === fixture.gameId && review.decision === 'pending')
    assert.ok(pending, 'Insert only the owned synthetic review fixture before finish')
    const blocked = await call(admin, `${adminRoute}/finalize`, {}); assert.equal(blocked.status, 409)
    const review = await call(admin, `${adminRoute}/integrity`, { gameId: fixture.gameId, code: pending.code, decision: 'cleared',
      reason: 'Prueba sintética autorizada E30; señal controlada, no evidencia de infracción.' })
    assert.equal(review.status, 200)
    const finalized = await call(admin, `${adminRoute}/finalize`, {}); assert.equal(finalized.status, 200)
    const official = await call(player, `${route}/leaderboard`)
    assert.equal(official.status, 200); assert.equal(official.json.phase, 'official')
    assert.equal(official.json.rows[0].score, closed.final_score)
    assert.equal(official.json.rows[0].prizeCents, 100)
    assert.deepEqual(await checked(service.from('games').select('*').eq('id', fixture.gameId).single()), closed)
    await verifyFinal(fixture, player, admin)
  }
} finally { for (const who of actors) await who.client.auth.signOut({ scope: 'local' }) }
