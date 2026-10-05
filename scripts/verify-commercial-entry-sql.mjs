// Fresh loopback cluster only. No environment files, Supabase, Flow or live DB.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const index = process.argv.indexOf('--pg-bin')
if (index < 0 || !process.argv[index + 1]) throw new Error('Use --pg-bin with PostgreSQL 17 binaries')
const financial = process.argv.includes('--financial')
const pgBin = path.resolve(process.argv[index + 1]), dir = path.resolve(financial ? 'artifacts/financial-operations' : 'artifacts/commercial-entry')
const cluster = path.join(dir, `pg-${randomUUID()}`)
const report = { task: financial ? 'RM-01/02/03 + RM-05/06/07' : 'RM-01/02/03', startedAt: new Date().toISOString(), status: 'NOT_RUN',
  scope: 'fresh loopback PostgreSQL fixture; real SQL roles/claims, not Supabase JWT/Data API', sources: {}, checks: [], cleanup: 'NOT_RUN' }
let port, started = false, flowSequence = 100
const run = (binary, args, input, timeout = 15000) => new Promise(resolve => {
  const child = execFile(path.join(pgBin, `${binary}${process.platform === 'win32' ? '.exe' : ''}`), args,
    { windowsHide: true, timeout, maxBuffer: 1024 * 1024, env: { ...process.env, PGCLIENTENCODING: 'UTF8', PSQLRC: '' } },
    (error, out, err) => resolve({ code: error ? error.code ?? 1 : 0, out: out.replace(/\r\n/g, '\n').trim(), err }))
  if (input !== undefined) child.stdin.end(input)
})
const sql = text => run('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], text)
const checked = async text => { const r = await sql(text); assert.equal(r.code, 0, r.err); return r.out }
const denied = async (text, reason) => { const r = await sql(text); assert.notEqual(r.code, 0, 'Unsafe statement succeeded'); if (reason) assert.ok(r.err.includes(reason), r.err) }
const check = async (name, action) => {
  try { await action(); report.checks.push({ name, status: 'PASS' }) }
  catch (e) { report.checks.push({ name, status: 'FAIL', error: e.message }); throw e }
}
const source = async file => { const text = await fs.readFile(file, 'utf8'); report.sources[file] = createHash('sha256').update(text).digest('hex'); return text }
const role = (user, statement) => `SET ROLE authenticated; SET "request.jwt.claim.sub"='${user}'; ${statement}`
const service = statement => `SET ROLE service_role; ${statement}`
const fixture = async (fee = 500000, max = 15) => {
  const f = { user: randomUUID(), tournament: randomUUID(), order: `fixture-${randomUUID()}`, flow: ++flowSequence, token: randomUUID(), fee }
  await checked(`INSERT INTO profiles VALUES ('${f.user}',false,'1990-01-01',clock_timestamp()-interval '1 day','1.3','approved');
    INSERT INTO profile_roles VALUES ('${f.user}','user');
    INSERT INTO tournaments(id,status,entry_fee_cents,max_players,registration_opens_at,play_window_start,play_window_end)
    VALUES ('${f.tournament}','open',${fee},${max},clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours');`)
  return f
}
const payment = async (f, status = 'paid', overrides = {}) => {
  const p = { user: f.user, tournament: f.tournament, net: f.fee, charged: f.fee, code: 2, ...overrides }
  await checked(`INSERT INTO flow_payment_attempts(user_id,tournament_id,commerce_order,net_amount_cents,charged_amount_cents,status,flow_token,flow_order,flow_status_code)
    VALUES ('${p.user}','${p.tournament}','${f.order}',${p.net},${p.charged},'${status}','${f.token}',${f.flow},${p.code});`)
}
const insert = f => `INSERT INTO registrations(tournament_id,user_id,entry_fee_cents) VALUES ('${f.tournament}','${f.user}',${f.fee});`
const authorize = f => service(`SELECT authorize_competitive_entry('${f.user}','${f.tournament}');`)
const settle = f => service(`SELECT settle_tournament_registration('${f.order}','${f.token}',${f.flow},${f.fee},'fixture','fixture@example.test','{}');`)
const live = f => checked(`UPDATE tournaments SET status='live',play_window_start=clock_timestamp()-interval '1 minute' WHERE id='${f.tournament}';`)
const game = async f => { const id = randomUUID(); await checked(service(`INSERT INTO games(id,tournament_id,user_id) VALUES ('${id}','${f.tournament}','${f.user}');`)); return id }

await fs.mkdir(dir, { recursive: true })
try {
  const version = await run('postgres', ['--version']); assert.equal(version.code, 0); assert.match(version.out, /PostgreSQL\) 17\./); report.engine = version.out
  const listener = net.createServer()
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  port = listener.address().port; await new Promise(resolve => listener.close(resolve))
  const init = await run('initdb', ['-D', cluster, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], undefined, 60000); assert.equal(init.code, 0, init.err)
  const start = await run('pg_ctl', ['-D', cluster, '-l', `${cluster}.log`, '-w', '-t', '30', '-o', `-h 127.0.0.1 -p ${port} -c lc_messages=C`, 'start'], undefined, 40000)
  assert.equal(start.code, 0, start.err); started = true
  await checked(await source('__tests__/fixtures/commercial-entry.sql'))
  const checkout = await source('supabase/migrations/20260506200000_route1_direct_checkout.sql')
  const register = checkout.match(/CREATE OR REPLACE FUNCTION register_for_tournament\([\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;/)?.[0]
  assert.ok(register); await checked(register)
  await checked('REVOKE EXECUTE ON FUNCTION register_for_tournament(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION register_for_tournament(uuid,uuid,bigint) TO service_role;')
  const policies = await source('supabase/migrations/20260507001033_optimize_rls_policy_performance.sql')
  for (const name of ['Usuario o admin ve inscripciones', 'Usuario se inscribe', 'Usuario o admin ve partidas']) {
    const policy = policies.match(new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`))?.[0]; assert.ok(policy); await checked(policy)
  }
  const grants = await source('supabase/migrations/20260805163009_fixed_prize_business_model.sql')
  assert.ok(grants.includes('GRANT INSERT ON TABLE public.disputes, public.registrations TO authenticated;'))
  await checked('GRANT SELECT, INSERT ON registrations TO authenticated; GRANT SELECT ON games TO authenticated;')
  const legacy = await fixture()
  await check('baseline owned INSERT creates unpaid registration and server game', async () => {
    await checked(role(legacy.user, `INSERT INTO registrations(tournament_id,user_id) VALUES ('${legacy.tournament}','${legacy.user}');`))
    await live(legacy); legacy.game = await game(legacy)
    assert.ok((await checked(role(legacy.user, 'SELECT seed FROM games;'))).includes('private-seed'))
  })
  await checked('GRANT INSERT(user_id,tournament_id), UPDATE(entry_fee_cents) ON registrations TO authenticated;')
  await checked('GRANT INSERT, UPDATE ON flow_payment_attempts TO authenticated; GRANT UPDATE(status) ON flow_payment_attempts TO authenticated;')
  const migration = await source('supabase/migrations/20261005131208_guard_commercial_entry.sql'), terms = await source('lib/legal/terms.ts')
  assert.ok(migration.includes(`p.terms_version IS DISTINCT FROM '${terms.match(/CURRENT_TERMS_VERSION = '([^']+)'/)[1]}'`))
  await checked(await source('supabase/migrations/20261004184805_guard_2048_seed_visibility.sql')); await checked(migration)
  await checked(await source('supabase/migrations/20261002202731_guard_2048_move_commit.sql'))
  const ledger = await source('supabase/migrations/20260804223538_accounting_double_entry_ledger.sql')
  for (const name of ['post_accounting_entry','post_flow_payment','on_flow_payment_accounting']) {
    const definition = ledger.match(new RegExp(`CREATE OR REPLACE FUNCTION private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0]
    assert.ok(definition); await checked(definition)
    const revoke = ledger.match(new RegExp(`REVOKE EXECUTE ON FUNCTION private\\.${name}\\([\\s\\S]*?;`))?.[0]
    assert.ok(revoke); await checked(revoke)
  }
  await checked(`CREATE TRIGGER flow_payment_accounting AFTER INSERT OR UPDATE ON flow_payment_attempts
    FOR EACH ROW EXECUTE FUNCTION private.on_flow_payment_accounting();`)
  await check('new privileged functions have no client execute and a pinned empty search path', async () => {
    const names = "'assert_commercial_entry','guard_commercial_registration','guard_competitive_game_entry','authorize_competitive_entry','settle_tournament_registration'"
    assert.equal(await checked(`SELECT count(*) FROM pg_proc WHERE proname IN (${names}) AND prosecdef;`), '5')
    assert.equal(await checked(`SELECT count(*) FROM pg_proc WHERE proname IN (${names}) AND
      (has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE')
      OR NOT ('search_path=""'=ANY(proconfig)));`), '0')
  })
  for (const actor of ['anon', 'authenticated']) {
    for (const operation of ['INSERT', 'UPDATE', 'DELETE']) await check(`${actor} cannot ${operation} registrations including column grants`, async () => {
      const statement = operation === 'INSERT' ? `INSERT INTO registrations(user_id,tournament_id) VALUES ('${legacy.user}','${legacy.tournament}');`
        : operation === 'UPDATE' ? 'UPDATE registrations SET entry_fee_cents=0;' : 'DELETE FROM registrations;'
      await denied(`SET ROLE ${actor}; ${statement}`, 'permission denied')
    })
    await check(`${actor} cannot invoke authorization, registration, credit or settlement`, async () => {
      for (const call of [`SELECT authorize_competitive_entry('${legacy.user}','${legacy.tournament}');`,
        `SELECT settle_tournament_registration('x','y',1,1,NULL,NULL,'{}');`,
        `SELECT register_for_tournament('${legacy.user}','${legacy.tournament}',0);`,
        `SELECT register_with_credit('${legacy.user}','${legacy.tournament}',1);`]) await denied(`SET ROLE ${actor}; ${call}`, 'permission denied')
    })
  }
  await check('preexisting forged registration/game cannot authorize or mutate score', async () => {
    await denied(authorize(legacy), 'ENTRY_PAYMENT_REQUIRED')
    await denied(service(`UPDATE games SET final_score=999 WHERE id='${legacy.game}';`), 'ENTRY_PAYMENT_REQUIRED')
    assert.equal(await checked(`SELECT final_score FROM games WHERE id='${legacy.game}';`), '0')
  })
  await check('seed/wildcard denied, safe owned state and server seed retained', async () => {
    await denied(role(legacy.user, 'SELECT seed FROM games;'), 'permission denied'); await denied(role(legacy.user, 'SELECT * FROM games;'), 'permission denied')
    assert.ok((await checked(role(legacy.user, 'SELECT user_id FROM games;'))).endsWith(legacy.user))
    assert.ok((await checked(service('SELECT seed FROM games;'))).includes('private-seed'))
    const other = await fixture(); assert.equal((await checked(role(other.user, 'SELECT user_id FROM games;'))).split('\n').at(-1), 'SET')
  })
  await check('trusted unpaid direct registration denied', async () => { const f = await fixture(); await denied(service(insert(f)), 'ENTRY_PAYMENT_REQUIRED') })
  await check('confirmed payment alone cannot start a game without registration', async () => {
    const f = await fixture(); await payment(f); await live(f)
    await denied(authorize(f), 'ENTRY_REGISTRATION_UNCONFIRMED')
    await denied(service(`INSERT INTO games(tournament_id,user_id) VALUES ('${f.tournament}','${f.user}');`), 'ENTRY_REGISTRATION_UNCONFIRMED')
  })
  await check('browser cannot mutate game or movement tables', async () => {
    await denied(role(legacy.user, 'UPDATE games SET final_score=999;'), 'permission denied')
    await denied(role(legacy.user, `INSERT INTO game_moves(game_id,move_number) VALUES ('${legacy.game}',2);`), 'permission denied')
  })
  await check('browser cannot fabricate confirmed payment through table or column grants', async () => {
    await denied(role(legacy.user, "UPDATE flow_payment_attempts SET status='paid';"), 'permission denied')
    await denied(role(legacy.user, `INSERT INTO flow_payment_attempts(user_id,status) VALUES ('${legacy.user}','paid');`), 'permission denied')
  })
  for (const [name, status, extra] of [['pending','pending',{}], ['rejected','rejected',{}], ['wrong amount','paid',{charged:499900}],
    ['unverified status','paid',{code:1}], ['other owner','paid',{user:randomUUID()}], ['other tournament','paid',{tournament:randomUUID()}]]) {
    await check(`payment ${name} cannot authorize registration`, async () => { const f = await fixture(); await payment(f,status,extra); await denied(service(insert(f)), 'ENTRY_PAYMENT_REQUIRED') })
  }
  for (const [name, mutation, reason] of [['ban','is_banned=true','ENTRY_ACCOUNT_INELIGIBLE'], ['minor',"birth_date=current_date-interval '17 years'",'ENTRY_ADULT_REQUIRED'],
    ['missing age','birth_date=NULL','ENTRY_ADULT_REQUIRED'], ['KYC',"kyc_status='pending'",'ENTRY_KYC_REQUIRED'], ['old terms',"terms_version='1.2'",'ENTRY_TERMS_REQUIRED'],
    ['missing terms','terms_accepted_at=NULL','ENTRY_TERMS_REQUIRED'], ['future acceptance',"terms_accepted_at=clock_timestamp()+interval '1 day'",'ENTRY_TERMS_REQUIRED']]) {
    await check(`${name} revocation after checkout rolls back settlement and entry`, async () => {
      const f = await fixture(); await payment(f,'pending'); await checked(`UPDATE profiles SET ${mutation} WHERE id='${f.user}';`); await denied(settle(f),reason)
      assert.equal(await checked(`SELECT status FROM flow_payment_attempts WHERE commerce_order='${f.order}';`),'pending')
      assert.equal(await checked(`SELECT count(*) FROM registrations WHERE user_id='${f.user}';`),'0')
      assert.equal(await checked(`SELECT count(*) FROM accounting_journal_entries WHERE source_id=(SELECT id FROM flow_payment_attempts WHERE commerce_order='${f.order}');`),'0')
    })
  }
  await check('application user role required for trusted INSERT', async () => {
    const f = await fixture(); await payment(f); await checked(`DELETE FROM profile_roles WHERE profile_id='${f.user}';`); await denied(service(insert(f)), 'ENTRY_ROLE_REQUIRED')
  })
  await check('eligible free entry needs neither payment nor paid KYC', async () => {
    const f = await fixture(0); await checked(`UPDATE profiles SET kyc_status='pending' WHERE id='${f.user}';`)
    await checked(service(`SELECT register_for_tournament('${f.user}','${f.tournament}',0);`)); assert.ok((await checked(authorize(f))).endsWith('t')); await live(f); await game(f)
  })
  await check('concurrent duplicate settlement is atomic and idempotent; later KYC revocation denies moves', async () => {
    const f = await fixture(); await payment(f,'pending')
    const data = (await Promise.all([checked(settle(f)),checked(settle(f))])).map(reply => JSON.parse(reply.split('\n').at(-1)))
    assert.equal(data.filter(r => r.idempotent).length,1); assert.equal(data[0].registration_id,data[1].registration_id)
    assert.equal(await checked(`SELECT count(*) FROM registrations WHERE tournament_id='${f.tournament}';`),'1')
    assert.equal(await checked(`SELECT count(*) FROM accounting_journal_entries WHERE event_type='ticket_sale' AND tournament_id='${f.tournament}';`),'1')
    assert.equal(await checked(`SELECT count(*) FROM accounting_journal_entries WHERE event_type='flow_fee_estimate' AND tournament_id='${f.tournament}';`),'1')
    assert.ok((await checked(authorize(f))).endsWith('t')); await live(f); const id = await game(f)
    await checked(service(`UPDATE games SET final_score=4,move_count=1 WHERE id='${id}';`))
    await checked(`UPDATE profiles SET kyc_status='rejected' WHERE id='${f.user}';`); await denied(authorize(f),'ENTRY_KYC_REQUIRED')
    await denied(service(`UPDATE games SET final_score=8 WHERE id='${id}';`),'ENTRY_KYC_REQUIRED')
    await denied(service(`SELECT * FROM record_game_move(p_game_id=>'${id}',p_move_number=>3,p_direction=>'left',
      p_board_before=>'[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]',p_board_after=>'[[4,0,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]',
      p_score_gained=>4,p_final_score=>8,p_move_count=>2);`), 'ENTRY_KYC_REQUIRED')
    assert.equal(await checked(`SELECT count(*) FROM game_moves WHERE game_id='${id}';`),'0')
    assert.equal(await checked(`SELECT final_score FROM games WHERE id='${id}';`),'4')
    await checked(service(`UPDATE games SET status='completed',end_reason='timeout' WHERE id='${id}';`))
  })
  await check('concurrent last slot preserves capacity and rolls back losing paid transition', async () => {
    const a = await fixture(500000,1), b = await fixture(); b.tournament = a.tournament; await payment(a,'pending'); await payment(b,'pending')
    const replies = await Promise.all([sql(settle(a)),sql(settle(b))]); assert.equal(replies.filter(r => r.code === 0).length,1)
    assert.equal(await checked(`SELECT count(*) FROM registrations WHERE tournament_id='${a.tournament}';`),'1')
    assert.equal(await checked(`SELECT count(*) FROM flow_payment_attempts WHERE tournament_id='${a.tournament}' AND status='paid';`),'1')
  })
  await check('registration deadline includes tournament lock wait', async () => {
    const f = await fixture(); await payment(f,'pending'); await checked(`UPDATE tournaments SET play_window_start=clock_timestamp()+interval '1 second' WHERE id='${f.tournament}';`)
    const tag = `own-${randomUUID()}`, blocker = sql(`SET application_name='${tag}'; BEGIN; SELECT id FROM tournaments WHERE id='${f.tournament}' FOR UPDATE; SELECT pg_sleep(1.5); COMMIT;`)
    let locked = false
    for (let i = 0; i < 30 && !locked; i++) { locked = await checked(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${tag}' AND wait_event='PgSleep';`) === '1'; if (!locked) await new Promise(resolve => setTimeout(resolve,25)) }
    assert.ok(locked); await denied(settle(f),'Inscripciones cerradas'); assert.equal((await blocker).code,0)
  })
  await check('provider identity mismatch cannot settle a matching amount', async () => {
    const f = await fixture(); await payment(f,'pending'); await denied(service(`SELECT settle_tournament_registration('${f.order}','wrong',${f.flow},${f.fee},NULL,NULL,'{}');`),'Identidad Flow inconsistente')
  })
  await check('all original accounting adapter entries balance; no repeated event keys', async () => {
    assert.equal(await checked(`SELECT count(*) FROM (SELECT journal_entry_id FROM accounting_postings
      GROUP BY journal_entry_id HAVING sum(debit_cents) <> sum(credit_cents)) unbalanced;`),'0')
    assert.equal(await checked('SELECT count(*)-count(DISTINCT event_key) FROM accounting_journal_entries;'),'0')
  })
  if (financial) {
    const { verifyFinancialCases } = await import('./verify-financial-cases.mjs')
    await verifyFinancialCases({ checked, denied, check, source, service, fixture, payment, settle, sql })
  }
  report.status = 'PASS'
} catch (error) { report.status = 'FAIL'; report.error = error.message; process.exitCode = 1 }
finally {
  if (started) { const stop = await run('pg_ctl', ['-D',cluster,'-m','fast','-w','stop'],undefined,30000); report.cleanup = stop.code === 0 ? 'PASS_OWN_CLUSTER_STOPPED' : 'FAIL'; if (stop.code !== 0) process.exitCode = 1 }
  report.endedAt = new Date().toISOString(); await fs.writeFile(path.join(dir,'sql.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, error: report.error, evidence: path.join(dir,'sql.json') }))
}
