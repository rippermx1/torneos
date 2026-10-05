// Suspension is modeled in the real session class; Auth/API/DB and the 300s deadline are real.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { localEnv, docker, sha256, assertInstalled } from './2048-integrity-local.mjs'

async function main() {
  const env = await localEnv(), dir = 'artifacts/2048-simulated'
  await fs.mkdir(dir, { recursive: true })
  const fixture = JSON.parse(await fs.readFile('artifacts/2048-background/manifest.json', 'utf8'))
  assert.equal(fixture.task, 'G2048-04.4')
  const candidate = JSON.parse(await fs.readFile('artifacts/2048-integrity-integration/candidate.json', 'utf8'))
  const instance = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
  assert.equal(instance.Image, candidate.imageId); assert.equal(instance.Image, fixture.imageId)
  assert.equal(instance.State.Health.Status, 'healthy'); assertInstalled()
  const emitted = new Map(), sourceRoot = path.resolve(candidate.context)
  async function compile(file) {
    const absolute = path.resolve(sourceRoot, file)
    assert.ok(absolute.startsWith(sourceRoot + path.sep))
    const output = path.resolve(dir, 'modules', path.relative(sourceRoot, absolute).replace(/\.(ts|json)$/, '.mjs'))
    if (emitted.has(absolute)) return output
    emitted.set(absolute, output)
    const input = await fs.readFile(absolute, 'utf8')
    let code = file.endsWith('.json') ? `export default ${input};` : ts.transpileModule(input,
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    for (const match of [...code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]) {
      const dependency = path.resolve(path.dirname(absolute), match[1])
      const compiled = await compile(path.relative(sourceRoot, dependency.endsWith('.json') ? dependency : dependency + '.ts'))
      const relative = path.relative(path.dirname(output), compiled).replaceAll('\\', '/')
      code = code.replace(match[0], match[0].replace(match[1], relative.startsWith('.') ? relative : './' + relative))
    }
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, code)
    return output
  }
  const { Unity2048Session, UNITY_2048_BUILD } = await import(pathToFileURL(await compile('lib/game/unity-2048-session.ts')).href)
  assert.equal(UNITY_2048_BUILD, 'unity-2048-007')
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const checked = async query => { const { data, error } = await query; assert.ok(!error, 'Scoped query failed'); return data }
  const tournament = await checked(service.from('tournaments').select('is_test,max_game_duration_seconds,status')
    .eq('id', fixture.tournamentId).single())
  assert.equal(tournament.is_test, true); assert.equal(tournament.max_game_duration_seconds, 300)
  const existing = await checked(service.from('games').select('id').eq('tournament_id', fixture.tournamentId))
  assert.equal(existing.length, 0, 'Do not restart or reuse a consumed fixture')
  const credentials = JSON.parse(await fs.readFile('artifacts/2048-background/credentials.private.json', 'utf8')), jar = new Map()
  const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookieOptions: { name: 'sb-127-auth-token' }, cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: cookies => cookies.forEach(cookie => jar.set(cookie.name, cookie.value)),
      } })
  assert.equal((await checked(auth.auth.signInWithPassword(credentials))).user.id, fixture.userId)
  const prefix = `/api/tournaments/${fixture.tournamentId}/game`
  const config = { startUrl: prefix + '/start', moveUrl: prefix + '/move', timeoutUrl: prefix + '/timeout' }
  const call = async (url, body = {}) => {
    const response = await fetch(env.APP_URL + url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', origin: env.APP_URL,
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }, body: JSON.stringify(body) })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0], at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1)) }
    return { status: response.status, data: await response.json() }
  }
  const report = { task: 'G2048-04.4', at: new Date().toISOString(), imageId: instance.Image, fixture: fixture.tournamentId,
    evidenceClass: 'SIMULATED_LIFECYCLE_REAL_AUTH_HTTP_DATABASE_NATURAL_DEADLINE', realBrowserHidden: false,
    clockOrBoardDatabaseAdjustment: false, checks: [], status: 'RUNNING' }
  const save = async () => fs.writeFile(dir + '/competitive.json', JSON.stringify(report, null, 2) + '\n')
  const pass = async (name, data = {}) => { report.checks.push({ name, status: 'PASS', ...data }); await save(); console.log(JSON.stringify({ name, status: 'PASS', ...data })) }
  let state, gameId, deadlineAt, monotonic = 0, loseNext = false, moveRequests = 0
  const row = () => checked(service.from('games').select('id,status,current_board,final_score,move_count,started_at,ended_at,end_reason').eq('id', gameId).single())
  const same = (snapshot, game) => { assert.equal(snapshot.score, game.final_score); assert.deepEqual(snapshot.cells, game.current_board.flat()); assert.equal(snapshot.move_number, game.move_count + 2) }
  const session = new Unity2048Session(next => { state = next }, async (url, body) => {
    const result = await call(url, body); assert.equal(result.status, 200, 'Authenticated request failed')
    if (url === config.startUrl) { gameId = result.data.gameId; deadlineAt = result.data.deadlineAt }
    if (url === config.moveUrl) { moveRequests++; if (loseNext) { loseNext = false; throw Error('Deliberately discarded committed response') } }
    return result.data
  }, config, () => monotonic)
  await session.start(); assert.ok(state.started && !state.locked); const initial = await row(); same(state, initial)
  await pass('authenticated start agrees with persisted board and score', { gameId, deadlineAt })
  await new Promise(resolve => setTimeout(resolve, 25000)) // Model suspended client ticks while real server time passes.
  await session.resynchronizeTime(); assert.ok(state.time_left_seconds <= 275 && state.time_left_seconds > 0)
  assert.equal(state.locked, false); assert.deepEqual(await row(), initial)
  await pass('resume with frozen monotonic clock resynchronizes without changing game', { timeLeft: state.time_left_seconds })
  monotonic = 600000; await session.tick(); assert.equal(state.game_over, false); assert.equal(state.locked, false)
  await pass('premature local expiration cannot close a still-valid server session')
  const before = await row(); loseNext = true; await session.move('left'); assert.equal(state.locked, true)
  const count = moveRequests; await session.resynchronizeTime(); await session.move('right'); assert.equal(moveRequests, count)
  await session.recover(); const recovered = await row(); same(state, recovered)
  assert.ok(recovered.move_count - before.move_count <= 1); assert.equal(state.locked, false)
  await pass('lost committed response is recovered without replaying a direction', { moveRequests, moveCount: recovered.move_count })
  await session.move('down'); same(state, await row())
  await pass('subsequent valid direction resumes server-authoritative gameplay', { score: state.score, moveCount: state.move_number - 2 })
  console.log(JSON.stringify({ waitingForNaturalDeadline: deadlineAt }))
  while (Date.now() <= Date.parse(deadlineAt) + 1500) await new Promise(resolve => setTimeout(resolve, Math.min(10000, Math.max(1, Date.parse(deadlineAt) + 1501 - Date.now()))))
  await session.resynchronizeTime(); assert.equal(state.game_over, true); assert.equal(state.locked, true)
  assert.equal(state.time_left_seconds, 0); const final = await row(); same(state, final)
  assert.equal(final.end_reason, 'timeout'); assert.equal(final.status, 'completed')
  await pass('simulated resume after natural deadline confirms persisted timeout', { score: final.final_score, moveCount: final.move_count, endedAt: final.ended_at })
  const atClose = moveRequests; await session.move('up'); assert.equal(moveRequests, atClose)
  const late = await call(config.moveUrl, { gameId, direction: 'up', moveNumber: final.move_count + 2, clientTimestamp: Date.now() })
  assert.equal(late.status, 400); assert.deepEqual(await row(), final)
  const duplicate = await call(config.startUrl, { recoverOnly: true, gameId }); assert.equal(duplicate.status, 200)
  assert.equal(duplicate.data.gameId, gameId); assert.equal(duplicate.data.score, final.final_score)
  assert.deepEqual(duplicate.data.board, final.current_board)
  assert.equal((await checked(service.from('games').select('id').eq('tournament_id', fixture.tournamentId))).length, 1)
  await pass('late input is blocked by client and server; recovery preserves one immutable result')
  session.destroy(); report.status = 'PASS'; report.finishedAt = new Date().toISOString(); report.final = final
  report.moduleHashes = Object.fromEntries(await Promise.all([...emitted.keys()].map(async source => [path.relative(sourceRoot, source), sha256(await fs.readFile(source))])))
  await save()
}
await main().catch(() => { console.error('Competitive simulation failed; inspect the identified fixture before retrying'); process.exitCode = 1 })
