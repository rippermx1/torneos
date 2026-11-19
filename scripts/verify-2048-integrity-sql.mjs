// Disposable native PostgreSQL. No credentials, platform DB or Docker mutation.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'

const dir = path.resolve('artifacts/2048-integrity')
const pgBin = path.resolve(process.argv[process.argv.indexOf('--pg-bin') + 1]
  || 'artifacts/2048-adversarial/postgres-portable/pgsql/bin')
const cluster = path.join(dir, `g2048093-${randomUUID()}`)
const report = { task: 'G2048-09.3', date: new Date().toISOString(), status: 'NOT_RUN',
  scope: 'synthetic isolated native PostgreSQL; no operating DB, Flow, email or deployment', checks: [], sources: {} }
let port, started = false
const command = (file, args, input, timeout = 15000) => new Promise(resolve => {
  const child = execFile(path.join(pgBin, `${file}${process.platform === 'win32' ? '.exe' : ''}`), args,
    { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, PGCLIENTENCODING: 'UTF8', PSQLRC: '' } },
    (error, out, err) => resolve({ code: error ? error.code ?? 1 : 0, out: out.replace(/\r\n/g, '\n').trim(), err }))
  if (input !== undefined) child.stdin.end(input)
})
const sql = statement => command('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], statement)
const ok = async statement => { const r = await sql(statement); assert.equal(r.code, 0, r.err); return r.out }
const rejected = async (statement, reason) => { const r = await sql(statement); assert.notEqual(r.code, 0); assert.ok(r.err.includes(reason), r.err) }
const check = async (name, run) => { try { await run(); report.checks.push({ name, status: 'PASS' }) }
  catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message }) } }
const source = async file => { const s = await fs.readFile(file, 'utf8'); report.sources[file] = createHash('sha256').update(s).digest('hex'); return s }
try {
  await fs.mkdir(dir, { recursive: true })
  const version = await command('postgres', ['--version']); assert.equal(version.code, 0, version.err); report.engine = version.out
  const socket = net.createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  port = socket.address().port; await new Promise(resolve => socket.close(resolve))
  const init = await command('initdb', ['-D', cluster, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], undefined, 60000)
  assert.equal(init.code, 0, init.err)
  const launch = await command('pg_ctl', ['-D', cluster, '-l', `${cluster}.log`, '-w', '-t', '30', '-o', `-h 127.0.0.1 -p ${port} -c lc_messages=C`, 'start'], undefined, 40000)
  assert.equal(launch.code, 0, launch.err); started = true
  await ok(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,is_banned boolean DEFAULT false,kyc_status text DEFAULT 'pending',rut text);
    CREATE TABLE tournaments(id uuid PRIMARY KEY,status text DEFAULT 'live',game_type text DEFAULT '2048_score',
      play_window_start timestamptz DEFAULT clock_timestamp()-interval '1 hour',play_window_end timestamptz DEFAULT clock_timestamp()+interval '1 hour',
      max_game_duration_seconds int DEFAULT 3600,prize_1st_cents bigint DEFAULT 100,prize_2nd_cents bigint DEFAULT 0,prize_3rd_cents bigint DEFAULT 0,business_rule_version text DEFAULT 'fixture');
    CREATE TABLE games(id uuid PRIMARY KEY,tournament_id uuid REFERENCES tournaments,user_id uuid REFERENCES profiles,status text DEFAULT 'active',
      current_board jsonb DEFAULT '[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]',final_score bigint DEFAULT 0,highest_tile int DEFAULT 2,move_count int DEFAULT 0,
      started_at timestamptz DEFAULT clock_timestamp(),ended_at timestamptz,end_reason text,UNIQUE(tournament_id,user_id));
    CREATE TABLE game_moves(game_id uuid REFERENCES games,move_number int,direction text,board_before jsonb,board_after jsonb,score_gained int,spawned_tile jsonb,client_timestamp bigint,server_timestamp timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(game_id,move_number));
    CREATE TABLE registrations(tournament_id uuid,prize_fund_contribution_cents bigint,platform_fee_gross_cents bigint,platform_fee_iva_cents bigint,platform_fee_net_cents bigint);
    CREATE TABLE tournament_results(tournament_id uuid,user_id uuid,rank int,final_score bigint,prize_awarded_cents bigint);
    CREATE TABLE wallet_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,
      amount_cents bigint,balance_after_cents bigint,reference_type text,reference_id uuid,metadata jsonb,
      created_at timestamptz DEFAULT now());
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;`)
  const finalizer = await source('supabase/migrations/20260805163009_fixed_prize_business_model.sql')
  const walletSource=await source('supabase/migrations/007_supabase_auth.sql')
  await ok(walletSource.match(/CREATE OR REPLACE FUNCTION wallet_insert_transaction[\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER;/)[0])
  await ok('REVOKE EXECUTE ON FUNCTION wallet_insert_transaction(uuid,text,bigint,text,uuid,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION wallet_insert_transaction(uuid,text,bigint,text,uuid,jsonb) TO service_role;')
  await ok(finalizer.match(/CREATE OR REPLACE FUNCTION public.finalize_tournament[\s\S]*?GRANT EXECUTE ON FUNCTION public.finalize_tournament\(uuid\) TO service_role;/)[0])
  await ok(await source('supabase/migrations/20261005131216_guard_2048_integrity_reviews.sql'))
  const admin = randomUUID(); await ok(`INSERT INTO profiles(id,is_admin) VALUES('${admin}',true);`)
  const fixture = async (rut = null, kyc = 'pending', tournamentId = randomUUID()) => {
    const g = { id: randomUUID(), user: randomUUID(), tournament: tournamentId }
    await ok(`INSERT INTO profiles(id,rut,kyc_status) VALUES('${g.user}',${rut ? `'${rut}'` : 'NULL'},'${kyc}');
      INSERT INTO tournaments(id) VALUES('${g.tournament}') ON CONFLICT DO NOTHING;
      INSERT INTO games(id,user_id,tournament_id) VALUES('${g.id}','${g.user}','${g.tournament}');`)
    return g
  }
  const sanction = (g, banned = true) => `SELECT set_2048_account_sanction('${g.user}',${banned},'synthetic review reason','${admin}');`
  const before = '[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]'
  const after = '[[4,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]'
  const move = g => `SELECT * FROM record_game_move(p_game_id=>'${g.id}',p_move_number=>2,p_direction=>'left',p_board_before=>'${before}',p_board_after=>'${after}',p_score_gained=>4,p_final_score=>4,p_move_count=>1,p_current_board=>'${after}');`
  const intervals = (g, jitter = 0, count = 31) => ok(`INSERT INTO game_moves(game_id,move_number,direction,server_timestamp)
    SELECT '${g.id}',i,'left','2026-10-05T10:00:00Z'::timestamptz+make_interval(secs=>(i*500+CASE WHEN i%2=0 THEN ${jitter} ELSE 0 END)::double precision/1000) FROM generate_series(2,${count + 1}) i;`)
  const inspect = g => ok(`SELECT inspect_2048_integrity('${g.tournament}');`)
  const lock = async statement => {
    const tag = `own_${randomUUID().replaceAll('-', '')}`
    const pending = sql(`SET application_name='${tag}'; BEGIN; ${statement} SELECT pg_sleep(1); COMMIT;`)
    let held = false
    for (let i = 0; i < 50 && !held; i++) { held = await ok(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${tag}' AND wait_event='PgSleep';`) === '1'
      if (!held) await new Promise(resolve => setTimeout(resolve, 20)) }
    assert.ok(held); return { pending }
  }
  await check('service role commits a valid move with the original deadline/board checks', async () => {
    const g = await fixture(); await ok('SET ROLE service_role;' + move(g))
    assert.equal(await ok(`SELECT final_score||':'||move_count FROM games WHERE id='${g.id}'`), '4:1')
  })
  await check('suspended account cannot create a session despite stale API eligibility', async () => {
    const g = await fixture(); await ok(sanction(g)); const t = randomUUID(); await ok(`INSERT INTO tournaments(id) VALUES('${t}')`)
    await rejected(`INSERT INTO games(id,user_id,tournament_id) VALUES('${randomUUID()}','${g.user}','${t}');`, 'ACCOUNT_SUSPENDED')
  })
  await check('move waiting behind sanction is rejected and creates no move row', async () => {
    const g = await fixture(); const held = await lock(sanction(g)); await rejected(move(g), 'ACCOUNT_SUSPENDED'); assert.equal((await held.pending).code, 0)
    assert.equal(await ok(`SELECT count(*) FROM game_moves WHERE game_id='${g.id}'`), '0')
  })
  await check('move committed first is subsequently invalidated, without lock inversion', async () => {
    const g = await fixture(); const held = await lock(move(g)); await ok(sanction(g)); assert.equal((await held.pending).code, 0)
    assert.equal(await ok(`SELECT status||':'||final_score FROM games WHERE id='${g.id}'`), 'invalid:4')
  })
  await check('sanction invalidates a completed game before finalization and excludes its rank/prize', async () => {
    const g = await fixture(); await ok(`UPDATE games SET status='completed',final_score=999 WHERE id='${g.id}';`)
    await ok(sanction(g)); await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'; SELECT finalize_tournament('${g.tournament}');`)
    assert.equal(await ok(`SELECT count(*) FROM tournament_results WHERE tournament_id='${g.tournament}'`), '0')
    assert.equal(await ok(`SELECT count(*) FROM wallet_transactions WHERE reference_id='${g.tournament}'`), '0')
  })
  await check('failing audit rolls back account ban and game invalidation together', async () => {
    const g = await fixture()
    await ok(`CREATE FUNCTION integrity_private.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END$$;
      CREATE TRIGGER fail_audit BEFORE INSERT ON integrity_private.sanctions FOR EACH ROW EXECUTE FUNCTION integrity_private.fail_audit();`)
    await rejected(sanction(g), 'SYNTHETIC_AUDIT_FAILURE'); await ok('DROP TRIGGER fail_audit ON integrity_private.sanctions;')
    assert.equal(await ok(`SELECT p.is_banned||':'||g.status FROM profiles p JOIN games g ON g.user_id=p.id WHERE g.id='${g.id}'`), 'false:active')
  })
  await check('unban does not resurrect invalid games; repeated ban has no extra invalidations', async () => {
    const g = await fixture(); await ok(sanction(g)); const repeated = JSON.parse(await ok(sanction(g))); assert.equal(repeated.invalidatedGames, 0)
    await ok(sanction(g, false)); assert.equal(await ok(`SELECT status FROM games WHERE id='${g.id}'`), 'invalid')
  })
  await check('settled result, score, rank and ledger remain immutable after sanction', async () => {
    const g = await fixture(); await ok(`UPDATE games SET status='completed',final_score=99 WHERE id='${g.id}'; UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'; SELECT finalize_tournament('${g.tournament}');`)
    const snapshot = () => ok(`SELECT row_to_json(g)::text FROM games g WHERE id='${g.id}'; SELECT row_to_json(r)::text FROM tournament_results r WHERE tournament_id='${g.tournament}'; SELECT row_to_json(w)::text FROM wallet_transactions w WHERE reference_id='${g.tournament}';`)
    const beforeSanction = await snapshot(); assert.equal(JSON.parse(await ok(sanction(g))).settledGames, 1); assert.equal(await snapshot(), beforeSanction)
    assert.equal(JSON.parse(await inspect(g))[0].code, 'settled_sanction')
  })
  await check('finalizer winning a race records a post-settlement review; no retroactive prize rewrite', async () => {
    const g = await fixture(); await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`)
    const held = await lock(`SELECT finalize_tournament('${g.tournament}');`); await ok(sanction(g)); assert.equal((await held.pending).code, 0)
    assert.equal(await ok(`SELECT status FROM games WHERE id='${g.id}'`), 'completed')
    assert.equal(JSON.parse(await inspect(g))[0].code, 'settled_sanction')
  })
  await check('sanction winning the finalization race excludes the account without a credit', async () => {
    const g=await fixture(); await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`)
    const held=await lock(sanction(g)); await ok(`SELECT finalize_tournament('${g.tournament}')`); assert.equal((await held.pending).code,0)
    assert.equal(await ok(`SELECT count(*) FROM wallet_transactions WHERE reference_id='${g.tournament}'`),'0')
    assert.equal(await ok(`SELECT count(*) FROM tournament_results WHERE tournament_id='${g.tournament}'`),'0')
  })
  await check('normalized verified identity cannot participate through another account', async () => {
    const g = await fixture('12.345.678-5', 'approved'); const user = randomUUID()
    await ok(`INSERT INTO profiles(id,rut,kyc_status) VALUES('${user}','123456785','approved')`)
    await rejected(`INSERT INTO games(id,user_id,tournament_id) VALUES('${randomUUID()}','${user}','${g.tournament}')`, 'IDENTITY_ALREADY_PARTICIPATING')
    await ok(sanction(g)); await rejected(`INSERT INTO games(id,user_id,tournament_id) VALUES('${randomUUID()}','${user}','${g.tournament}')`, 'IDENTITY_ALREADY_PARTICIPATING')
  })
  await check('concurrent formatted identity claims create exactly one session', async () => {
    const t = randomUUID(), users = [randomUUID(), randomUUID()]; await ok(`INSERT INTO tournaments(id) VALUES('${t}'); INSERT INTO profiles(id,rut,kyc_status) VALUES('${users[0]}','11.111.111-1','approved'),('${users[1]}','111111111','approved');`)
    const rows = await Promise.all(users.map(u => sql(`INSERT INTO games(id,user_id,tournament_id) VALUES('${randomUUID()}','${u}','${t}')`)))
    assert.equal(rows.filter(r => r.code === 0).length, 1); assert.ok(rows.find(r => r.code !== 0).err.includes('IDENTITY_ALREADY_PARTICIPATING'))
  })
  await check('different verified people are independent and pending identity is not treated as proof', async () => {
    const g = await fixture('12.345.678-5','approved'); await fixture('11.111.111-1','approved',g.tournament); await fixture(null,'pending',g.tournament)
    assert.equal(await ok(`SELECT count(*) FROM games WHERE tournament_id='${g.tournament}'`), '3')
  })
  await check('leading zero and lowercase check-digit variants cannot renew a verified slot', async () => {
    for (const [rut, variant] of [['1.234.567-4','012345674'],['12.345.670-K','12345670k']]) {
      const g = await fixture(rut,'approved'); const user=randomUUID()
      await ok(`INSERT INTO profiles(id,rut,kyc_status) VALUES('${user}','${variant}','approved')`)
      await rejected(`INSERT INTO games(id,user_id,tournament_id) VALUES('${randomUUID()}','${user}','${g.tournament}')`, 'IDENTITY_ALREADY_PARTICIPATING')
    }
  })
  await check('invalid approved identity fails closed instead of skipping the identity claim', async () => {
    const user=randomUUID(), t=randomUUID(); await ok(`INSERT INTO profiles(id,rut,kyc_status) VALUES('${user}',NULL,'approved'); INSERT INTO tournaments(id) VALUES('${t}')`)
    await rejected(`INSERT INTO games(id,user_id,tournament_id) VALUES('${randomUUID()}','${user}','${t}')`, 'IDENTITY_STATE_UNCONFIRMED')
  })
  await check('paced automation at 500 ms persists review and cannot liquidate ranking or credits', async () => {
    const g = await fixture(); await intervals(g); await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`)
    assert.equal(JSON.parse(await inspect(g))[0].code, 'regular_pace')
    await rejected(`SELECT finalize_tournament('${g.tournament}')`, 'INTEGRITY_REVIEW_REQUIRED')
    assert.equal(await ok(`SELECT status FROM games WHERE id='${g.id}'`), 'active')
    assert.equal(await ok(`SELECT count(*) FROM wallet_transactions WHERE reference_id='${g.tournament}'`), '0')
    assert.equal(await ok(`SELECT count(*) FROM tournament_results WHERE tournament_id='${g.tournament}'`), '0')
  })
  await check('manual false-positive clearance persists actor/reason and allows original finalizer', async () => {
    const g = await fixture(); await intervals(g); await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`)
    await rejected(`SELECT resolve_2048_integrity('${g.id}','regular_pace','${admin}','short')`, 'REVIEW_REASON_REQUIRED')
    await rejected(`SELECT resolve_2048_integrity('${g.id}','regular_pace','${g.user}','valid long reason')`, 'ADMIN_REQUIRED')
    await ok(`SELECT resolve_2048_integrity('${g.id}','regular_pace','${admin}','accessibility device confirmed'); SELECT finalize_tournament('${g.tournament}')`)
    assert.equal(JSON.parse(await inspect(g))[0].decision, 'cleared')
    assert.equal(await ok(`SELECT count(*) FROM wallet_transactions WHERE reference_id='${g.tournament}'`), '1')
  })
  await check('automatic scan never bans for regular cadence, and insufficient/variable evidence is not flagged', async () => {
    for (const [jitter,count] of [[0,30],[20,31]]) { const g = await fixture(); await intervals(g,jitter,count)
      await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`); assert.deepEqual(JSON.parse(await inspect(g)), [])
      assert.equal(await ok(`SELECT is_banned FROM profiles WHERE id='${g.user}'`), 'f') }
  })
  await check('legacy verified identity collisions are reviewed after profile approval changes', async () => {
    const g = await fixture('12.345.678-5','pending'); const other = await fixture('123456785','pending',g.tournament)
    await ok(`UPDATE profiles SET kyc_status='approved' WHERE id IN ('${g.user}','${other.user}'); UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`)
    assert.equal(JSON.parse(await inspect(g)).filter(r => r.code === 'identity_collision').length, 2)
    await rejected(`SELECT finalize_tournament('${g.tournament}')`, 'INTEGRITY_REVIEW_REQUIRED')
  })
  await check('direct finalizer re-scans an old finalizing tournament and cannot bypass review', async () => {
    const g = await fixture(); await ok(`UPDATE tournaments SET status='finalizing' WHERE id='${g.tournament}'`); await intervals(g)
    await rejected(`SELECT finalize_tournament('${g.tournament}')`, 'INTEGRITY_REVIEW_REQUIRED')
    assert.equal(JSON.parse(await inspect(g))[0].code, 'regular_pace')
  })
  for (const role of ['anon','authenticated']) await check(`${role} cannot read identity/evidence or invoke privileged controls`, async () => {
    await rejected(`SET ROLE ${role}; SELECT * FROM integrity_private.identity_claims`, 'permission denied')
    for (const call of [`inspect_2048_integrity('${randomUUID()}')`, `set_2048_account_sanction('${randomUUID()}',true,'reason',NULL)`, `resolve_2048_integrity('${randomUUID()}','regular_pace','${admin}','long valid reason')`])
      await rejected(`SET ROLE ${role}; SELECT ${call}`, 'permission denied')
  })
  report.status = report.checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL'
  if (report.status !== 'PASS') process.exitCode = 1
} catch (error) { report.status = 'FAIL'; report.error = error.message; process.exitCode = 1 }
finally {
  if (started) { const stopped = await command('pg_ctl', ['-D',cluster,'-m','fast','-w','stop'], undefined, 30000)
    report.cleanup = stopped.code === 0 ? 'PASS: exact disposable cluster stopped' : 'FAIL'; if (stopped.code !== 0) process.exitCode = 1 }
  await fs.writeFile(path.join(dir,'sql.json'), JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2))
}
