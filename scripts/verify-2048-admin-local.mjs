// Real local Supabase Auth/MFA + HTTP routes + persisted PostgreSQL assertions.
// Controlled cadence is a fixture, not an observation of human input or bot proof.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { generateTotpCode } from './e2e-totp.mjs'
import { localEnv, docker, sql, assertInstalled, sha256 } from './2048-integrity-local.mjs'

const report = { task: 'G2048-09.4', at: new Date().toISOString(), checks: [],
  authentication: 'NOT_RUN', browserInteraction: 'NOT_RUN',
  cadence: 'Controlled timestamps on real API move history; not measured human cadence', fixtures: {} }
const root = 'artifacts/2048-integrity-integration'
const dir = `${root}/admin-${randomUUID()}`
const prepareBrowser = process.argv.includes('--prepare-browser')
await mkdir(dir, { recursive: true })
report.artifacts = dir
const check = async (name, run) => {
  try { await run(); report.checks.push({ name, status: 'PASS' }) }
  catch { report.checks.push({ name, status: 'FAIL' }); throw new Error(name) }
}
const verified = async request => {
  const { data, error } = await request
  assert.equal(error, null, 'Local fixture/query failed')
  return data
}
const pause = () => new Promise(resolve => setTimeout(resolve, 150))
try {
  const env = await localEnv()
  // Use actual operative runtime configuration, not the shell's cloud variables.
  const instance = JSON.parse(docker(['inspect', 'torneos-app-1'], undefined, 5000))[0]
  const runtime = Object.fromEntries(instance.Config.Env.map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]))
  assert.equal(runtime.TORNEOS_LOCAL_MODE, '1')
  assert.equal(runtime.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL)
  assert.equal(sha256(runtime.SUPABASE_SECRET_KEY ?? runtime.SUPABASE_SERVICE_ROLE_KEY ?? ''),
    sha256(env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? ''), 'Local keys require refresh after environment reconstruction')
  assert.ok(['http://supabase_kong_torneos:8000', 'http://host.docker.internal:54321'].includes(runtime.SUPABASE_SERVER_URL))
  assert.equal(instance.State.Health.Status, 'healthy')
  assertInstalled()
  report.runtime = { imageId: instance.Image, target: env.APP_URL }
  for (const url of [`${env.APP_URL}/play`, `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`]) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000),
      ...(url.includes('/auth/v1/') ? { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY } } : {}) })
    assert.ok(response.ok)
  }
  if (!process.argv.includes('--run')) {
    report.status = 'PREFLIGHT_PASS'
  } else {
    assert.ok(env.SUPABASE_E2E_PASSWORD)
    const runId = randomUUID(), suffix = runId.replaceAll('-', '').slice(0, 12)
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false } })
    const browserKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const actors = []
    // Fresh accounts only: preserve all existing passwords, factors, roles and games.
    for (const role of ['admin', 'clear', 'sanction']) {
      const email = `g2048.094.${suffix}.${role}@example.com`
      const { user } = await verified(service.auth.admin.createUser({ email, password: env.SUPABASE_E2E_PASSWORD,
        email_confirm: true, user_metadata: { full_name: '2048 local integration fixture' } }))
      assert.ok(user?.id)
      report.fixtures[role] = user.id
      await verified(service.from('profiles').update({ username: `g094_${suffix}_${role}`, full_name: 'Fixture 09.4',
        is_admin: role === 'admin', terms_accepted_at: new Date().toISOString(), terms_version: '1.3' }).eq('id', user.id))
      await verified(service.from('profile_roles').upsert([{ profile_id: user.id, role: 'user', granted_by: user.id },
        ...(role === 'admin' ? [{ profile_id: user.id, role: 'admin', granted_by: user.id }] : [])],
      { onConflict: 'profile_id,role' }))
      const jar = new Map()
      const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, browserKey, {
        cookieOptions: { name: 'sb-127-auth-token' },
        cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: cookies => cookies.forEach(cookie => jar.set(cookie.name, cookie.value)) } })
      await verified(auth.auth.signInWithPassword({ email, password: env.SUPABASE_E2E_PASSWORD }))
      actors.push({ user, auth, jar })
    }
    const [admin, clear, sanction] = actors
    const call = async (actor, route, body, method = body === undefined ? 'GET' : 'POST') => {
      const headers = new Headers({ origin: env.APP_URL })
      if (actor) headers.set('cookie', [...actor.jar].map(([name, value]) => `${name}=${value}`).join('; '))
      if (body !== undefined) headers.set('content-type', 'application/json')
      const response = await fetch(env.APP_URL + route, { method, headers, redirect: 'manual',
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) })
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';', 1)[0], at = pair.indexOf('=')
        actor?.jar.set(pair.slice(0, at), pair.slice(at + 1))
      }
      const text = await response.text()
      let payload; try { payload = JSON.parse(text) } catch { payload = null }
      return { status: response.status, payload, text, location: response.headers.get('location') }
    }
    const tournament = randomUUID()
    report.fixtures.tournament = tournament
    const integrityUrl = `/api/admin/tournaments/${tournament}/integrity`
    const finalizeUrl = `/api/admin/tournaments/${tournament}/finalize`
    await check('anonymous and non-admin cannot inspect or decide', async () => {
      for (const actor of [null, clear]) {
        for (const [route, body] of [[integrityUrl, undefined], [integrityUrl, {}], [finalizeUrl, {}],
          [`/api/admin/users/${sanction.user.id}/ban`, { ban: true }]]) {
          const denied = await call(actor, route, body)
          if (actor === null && denied.status === 307) {
            // The accepted proxy intercepts anonymous API requests before handlers.
            const target = new URL(denied.location, env.APP_URL)
            assert.equal(target.origin, env.APP_URL)
            assert.equal(target.pathname, '/sign-in')
            assert.equal(target.searchParams.get('next'), route)
          } else assert.equal(denied.status, actor === null ? 401 : 403)
        }
      }
    })
    await check('administrator at AAL1 is denied on all mutation and inspection routes', async () => {
      for (const [route, body] of [[integrityUrl, undefined], [integrityUrl, {}], [finalizeUrl, {}],
        [`/api/admin/users/${sanction.user.id}/ban`, { ban: true }]]) {
        const result = await call(admin, route, body)
        assert.equal(result.status, 403); assert.equal(result.payload?.mfaRequired, true)
      }
    })
    await check('real TOTP enrollment and challenge raise the fresh operator session to AAL2', async () => {
      const enrollment = await verified(admin.auth.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'G2048-09.4 fixture' }))
      await verified(admin.auth.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: generateTotpCode(enrollment.totp.secret) }))
      const assurance = await verified(admin.auth.auth.mfa.getAuthenticatorAssuranceLevel())
      assert.equal(assurance.currentLevel, 'aal2'); report.authentication = 'PASS_REAL_AUTH_MFA'
      if (prepareBrowser) await writeFile(`${dir}/browser-operator.private.json`, JSON.stringify({
        email: admin.user.email, password: env.SUPABASE_E2E_PASSWORD, totpSecret: enrollment.totp.secret,
      }), { flag: 'wx' })
    })
    await verified(service.from('tournaments').insert({ id: tournament, name: `G2048-09.4 ${suffix}`, is_test: true,
      game_type: '2048_score', tournament_type: 'freeroll', preset_key: 'freeroll_v1', entry_fee_cents: 0,
      // Use the governed freeroll contract; is_test keeps all credits synthetic.
      prize_1st_cents: 500000, prize_2nd_cents: 0, prize_3rd_cents: 0, min_players: 2, max_players: 10,
      registration_opens_at: new Date(Date.now() - 120000).toISOString(), play_window_start: new Date(Date.now() - 60000).toISOString(),
      play_window_end: new Date(Date.now() + 600000).toISOString(), status: 'live', max_game_duration_seconds: 600,
      created_by: admin.user.id }))
    await verified(service.from('registrations').insert([clear, sanction].map(actor => ({ tournament_id: tournament, user_id: actor.user.id }))))
    const games = []
    await check('authenticated players submit directions and the server persists score and board', async () => {
      for (const actor of [clear, sanction]) {
        const prefix = `/api/tournaments/${tournament}/game`
        let state = await call(actor, `${prefix}/start`, {})
        assert.equal(state.status, 200); const gameId = state.payload.gameId
        assert.ok(gameId); let count = 0
        for (let attempt = 0; attempt < 200 && count < 31; attempt++) {
          await pause()
          const next = await call(actor, `${prefix}/move`, { gameId, direction: ['up', 'left', 'down', 'right'][attempt % 4],
            moveNumber: count + 2, clientTimestamp: Date.now() })
          assert.equal(next.status, 200)
          if (next.payload.moved) { count++; state = next }
        }
        assert.equal(count, 31)
        const persisted = await verified(service.from('games').select('final_score,current_board,move_count').eq('id', gameId).single())
        assert.equal(Number(persisted.final_score), state.payload.score)
        assert.deepEqual(persisted.current_board, state.payload.board); assert.equal(persisted.move_count, 31)
        games.push(gameId)
      }
      report.fixtures.games = games
    })
    await check('authenticated browser role can read safe state but cannot select the RNG seed', async () => {
      const visible = await verified(clear.auth.from('games').select('id,current_board').eq('id', games[0]))
      assert.equal(visible.length, 1)
      const seed = await clear.auth.from('games').select('seed').eq('id', games[0])
      assert.ok(seed.error); assert.equal(seed.data, null)
    })
    // Only this run's two games are modified to reproduce an exact cadence deterministically.
    sql(`BEGIN; UPDATE games SET started_at=clock_timestamp()-interval '90 seconds' WHERE id IN ('${games.join("','")}');
      UPDATE game_moves m SET server_timestamp=g.started_at+(m.move_number-1)*interval '500 milliseconds'
      FROM games g WHERE m.game_id=g.id AND g.id IN ('${games.join("','")}');
      UPDATE tournaments SET registration_opens_at=clock_timestamp()-interval '1200 seconds',
        play_window_start=clock_timestamp()-interval '601 seconds',
        play_window_end=clock_timestamp()-interval '1 second' WHERE id='${tournament}'; COMMIT;`)
    const snapshot = () => sql(`SELECT coalesce(json_agg(r ORDER BY rank),'[]') FROM tournament_results r WHERE tournament_id='${tournament}';
      SELECT coalesce(json_agg(w ORDER BY id),'[]') FROM wallet_transactions w WHERE reference_id='${tournament}';`)
    await check('pending signals block authenticated finalization without ranking or credits', async () => {
      const before = snapshot(), result = await call(admin, finalizeUrl, {})
      assert.equal(result.status, 409); assert.equal(result.payload.code, 'INTEGRITY_REVIEW_REQUIRED')
      assert.equal(snapshot(), before)
      const inspected = await call(admin, integrityUrl)
      assert.equal(inspected.status, 200); assert.equal(inspected.payload.reviews.filter(r => r.decision === 'pending').length, 2)
    })
    await check('operator GUI and replay render through authenticated server routes', async () => {
      const page = await call(admin, `/admin/tournaments/${tournament}/games`)
      assert.equal(page.status, 200); assert.ok(page.text.includes('Descartar señal con motivo'))
      assert.ok(page.text.includes('Sancionar infracción confirmada'))
      const replay = await call(admin, `/admin/tournaments/${tournament}/games/${games[0]}`)
      assert.equal(replay.status, 200)
      report.serverRenderedGui = 'PASS'; report.browserInteraction = 'NOT_RUN'
    })
    if (!prepareBrowser) {
    const reason = 'Fixture local: revisión del falso positivo confirmada'
    await check('reason validation and tournament membership reject invalid clearances', async () => {
      assert.equal((await call(admin, integrityUrl, { gameId: games[0], code: 'regular_pace', reason: 'short' })).status, 400)
      assert.equal((await call(admin, integrityUrl, { gameId: randomUUID(), code: 'regular_pace', reason })).status, 409)
    })
    await check('false positive clearance persists actor and reason', async () => {
      const result = await call(admin, integrityUrl, { gameId: games[0], code: 'regular_pace', reason })
      assert.equal(result.status, 200); assert.equal(result.payload.ok, true)
      const persisted = JSON.parse(sql(`SELECT row_to_json(r) FROM integrity_private.reviews r WHERE game_id='${games[0]}' AND code='regular_pace';`))
      assert.equal(persisted.decision, 'cleared'); assert.equal(persisted.reviewed_by, admin.user.id); assert.equal(persisted.review_reason, reason)
      assert.equal((await call(admin, finalizeUrl, {})).status, 409)
    })
    await check('confirmed sanction atomically bans and invalidates; suspended player is denied', async () => {
      const result = await call(admin, `/api/admin/users/${sanction.user.id}/ban`, { ban: true, reason: 'Fixture: infracción confirmada en revisión local' })
      assert.equal(result.status, 200); assert.equal(result.payload.banned, true); assert.equal(result.payload.invalidatedGames, 1)
      assert.equal(sql(`SELECT status FROM games WHERE id='${games[1]}'`), 'invalid')
      assert.equal(sql(`SELECT decision FROM integrity_private.reviews WHERE game_id='${games[1]}' AND code='regular_pace'`), 'sanctioned')
      assert.equal((await call(sanction, `/api/tournaments/${tournament}/game/move`, {
        gameId: games[1], direction: 'left', moveNumber: 33, clientTimestamp: Date.now() })).status, 403)
    })
    await check('retry finalizes only the cleared participant with exactly one prize credit', async () => {
      const result = await call(admin, finalizeUrl, {})
      assert.equal(result.status, 200); assert.equal(result.payload.ok, true)
      const results = await verified(service.from('tournament_results').select('*').eq('tournament_id', tournament))
      assert.equal(results.length, 1); assert.equal(results[0].user_id, clear.user.id)
      assert.equal(results[0].rank, 1); assert.equal(Number(results[0].prize_awarded_cents), 500000)
      assert.equal(sql(`SELECT count(*) FROM wallet_transactions WHERE reference_id='${tournament}' AND type='prize_credit'`), '1')
      report.settlementHash = sha256(snapshot())
    })
    await check('post-settlement sanction preserves result and ledger; unban does not resurrect games', async () => {
      const before = snapshot()
      const result = await call(admin, `/api/admin/users/${clear.user.id}/ban`, { ban: true, reason: 'Fixture de incidencia posterior al cierre' })
      assert.equal(result.status, 200); assert.equal(result.payload.settledGames, 1); assert.equal(snapshot(), before)
      const unban = await call(admin, `/api/admin/users/${sanction.user.id}/ban`, { ban: false, reason: 'Fixture: retiro de suspensión sin restaurar partida' })
      assert.equal(unban.status, 200); assert.equal(sql(`SELECT status FROM games WHERE id='${games[1]}'`), 'invalid')
      assert.equal(snapshot(), before)
    })
    }
    report.status = prepareBrowser ? 'PASS_PREPARED_BROWSER_REVIEW' : 'PASS_AUTHENTICATED_HTTP_SQL'
    report.fixtureRetention = 'Fresh synthetic users/tournament retained for inspection; existing accounts unchanged'
  }
} catch (error) {
  report.status = report.checks.length ? 'FAIL' : 'NOT_RUN'
  report.blocker = report.checks.length ? error.message : 'Local Docker/Supabase/web preflight unavailable; Auth/MFA E2E not executed'
  process.exitCode = 1
}
await mkdir(dir, { recursive: true })
await writeFile(`${dir}/admin-e2e.json`, JSON.stringify(report, null, 2) + '\n')
await writeFile(`${root}/${prepareBrowser ? 'admin-browser-prepared' : 'admin-e2e'}.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
