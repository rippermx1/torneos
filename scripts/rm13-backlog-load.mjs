import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { localKeys, sql, run, report } from './rm13-recovery-lib.mjs';
import { isValidRut } from '../lib/identity/rut.mjs';

const keys = await localKeys(), base = 'http://127.0.0.1:23431';
const admin = createClient(keys.API_URL, keys.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const loadOnly = process.argv.includes('--load-only');
const previous = process.argv.includes('--resume') || loadOnly ? JSON.parse(await readFile('artifacts/rm13/private/load-fixtures.json', 'utf8')) : null;
const id = previous?.id ?? randomUUID(), prefix = `RM13_${id}`, players = previous?.players ?? [], attempts = previous?.attempts ?? [], tours = [], runs = [];
const password = randomBytes(24).toString('hex') + 'Aa9!';
const fixtureRut = i => [...'0123456789K'].map(dv => `${20000000 + i}-${dv}`).find(isValidRut);
const checked = async query => { const r = await query; if (r.error) throw new Error(r.error.message); return r.data; };
const config = async () => Object.fromEntries((await readFile('.env.rm13-local', 'utf8')).split(/\r?\n/).filter(x => /^[A-Z_]+=/.test(x)).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
let env = await config();
assert.equal(env.APP_URL, base); assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, keys.API_URL);
await mkdir(env.LOCAL_FLOW_DATA_DIR, { recursive: true });
async function cron(name) {
  const r = await fetch(`${base}/api/cron/${name}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` }, signal: AbortSignal.timeout(60_000) });
  const body = await r.json(); runs.push({ name, status: r.status, durationMs: body.durationMs, total: body.total, errors: body.errors, deferred: body.deferred });
  assert.ok([200, 500].includes(r.status)); assert.ok(body.durationMs < 55_000, 'Worker exhausted serverless time'); return body;
}
async function restartApp() {
  const owned = JSON.parse(await readFile('artifacts/rm13/runtime-process.json', 'utf8'));
  assert.equal(owned.port, 23431); assert.equal(owned.target, 'torneos-rm13-recovery');
  assert.equal((await run('taskkill', ['/PID', String(owned.pid), '/T', '/F'])).code, 0);
  const child = spawn(process.execPath, [resolve('scripts/rm13-runtime.mjs')], { detached: true, windowsHide: true, stdio: 'ignore' }); child.unref();
  for (let n = 0; n < 60; n++) {
    try {
      const next = JSON.parse(await readFile('artifacts/rm13/runtime-process.json', 'utf8'));
      if (next.pid !== owned.pid && (await fetch(base + '/api/cron/flow-reconcile')).status === 401) { env = await config(); return; }
    } catch { /* owned restart */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Owned application did not restart');
}
const now = Date.now(), time = ms => new Date(now + ms).toISOString();
if (!previous) {
for (let i = 0; i < 15; i++) {
  const email = `rm13.load.${id}.${i}@example.test`;
  const created = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `rm13_${id.slice(0, 6)}_${i}` } }));
  const user = created.user.id; players.push({ id: user, email });
  await checked(admin.from('profiles').update({ rut: fixtureRut(i), birth_date: '1990-01-01', terms_version: '1.3', terms_accepted_at: time(-60_000), kyc_status: 'approved' }).eq('id', user));
}
const template = { game_type: '2048_score', tournament_type: 'freeroll', prize_model: 'fixed', is_test: true,
  preset_key: 'internal_test_v1', business_rule_version: 2, entry_fee_cents: 0, prize_1st_cents: 100, prize_2nd_cents: 0, prize_3rd_cents: 0,
  min_players: 1, max_players: 15, max_game_duration_seconds: 300, prize_fund_bps: 5500, platform_fee_bps: 4500,
  prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0, registration_opens_at: time(-73 * 3600_000) };
for (const [kind, count, status, start, end] of [
  ['idle', 25, 'live', -72 * 3600_000, 3600_000], ['poison', 25, 'finalizing', -48 * 3600_000, -47 * 3600_000],
  ['due', 33, 'open', -25 * 3600_000, -24 * 3600_000], ['play', 1, 'open', 24 * 3600_000, 25 * 3600_000],
]) {
  for (let i = 0; i < count; i++) tours.push({ ...template, id: randomUUID(), name: `${prefix}_${kind}_${i}`, status, kind,
    play_window_start: time(start), play_window_end: time(end), ...(kind === 'due' ? { entry_fee_cents: 500000, tournament_type: 'standard' } : {}) });
}
await checked(admin.from('tournaments').insert(tours.map(t => { const row = { ...t }; delete row.kind; return row; })));
const due = tours.filter(t => t.kind === 'due');
for (let i = 0; i < 61; i++) {
  const p = players[i % 15], t = due[Math.floor(i / 15)], token = randomUUID();
  const payment = { token, flowOrder: 6_000_000 + i, commerceOrder: `${prefix}_payment_${i}`, requestDate: time(-25 * 3600_000), status: 2,
    subject: 'RM13 simulated outage', currency: 'CLP', amount: 5000, payer: p.email,
    urlConfirmation: base + '/api/webhooks/flow', urlReturn: `${base}/tournaments/${t.id}/return`, ...(i < 6 ? { testDelayMs: 8100 } : {}) };
  const file = resolve(env.LOCAL_FLOW_DATA_DIR, `payment-${token}.json`); await writeFile(file, JSON.stringify(payment), { mode: 0o600 });
  attempts.push({ id: randomUUID(), user_id: p.id, tournament_id: t.id, commerce_order: payment.commerceOrder, flow_token: token, flow_order: payment.flowOrder,
    intent: 'tournament_registration', net_amount_cents: 500000, user_fee_cents: 0, charged_amount_cents: 500000, status: 'unknown', created_at: time(-25 * 3600_000 + i), file });
}
await checked(admin.from('flow_payment_attempts').insert(attempts.map(a => { const row = { ...a }; delete row.file; return row; })));
await report('artifacts/rm13/private/load-fixtures.json', { id, players, attempts, tournaments: tours.map(({ id, kind }) => ({ id, kind })) });
} else {
  const rows = await checked(admin.from('tournaments').select('*').in('id', previous.tournaments.map(t => t.id)));
  tours.push(...rows.map(t => ({ ...t, kind: previous.tournaments.find(p => p.id === t.id).kind })));
  for (const [i, p] of players.entries()) {
    await checked(admin.auth.admin.updateUserById(p.id, { password }));
    await checked(admin.from('profiles').update({ rut: fixtureRut(i) }).eq('id', p.id));
  }
  // Resume the same owned fixtures, including idempotent recovery of already
  // recognized simulated payments. No new checkout or provider mutation.
  if (!loadOnly) {
    await checked(admin.from('flow_payment_attempts').update({ status: 'unknown', last_reconciled_at: null }).in('id', attempts.map(a => a.id)));
    for (const a of attempts.slice(0, 6)) { const p = JSON.parse(await readFile(a.file, 'utf8')); p.testDelayMs = 8100; await writeFile(a.file, JSON.stringify(p)); }
  }
}
const play = tours.find(t => t.kind === 'play');
await checked(admin.from('tournaments').update({ status: 'open', play_window_start: new Date(Date.now() + 24 * 3600_000).toISOString(), play_window_end: new Date(Date.now() + 25 * 3600_000).toISOString() }).eq('id', play.id));
// Warm both route modules; unauthorized requests cannot process work.
if (!loadOnly) {
assert.equal((await fetch(base + '/api/cron/flow-reconcile')).status, 401);
await fetch(base + '/api/local-flow/payment/getStatusByCommerceId');
const slow = await cron('flow-reconcile'); assert.ok(slow.errors > 0); assert.ok(slow.deferred > 0, 'Slow provider did not yield the batch');
for (const a of attempts.slice(0, 6)) { const p = JSON.parse(await readFile(a.file, 'utf8')); delete p.testDelayMs; await writeFile(a.file, JSON.stringify(p)); }
await restartApp();
for (let i = 0; i < 5; i++) {
  await cron('flow-reconcile');
  const left = await checked(admin.from('flow_payment_attempts').select('id').in('id', attempts.map(a => a.id)).in('status', ['unknown', 'pending', 'expired']));
  if (!left.length) break; if (i === 4) throw new Error('Payment backlog did not drain');
}
assert.equal(Number(await sql(`select count(*) from public.flow_refund_attempts where flow_payment_attempt_id in (select id from public.flow_payment_attempts where commerce_order like '${prefix}%');`)), 61);
await sql(`create function private.rm13_fail_transition() returns trigger language plpgsql as $$ begin if OLD.name like '${prefix}_poison%' and NEW.status is distinct from OLD.status then raise exception 'RM13 isolated injected transition failure'; end if; return NEW; end $$; create trigger rm13_failure before update on public.tournaments for each row execute function private.rm13_fail_transition();`);
await cron('process-tournaments'); await cron('process-tournaments');
const progressed = Number(await sql(`select count(*) from public.tournaments where name like '${prefix}_due%' and status='cancelled';`));
assert.ok(progressed > 0, 'Poisoned first batch starved later tournaments');
await sql('drop trigger rm13_failure on public.tournaments; drop function private.rm13_fail_transition();');
for (let i = 0; i < 5; i++) { await cron('process-tournaments'); if (Number(await sql(`select count(*) from public.tournaments where name like '${prefix}%' and status in ('open','finalizing') and name not like '%_play_%';`)) === 0) break; }
for (let i = 0; i < 4; i++) {
  // Advance the age gate instead of waiting 24h. No production clock is changed.
  await sql(`update public.flow_refund_attempts set created_at=now()-interval '25 hours' where flow_payment_attempt_id in (select id from public.flow_payment_attempts where commerce_order like '${prefix}%');`);
  await cron('reconcile-refunds');
  if (Number(await sql(`select count(*) from public.flow_refund_attempts where status<>'completed' and flow_payment_attempt_id in (select id from public.flow_payment_attempts where commerce_order like '${prefix}%');`)) === 0) break;
}
const outcomes = JSON.parse(await sql(`select json_build_object('completedRefunds',(select count(*) from flow_refund_attempts where status='completed' and flow_payment_attempt_id in (select id from flow_payment_attempts where commerce_order like '${prefix}%')),'cancelledTournaments',(select count(*) from tournaments where name like '${prefix}_due%' and status='cancelled'),'completedPoison',(select count(*) from tournaments where name like '${prefix}_poison%' and status='completed'),'idleUnchanged',(select count(*) from tournaments where name like '${prefix}_idle%' and status='live'),'duplicateRefunds',(select count(*)-count(distinct flow_payment_attempt_id) from flow_refund_attempts where flow_payment_attempt_id in (select id from flow_payment_attempts where commerce_order like '${prefix}%')));`));
assert.deepEqual(outcomes, { completedRefunds: 61, cancelledTournaments: 33, completedPoison: 25, idleUnchanged: 25, duplicateRefunds: 0 });
await report('artifacts/rm13/backlog-report.json', { status: 'PASS', completedAt: new Date().toISOString(), players: 15, payments: 61, refunds: 61,
  dueTournaments: 58, idleControls: 25, simulatedOutageHours: 25, appRestart: 'PASS', slowProviderTimeoutMs: 8000, poisonedBatchSize: 25,
  laterTournamentsAdvancedWhilePoisoned: progressed, runs, outcomes, provider: 'local durable simulator', externalProviderCalls: 0, realMoney: 'NO_GO' });
console.log('PASS backlog, slow provider, fairness, 25h simulated outage and application restart');
}

// Actual HTTP game API, fifteen authenticated players, authoritative moves only.
const registered = new Set((await checked(admin.from('registrations').select('user_id').eq('tournament_id', play.id))).map(r => r.user_id));
const missing = players.filter(p => !registered.has(p.id));
if (missing.length) await checked(admin.from('registrations').insert(missing.map(p => ({ user_id: p.id, tournament_id: play.id, entry_fee_cents: 0 }))));
await checked(admin.from('tournaments').update({ status: 'live', play_window_start: new Date(Date.now() - 1000).toISOString(), play_window_end: new Date(Date.now() + 3600_000).toISOString() }).eq('id', play.id));
const accounts = [];
for (const p of players) {
  const jar = new Map(), c = createServerClient(keys.API_URL, keys.PUBLISHABLE_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: rows => rows.forEach(r => jar.set(r.name, r.value)) } });
  const auth = await c.auth.signInWithPassword({ email: p.email, password }); assert.equal(auth.error, null);
  accounts.push({ ...p, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), game: null });
}
const samples = [], sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function action(account, action, body, delay = 0, lose = false) {
  const started = performance.now(); await sleep(delay);
  const r = await fetch(`${base}/api/tournaments/${play.id}/game/${action}`, { method: 'POST', headers: { cookie: account.cookie, origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const data = await r.json(); await sleep(delay);
  samples.push({ action, profile: delay ? '600ms injected RTT' : 'loopback', elapsedMs: +(performance.now() - started).toFixed(2), status: r.status });
  assert.equal(r.status, 200, `${action}: ${data.code ?? data.error ?? r.status}`);
  if (!lose) account.game = { ...(account.game ?? {}), ...data }; return data;
}
// Compile before recording the steady-load samples.
await action(accounts[0], 'start', {}); samples.length = 0;
await Promise.all(accounts.map(a => action(a, 'start', {})));
for (let round = 0; round < 12; round++) {
  await Promise.all(accounts.map(a => action(a, 'move', { gameId: a.game.gameId, moveNumber: a.game.moveNumber, direction: ['left','down','right','up'][round % 4], clientTimestamp: Date.now() }, round >= 6 ? 300 : 0)));
  await sleep(250);
  if (round === 5) {
    // Lose an already received response, restart the application, then recover
    // snapshots rather than replaying unknown directions.
    await Promise.all(accounts.map(a => action(a, 'move', { gameId: a.game.gameId, moveNumber: a.game.moveNumber, direction: 'left', clientTimestamp: Date.now() }, 0, true)));
    await restartApp();
    await Promise.all(accounts.map(a => action(a, 'start', { recoverOnly: true, gameId: a.game.gameId })));
  }
}
const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const metrics = ['loopback', '600ms injected RTT'].map(profile => ({ profile, samples: samples.filter(x => x.action === 'move' && x.profile === profile).length,
  p95Ms: p95(samples.filter(x => x.action === 'move' && x.profile === profile).map(x => x.elapsedMs)) }));
await sql(`update public.games set started_at=now()-interval '1 hour' where tournament_id='${play.id}';`);
await Promise.all(accounts.map(a => action(a, 'timeout', { gameId: a.game.gameId })));
await checked(admin.from('tournaments').update({ status: 'finalizing' }).eq('id', play.id)); await cron('process-tournaments');
const results = await checked(admin.from('tournament_results').select('id,user_id').eq('tournament_id', play.id));
assert.equal(results.length, 15); assert.equal(new Set(results.map(r => r.user_id)).size, 15);
assert.equal(await sql('select paused from public.cash_policy;'), 't');
await report('artifacts/rm13/load-report.json', { status: 'PASS_FUNCTIONAL_PERFORMANCE_MEASURED', completedAt: new Date().toISOString(), concurrentPlayers: 15, metrics, requests: samples.length,
  responseLossRecovery: 'PASS_15_SNAPSHOTS_NO_REPLAY', applicationRestarts: 1, combinedBacklogAndLoadRestarts: 2, finalizedResults: results.length, samples,
  environment: 'isolated Next development runtime and real local Supabase; simulator only', slo: 'NOT_APPROVED',
  notMeasured: ['mobile FPS', 'real WAN loss/jitter', 'Vercel cold-start/capacity', 'production SLO'], realMoney: 'NO_GO' });
console.log(JSON.stringify({ status: 'PASS', metrics, finalizedResults: results.length }));
