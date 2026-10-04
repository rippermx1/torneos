// Disposable PostgreSQL only. Never connects to Supabase or the platform DB.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'

const dir = 'artifacts/2048-adversarial'
const name = `g2048092-${randomUUID()}`
const report = { task: 'G2048-09.2', date: new Date().toISOString(), status: 'NOT_RUN',
  scope: 'isolated PostgreSQL 17; no network, platform database, Flow or deployment access', checks: [], sources: {} }
const docker = (args, input, timeout = 15000) => new Promise(resolve => {
  const child = execFile('docker', args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
    (error, out, err) => resolve({ code: error ? error.code ?? 1 : 0, out, err }))
  if (input !== undefined) child.stdin.end(input)
})
const sql = statement => docker(['exec', '-i', name, 'psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres',
  '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], statement)
const checked = async statement => { const r = await sql(statement); assert.equal(r.code, 0, r.err); return r.out.trim() }
const check = async (label, run) => { try { await run(); report.checks.push({ name: label, status: 'PASS' }) }
  catch (error) { report.checks.push({ name: label, status: 'FAIL', error: error.message }) } }
let created = false
try {
  const available = await docker(['version', '--format', '{{.Server.Version}}'], undefined, 5000)
  if (available.code !== 0) {
    report.reason = 'Docker engine unavailable (bounded 5-second probe)'
    process.exitCode = 2
  } else {
    const files = ['supabase/migrations/001_init_schema.sql',
      'supabase/migrations/20260805163009_fixed_prize_business_model.sql',
      'supabase/migrations/20260508212105_rate_limit_buckets.sql',
      'scripts/sql/2048-seed-visibility-candidate.sql']
    const sources = await Promise.all(files.map(async file => { const source = await fs.readFile(file, 'utf8');
      report.sources[file] = createHash('sha256').update(source).digest('hex'); return source }))
    const unique = sources[0].match(/create table games \([\s\S]*?unique\(tournament_id, user_id\)/)?.[0]
      .match(/unique\(tournament_id, user_id\)/)?.[0]
    assert.ok(unique, 'Source game uniqueness constraint missing')
    const rankQuery = sources[1].match(/SELECT user_id, final_score, highest_tile, move_count\s+FROM public.games\s+WHERE tournament_id = p_tournament_id AND status = 'completed'\s+ORDER BY final_score DESC, highest_tile DESC, move_count ASC, user_id ASC/)?.[0]
    assert.ok(rankQuery, 'Source finalizer ranking query missing')
    const started = await docker(['run', '-d', '--name', name, '--network', 'none', '--user', 'postgres',
      '--entrypoint', 'bash', 'public.ecr.aws/supabase/postgres:17.6.1.105', '-lc',
      'initdb -D /tmp/g2048-pg --auth=trust >/tmp/init.log && exec postgres -D /tmp/g2048-pg -k /tmp -p 5544'])
    assert.equal(started.code, 0, started.err); created = true
    let ready = false
    for (let i = 0; i < 30 && !ready; i++) { ready = (await sql('SELECT 1')).code === 0
      if (!ready) await new Promise(resolve => setTimeout(resolve, 200)) }
    assert.ok(ready)
    await checked(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE games(id uuid PRIMARY KEY,tournament_id uuid,user_id text,status text,
      final_score bigint,highest_tile int,move_count int,seed text DEFAULT 'private-seed',
      current_board jsonb,started_at timestamptz,ended_at timestamptz,end_reason text,${unique});
      ALTER TABLE games ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fixture_owner ON games FOR SELECT TO authenticated USING(user_id='a');
      GRANT SELECT ON games TO service_role;`)
    await checked(sources[2])
    const tournament = randomUUID()
    const insert = (user, score, tile, moves, status = 'completed') => checked(
      `INSERT INTO games(id,tournament_id,user_id,status,final_score,highest_tile,move_count)
        VALUES ('${randomUUID()}','${tournament}','${user}','${status}',${score},${tile},${moves});`)
    const order = async () => (await checked(rankQuery.replace('p_tournament_id', `'${tournament}'`))).split('\n').map(row => row.split('|')[0])
    await check('all tie-break levels and invalid exclusion follow the original finalizer SQL', async () => {
      await insert('b', 100, 64, 5); await insert('a', 100, 64, 5); await insert('c', 100, 64, 6)
      await insert('d', 100, 32, 1); await insert('e', 200, 16, 100)
      await insert('invalid', 999999, 2048, 1, 'invalid'); await insert('active', 999999, 2048, 1, 'active')
      assert.deepEqual(await order(), ['e', 'a', 'b', 'c', 'd'])
      await checked('VACUUM FULL games;'); assert.deepEqual(await order(), ['e', 'a', 'b', 'c', 'd'])
    })
    await check('one session per account and tournament; distinct accounts remain independent', async () => {
      assert.notEqual((await sql(`INSERT INTO games(id,tournament_id,user_id,status,final_score,highest_tile,move_count)
        VALUES ('${randomUUID()}','${tournament}','a','active',0,0,0);`)).code, 0)
      await insert('second-account', 0, 0, 0, 'active')
    })
    await check('original authenticated table grant exposes an active owned seed despite row isolation', async () => {
      const grants = [...sources[1].matchAll(/GRANT SELECT ON TABLE\s+([^;]+?)\s+TO authenticated;/g)]
      assert.ok(grants.some(match => match[1].split(',').map(table => table.trim()).includes('public.games')))
      await checked('GRANT SELECT ON public.games TO authenticated;')
      await checked("UPDATE games SET status='active' WHERE user_id='a';")
      assert.equal(await checked("SET ROLE authenticated; SELECT seed FROM games WHERE status='active';"), 'SET\nprivate-seed')
    })
    await checked(sources[3])
    await check('candidate preserves owned safe columns without exposing another account', async () => {
      assert.equal(await checked('SET ROLE authenticated; SELECT user_id,final_score FROM games;'), 'SET\na|100')
    })
    await check('candidate denies authenticated seed and wildcard reads', async () => {
      for (const projection of ['seed', '*']) {
        const result = await sql(`SET ROLE authenticated; SELECT ${projection} FROM games;`)
        assert.notEqual(result.code, 0); assert.ok(result.err.includes('permission denied'))
      }
    })
    await check('candidate retains server seed access for gameplay and audit', async () => {
      assert.ok((await checked('SET ROLE service_role; SELECT seed FROM games LIMIT 1;')).endsWith('private-seed'))
    })
    await check('240-account movement limit rejects request 241 using the original atomic RPC', async () => {
      const result = await checked(`SET ROLE service_role;
        SELECT count(*) FILTER (WHERE (r->>'ok')::boolean),count(*) FROM
        (SELECT rate_limit_consume('game:move:account',240,60000) AS r FROM generate_series(1,241)) q;`)
      assert.equal(result, 'SET\n240|241')
    })
    await check('concurrent starts share one 15-request account quota', async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () => checked(
        "SELECT (rate_limit_consume('game:start:account',15,60000)->>'ok');")))
      assert.equal(results.filter(row => row === 'true').length, 15)
      assert.equal(results.filter(row => row === 'false').length, 5)
    })
    await check('a second account does not share the first quota', async () => {
      assert.equal(await checked("SELECT rate_limit_consume('game:start:second-account',15,60000)->>'ok';"), 'true')
    })
    await check('expired quota resets instead of locking out the next window', async () => {
      await checked("UPDATE rate_limit_buckets SET expires_at=clock_timestamp()-interval '1 second' WHERE key='game:start:account';")
      assert.equal(await checked("SELECT rate_limit_consume('game:start:account',15,60000)->>'count';"), '1')
    })
    for (const role of ['anon', 'authenticated']) await check(`${role} cannot consume privileged quotas`, async () => {
      const result = await sql(`SET ROLE ${role}; SELECT rate_limit_consume('game:move:account',240,60000);`)
      assert.notEqual(result.code, 0); assert.ok(result.err.includes('permission denied for function'))
    })
    report.status = report.checks.some(row => row.status === 'FAIL') ? 'FAIL' : 'PASS'
    process.exitCode = report.status === 'PASS' ? 0 : 1
  }
} catch (error) { report.status = 'FAIL'; report.error = error.message; process.exitCode = 1 }
finally {
  if (created) { const cleanup = await docker(['rm', '-f', name]); report.cleanup = cleanup.code === 0 ? 'PASS' : 'FAIL'
    if (cleanup.code !== 0) process.exitCode = 1 }
  await fs.mkdir(dir, { recursive: true }); await fs.writeFile(`${dir}/sql.json`, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
