// Disposable PostgreSQL only. Never connects to Supabase or the platform DB.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import path from 'node:path'
import net from 'node:net'

const dir = 'artifacts/2048-adversarial'
const name = `g2048092-${randomUUID()}`
const pgBinArg = process.argv.indexOf('--pg-bin')
const pgBin = pgBinArg === -1 ? null : path.resolve(process.argv[pgBinArg + 1])
const cluster = path.resolve(dir, name)
let port
const report = { task: 'G2048-09.2', date: new Date().toISOString(), status: 'NOT_RUN',
  scope: pgBin ? 'fresh native PostgreSQL 17 cluster, loopback only; no platform DB, Flow or deployment access'
    : 'isolated PostgreSQL 17; no network, platform database, Flow or deployment access', checks: [], sources: {} }
const command = (file, args, input, timeout = 15000) => new Promise(resolve => {
  const child = execFile(file, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024,
    env: { ...process.env, PGCLIENTENCODING: 'UTF8', PSQLRC: '' } },
    (error, out, err) => resolve({ code: error ? error.code ?? 1 : 0, out: out.replace(/\r\n/g, '\n'), err }))
  if (input !== undefined) child.stdin.end(input)
})
const docker = (args, input, timeout) => command('docker', args, input, timeout)
const pg = (file, args, input, timeout) => command(path.join(pgBin, `${file}${process.platform === 'win32' ? '.exe' : ''}`), args, input, timeout)
const sql = statement => pgBin ? pg('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
  '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], statement)
  : docker(['exec', '-i', name, 'psql', '-X', '-h', '/tmp', '-p', '5544', '-U', 'postgres',
    '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], statement)
const checked = async statement => { const r = await sql(statement); assert.equal(r.code, 0, r.err); return r.out.trim() }
const check = async (label, run) => { try { await run(); report.checks.push({ name: label, status: 'PASS' }) }
  catch (error) { report.checks.push({ name: label, status: 'FAIL', error: error.message }) } }
let created = false
try {
  await fs.mkdir(dir, { recursive: true })
  const available = pgBin ? await pg('postgres', ['--version'])
    : await docker(['version', '--format', '{{.Server.Version}}'], undefined, 5000)
  if (available.code !== 0) {
    report.reason = pgBin ? 'Native PostgreSQL binaries unavailable' : 'Docker engine unavailable (bounded 5-second probe)'
    process.exitCode = 2
  } else {
    const files = ['supabase/migrations/001_init_schema.sql',
      'supabase/migrations/20260805163009_fixed_prize_business_model.sql',
      'supabase/migrations/20260508212105_rate_limit_buckets.sql',
      'supabase/migrations/20261004184805_guard_2048_seed_visibility.sql',
      'supabase/migrations/20260519000000_record_game_move_rpc.sql',
      'supabase/migrations/20261002202731_guard_2048_move_commit.sql']
    const sources = await Promise.all(files.map(async file => { const source = await fs.readFile(file, 'utf8');
      report.sources[file] = createHash('sha256').update(source).digest('hex'); return source }))
    const unique = sources[0].match(/create table games \([\s\S]*?unique\(tournament_id, user_id\)/)?.[0]
      .match(/unique\(tournament_id, user_id\)/)?.[0]
    assert.ok(unique, 'Source game uniqueness constraint missing')
    const rankQuery = sources[1].match(/SELECT user_id, final_score, highest_tile, move_count\s+FROM public.games\s+WHERE tournament_id = p_tournament_id AND status = 'completed'\s+ORDER BY final_score DESC, highest_tile DESC, move_count ASC, user_id ASC/)?.[0]
    assert.ok(rankQuery, 'Source finalizer ranking query missing')
    let started
    if (pgBin) {
      assert.match(available.out, /PostgreSQL\) 17\./)
      report.engine = available.out.trim()
      const server = net.createServer()
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
      port = server.address().port; await new Promise(resolve => server.close(resolve))
      const init = await pg('initdb', ['-D', cluster, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], undefined, 60000)
      await fs.writeFile(`${dir}/${name}-init.log`, init.out + init.err)
      assert.equal(init.code, 0, init.err)
      started = await pg('pg_ctl', ['-D', cluster, '-l', `${cluster}.log`, '-w', '-t', '30', '-o',
        `-h 127.0.0.1 -p ${port} -c lc_messages=C`, 'start'], undefined, 40000)
    } else started = await docker(['run', '-d', '--name', name, '--network', 'none', '--user', 'postgres',
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
    // Recheck the real movement commit/deadline contract in the same fresh DB.
    await checked(`CREATE TABLE tournaments(id uuid PRIMARY KEY,play_window_start timestamptz,
      play_window_end timestamptz,max_game_duration_seconds int,status text);
      CREATE TABLE game_moves(game_id uuid REFERENCES games(id),move_number int,direction text,
      board_before jsonb,board_after jsonb,score_gained int,spawned_tile jsonb,client_timestamp bigint,
      server_timestamp timestamptz DEFAULT now(),UNIQUE(game_id,move_number));`)
    const before = '[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]'
    const after = '[[4,0,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]'
    const fixture = async () => { const id = randomUUID(), t = randomUUID()
      await checked(`INSERT INTO tournaments VALUES ('${t}',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',60,'live');
        INSERT INTO games(id,tournament_id,user_id,status,final_score,highest_tile,move_count,current_board,started_at)
        VALUES ('${id}','${t}','fixture-${id}','active',16,0,0,'${before}',clock_timestamp());`)
      return { id, t } }
    const call = (g, extra = '') => `SELECT * FROM record_game_move(p_game_id=>'${g.id}',p_move_number=>2,
      p_direction=>'left',p_board_before=>'${before}',p_board_after=>'${after}',p_score_gained=>4,
      p_current_board=>'${after}',p_final_score=>20,p_move_count=>1${extra});`
    const state = async g => JSON.parse(await checked(`SELECT json_build_object('status',status,'score',final_score,
      'count',move_count,'moves',(SELECT count(*) FROM game_moves WHERE game_id='${g.id}')) FROM games WHERE id='${g.id}';`))
    const rejected = async (g, reason) => { const r = await sql(call(g)); assert.notEqual(r.code, 0)
      assert.ok(r.err.includes(reason), r.err); assert.equal((await state(g)).moves, 0) }
    const lock = async (g, update, seconds) => {
      const tag = `g2048092_${g.id.replaceAll('-', '')}`
      const pending = sql(`SET application_name='${tag}'; BEGIN;
        ${update || `SELECT id FROM games WHERE id='${g.id}' FOR UPDATE;`} SELECT pg_sleep(${seconds}); COMMIT;`)
      let acquired = false
      for (let i = 0; i < 30 && !acquired; i++) {
        acquired = await checked(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${tag}' AND wait_event='PgSleep';`) === '1'
        if (!acquired) await new Promise(resolve => setTimeout(resolve, 30))
      }
      assert.ok(acquired, 'Own row lock not observed'); return { pending }
    }
    await checked(sources[4])
    await check('baseline movement RPC changes a closed score', async () => {
      const g = await fixture(); await checked(`UPDATE games SET status='completed',end_reason='timeout' WHERE id='${g.id}';`)
      await checked(call(g)); assert.equal((await state(g)).score, 20)
    })
    await checked(sources[5])
    await check('service role atomically commits a valid movement', async () => {
      const g = await fixture(); await checked('SET ROLE service_role;' + call(g))
      assert.deepEqual(await state(g), { status: 'active', score: 20, count: 1, moves: 1 })
    })
    await check('last no_moves commit closes exactly once', async () => {
      const g = await fixture(); await checked(call(g, ",p_status=>'completed',p_end_reason=>'no_moves',p_ended_at=>clock_timestamp()"))
      assert.equal((await state(g)).status, 'completed'); assert.ok((await sql(call(g))).err.includes('GAME_COMMIT_CLOSED'))
    })
    await check('closed result cannot be overwritten by a delayed move', async () => {
      const g = await fixture(); await checked(`UPDATE games SET status='completed',end_reason='timeout' WHERE id='${g.id}';`)
      await rejected(g, 'GAME_COMMIT_CLOSED'); assert.equal((await state(g)).score, 16)
    })
    await check('stale sequence cannot insert another movement', async () => {
      const g = await fixture(); await checked(`UPDATE games SET move_count=1 WHERE id='${g.id}';`)
      await rejected(g, 'GAME_COMMIT_CONFLICT')
    })
    await check('stale board is rejected with an otherwise correct sequence', async () => {
      const g = await fixture(); await checked(`UPDATE games SET current_board='${after}' WHERE id='${g.id}';`)
      await rejected(g, 'GAME_COMMIT_CONFLICT')
    })
    await check('two concurrent directions commit only once', async () => {
      const g = await fixture(); const replies = await Promise.all([sql(call(g)), sql(call(g))])
      assert.equal(replies.filter(r => r.code === 0).length, 1)
      assert.ok(replies.find(r => r.code !== 0).err.includes('GAME_COMMIT_CONFLICT')); assert.equal((await state(g)).moves, 1)
    })
    await check('pending direction behind timeout preserves the closed score', async () => {
      const g = await fixture(); const held = await lock(g, `UPDATE games SET status='completed',end_reason='timeout' WHERE id='${g.id}';`, 1)
      await rejected(g, 'GAME_COMMIT_CLOSED'); assert.equal((await held.pending).code, 0); assert.equal((await state(g)).score, 16)
    })
    await check('deadline includes actual row-lock wait time', async () => {
      const g = await fixture(); await checked(`UPDATE games SET started_at=clock_timestamp()-interval '59 seconds' WHERE id='${g.id}';`)
      const held = await lock(g, null, 1.3); await rejected(g, 'GAME_COMMIT_DEADLINE'); assert.equal((await held.pending).code, 0)
    })
    await check('shorter tournament window rejects a late move', async () => {
      const g = await fixture(); await checked(`UPDATE tournaments SET play_window_end=clock_timestamp()-interval '1 second' WHERE id='${g.t}';`)
      await rejected(g, 'GAME_COMMIT_DEADLINE')
    })
    await check('completed tournament rejects an active-session move', async () => {
      const g = await fixture(); await checked(`UPDATE tournaments SET status='completed' WHERE id='${g.t}';`)
      await rejected(g, 'GAME_COMMIT_DEADLINE')
    })
    for (const role of ['anon', 'authenticated']) await check(`${role} cannot call the privileged movement RPC`, async () => {
      const g = await fixture(); const r = await sql(`SET ROLE ${role};` + call(g))
      assert.notEqual(r.code, 0); assert.ok(r.err.includes('permission denied for function'))
    })
    report.status = report.checks.some(row => row.status === 'FAIL') ? 'FAIL' : 'PASS'
    process.exitCode = report.status === 'PASS' ? 0 : 1
  }
} catch (error) { report.status = 'FAIL'; report.error = error.message; process.exitCode = 1 }
finally {
  if (created) { const cleanup = pgBin ? await pg('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop'], undefined, 30000)
    : await docker(['rm', '-f', name]); report.cleanup = cleanup.code === 0 ? 'PASS' : 'FAIL'
    if (cleanup.code !== 0) process.exitCode = 1 }
  await fs.mkdir(dir, { recursive: true }); await fs.writeFile(`${dir}/sql.json`, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
