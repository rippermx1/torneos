import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { localKeys, assertOwnedStack, sql, run, binaryRun, CONTAINER, PROJECT, PRIVATE, encryptionKey, encrypt, decrypt, sha256, readEnv, report } from './rm13-recovery-lib.mjs';

const keys = await localKeys(), key = await encryptionKey();
const state = JSON.parse(await readFile('artifacts/rm13/private/load-fixtures.json', 'utf8'));
const prefix = `RM13_${state.id}`;
const client = createClient(keys.API_URL, keys.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let refund = (await client.from('flow_refund_attempts').select('*').in('flow_payment_attempt_id', state.attempts.map(a => a.id)).eq('status', 'dispatching').limit(1)).data?.[0];
if (refund && !refund.flow_refund_token) {
  // Resume only this owned fault fixture after an interrupted rehearsal.
  for (const file of (await readdir(resolve(PRIVATE, 'flow'))).filter(f => /^refund-[a-f0-9-]{36}\.json$/.test(f))) {
    const provider = JSON.parse(await readFile(resolve(PRIVATE, 'flow', file), 'utf8'));
    if (provider.refundCommerceOrder !== refund.refund_commerce_order) continue;
    const repaired = await client.from('flow_refund_attempts').update({ status: 'completed', flow_refund_token: provider.token, flow_refund_order: provider.flowRefundOrder }).eq('id', refund.id).select().single();
    assert.equal(repaired.error, null); refund = repaired.data; break;
  }
}
refund ??= (await client.from('flow_refund_attempts').select('*').in('flow_payment_attempt_id', state.attempts.map(a => a.id)).eq('status', 'completed').limit(1)).data?.[0];
assert.ok(refund?.dispatch_nonce && refund.flow_refund_token);
const providerFile = JSON.parse(await readFile(resolve(PRIVATE, 'flow', `refund-${refund.flow_refund_token}.json`), 'utf8'));
assert.equal(providerFile.status, 'completed'); assert.equal(String(providerFile.flowRefundOrder), refund.flow_refund_order);
// Simulate a provider completion whose create response was lost. Its durable
// nonce survives the restored database; no second external create is permitted.
await sql(`update public.flow_refund_attempts set status='dispatching',flow_refund_token=NULL,flow_refund_order=NULL,dispatched_at=now()-interval '25 hours' where id='${refund.id}';`);
const app = JSON.parse(await readFile('artifacts/rm13/runtime-process.json', 'utf8'));
assert.equal(app.port, 23431); assert.equal(app.target, PROJECT);
await run('taskkill', ['/PID', String(app.pid), '/T', '/F']); // an interrupted rehearsal may already have stopped it
const names = ['auth', 'rest', 'storage', 'kong'].map(x => `supabase_${x}_${PROJECT}`);
for (const name of names) assert.equal((await run('docker', ['stop', name])).code, 0);
await assertOwnedStack();
const schemas = ['public','private','factory_private','integrity_private','auth','storage','supabase_migrations'];
const fingerprints = async () => {
  await sql('select 1;');
  const output = await sql(`CREATE TEMP TABLE rm13_digest(table_name text,rows bigint,digest text);
    DO $$ DECLARE t record; BEGIN FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN (${schemas.map(s => `'${s}'`).join(',')}) ORDER BY schemaname,tablename LOOP
      EXECUTE format('INSERT INTO rm13_digest SELECT %L,count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' order by to_jsonb(r)::text),'''')) FROM %I.%I r',t.schemaname||'.'||t.tablename,t.schemaname,t.tablename);
    END LOOP; END $$; SELECT json_agg(r ORDER BY table_name) FROM rm13_digest r;`);
  return output.slice(output.indexOf('['));
};
const before = await fingerprints();
const dump = await binaryRun('docker', ['exec', CONTAINER, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--quote-all-identifiers', ...schemas.map(s => `--schema=${s}`)]);
assert.equal(dump.code, 0);
const ciphertext = encrypt(dump.out, key, 'financial-data');
await writeFile(resolve(PRIVATE, 'financial-data.sql.enc'), ciphertext, { mode: 0o600 });
const tables = await sql(`select string_agg(format('%I.%I',schemaname,tablename),',') from pg_tables where schemaname in (${schemas.map(s => `'${s}'`).join(',')});`);
const started = Date.now();
await sql(`BEGIN; SET session_replication_role=replica; TRUNCATE ${tables} CASCADE; COMMIT;`);
assert.equal(await sql('select count(*) from flow_refund_attempts;'), '0');
assert.equal(await sql('select count(*) from auth.users;'), '0');
const restored = decrypt(await readFile(resolve(PRIVATE, 'financial-data.sql.enc')), key, 'financial-data');
assert.equal(sha256(restored), sha256(dump.out));
await sql(`BEGIN; SET session_replication_role=replica; ${restored.toString('utf8')} SET session_replication_role=origin; COMMIT;`);
const after = await fingerprints(); assert.equal(after, before, 'Complete financial/Auth/Storage row fingerprint mismatch');
assert.equal((await run('docker', ['restart', CONTAINER])).code, 0);
for (const name of names) assert.equal((await run('docker', ['start', name])).code, 0);
for (let n = 0; n < 60; n++) {
  try { if ((await fetch('http://127.0.0.1:23421/auth/v1/health', { headers: { apikey: keys.PUBLISHABLE_KEY } })).ok) break; } catch { /* service warming */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
const log = openSync(resolve(PRIVATE, 'financial-runtime-restart.log'), 'a');
const child = spawn(process.execPath, [resolve('scripts/rm13-runtime.mjs')], { detached: true, windowsHide: true, stdio: ['ignore', log, log] }); child.unref(); closeSync(log);
let env;
for (let n = 0; n < 60; n++) {
  try {
    const next = JSON.parse(await readFile('artifacts/rm13/runtime-process.json', 'utf8'));
    if (next.pid !== app.pid && (await fetch('http://127.0.0.1:23431/api/cron/flow-reconcile')).status === 401) { env = await readEnv('.env.rm13-local'); break; }
  } catch { /* owned recovery */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(env);
const cron = async name => {
  const r = await fetch(`${env.APP_URL}/api/cron/${name}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` }, signal: AbortSignal.timeout(60_000) });
  return { status: r.status, body: await r.json() };
};
assert.equal((await cron('reconcile-refunds')).status, 500); // uncertain obligation must be visible
assert.equal(await sql(`select status from flow_refund_attempts where id='${refund.id}';`), 'unknown');
const claim = await client.rpc('claim_flow_refund', { p_refund_id: refund.id, p_nonce: randomUUID() });
assert.equal(claim.error, null); assert.equal(claim.data, null);
const attached = await client.rpc('record_flow_refund_dispatch', { p_refund_id: refund.id, p_nonce: refund.dispatch_nonce,
  p_token: refund.flow_refund_token, p_flow_order: refund.flow_refund_order, p_error: null });
assert.equal(attached.error, null); assert.equal(attached.data, true);
assert.equal((await cron('reconcile-refunds')).status, 200);
assert.equal((await cron('flow-reconcile')).status, 200);
const final = JSON.parse(await sql(`select json_build_object('refunds',(select count(*) from flow_refund_attempts where flow_payment_attempt_id in (select id from flow_payment_attempts where commerce_order like '${prefix}%')),'completed',(select count(*) from flow_refund_attempts where status='completed' and flow_payment_attempt_id in (select id from flow_payment_attempts where commerce_order like '${prefix}%')),'cashPaused',(select paused from cash_policy),'gameResults',(select count(*) from tournament_results where tournament_id='${state.tournaments.find(t => t.kind==='play').id}'));`));
assert.deepEqual(final, { refunds: 61, completed: 61, cashPaused: true, gameResults: 15 });
const ledgerBefore = JSON.parse(before).find(x => x.table_name === 'public.wallet_transactions');
const ledgerAfter = JSON.parse(await fingerprints()).find(x => x.table_name === 'public.wallet_transactions');
assert.deepEqual(ledgerAfter, ledgerBefore, 'Reconciliation duplicated or changed wallet ledger');
await report('artifacts/rm13/financial-recovery-report.json', { status: 'PASS', completedAt: new Date().toISOString(), recoveryAndReconciliationMs: Date.now()-started,
  comparedTables: JSON.parse(before).length, backupSha256: sha256(dump.out), datasetFingerprintSha256: sha256(before),
  emptyDatabaseConfirmed: true, authRecovered: true, gameResultsRecovered: 15, financialObligationsRecovered: 61,
  staleDispatchBecameUnknown: true, uncertainDispatchNotReclaimed: true, lateProviderResponseAttachedWithOriginalNonce: true,
  ledgerUnchanged: true, final, provider: 'persistent local simulator', externalProviderCalls: 0, realMoney: 'NO_GO' });
console.log(JSON.stringify({ status: 'PASS', comparedTables: JSON.parse(before).length, final }));
