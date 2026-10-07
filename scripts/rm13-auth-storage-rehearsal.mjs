import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { localKeys, sql, PRIVATE, PROJECT, CONTAINER, run, binaryRun, encryptionKey, encrypt, decrypt, sha256, readEnv, report } from './rm13-recovery-lib.mjs';
import { generateTotpCode as totp } from './e2e-totp.mjs';

const started = Date.now(), checks = [];
const keys = await localKeys(), key = await encryptionKey();
const client = secret => createClient(keys.API_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(keys.SECRET_KEY), player = client(keys.PUBLISHABLE_KEY), outsider = client(keys.PUBLISHABLE_KEY);
const sourceAccount = await readEnv('C:/torneos/.env.cloud-test-users.local');
async function check(name, action) { await action(); checks.push({ name, status: 'PASS' }); }
await check('restored develop password authenticates through real GoTrue', async () => {
  const r = await player.auth.signInWithPassword({ email: sourceAccount.PLAYER_EMAIL, password: sourceAccount.SUPABASE_E2E_PASSWORD });
  assert.equal(r.error, null); assert.ok(r.data.session);
  const claims = JSON.parse(Buffer.from(r.data.session.access_token.split('.')[1], 'base64url'));
  assert.equal(claims.iss, `${keys.API_URL}/auth/v1`);
});
const user = (await player.auth.getUser()).data.user;
const password = `${randomBytes(24).toString('hex')}Aa9!`, outsiderEmail = `rm13-${randomUUID()}@example.test`;
const created = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
assert.equal(created.error, null);
assert.equal((await outsider.auth.signInWithPassword({ email: outsiderEmail, password })).error, null);
const factor = await outsider.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'RM13 synthetic recovery' });
assert.equal(factor.error, null);
const secret = factor.data.totp.secret, factorId = factor.data.id;
await check('synthetic MFA authenticates before recovery', async () => {
  const r = await outsider.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) }); assert.equal(r.error, null);
});
const fixtures = [];
for (const bucket of ['kyc-documents', 'payout-proofs', 'cash-proofs']) {
  const path = `${user.id}/rm13-${randomUUID()}.pdf`;
  const bytes = Buffer.from(`%PDF-1.4\nRM13 synthetic ${bucket}; no personal documents\n%%EOF\n`);
  const upload = await admin.storage.from(bucket).upload(path, bytes, { contentType: 'application/pdf' });
  assert.equal(upload.error, null);
  fixtures.push({ bucket, path, sha256: sha256(bytes), bytes: bytes.length });
}
await check('private Storage policies and exact bytes before backup', async () => {
  for (const f of fixtures) {
    const r = await admin.storage.from(f.bucket).download(f.path); assert.equal(r.error, null); assert.equal(sha256(Buffer.from(await r.data.arrayBuffer())), f.sha256);
    assert.ok((await client(keys.PUBLISHABLE_KEY).storage.from(f.bucket).download(f.path)).error);
    assert.ok((await outsider.storage.from(f.bucket).download(f.path)).error);
    const own = await player.storage.from(f.bucket).download(f.path);
    if (f.bucket === 'kyc-documents') assert.equal(own.error, null); else assert.ok(own.error);
  }
});
const dump = await binaryRun('docker', ['exec', CONTAINER, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--quote-all-identifiers', '--schema=public', '--schema=private', '--schema=factory_private', '--schema=integrity_private', '--schema=auth', '--schema=storage', '--schema=supabase_migrations']);
assert.equal(dump.code, 0); assert.ok(dump.out.length > 1000);
const storageName = `supabase_storage_${PROJECT}`;
const inspected = JSON.parse((await run('docker', ['inspect', storageName])).out)[0];
const backend = inspected.Config.Env.find(x => x.startsWith('FILE_STORAGE_BACKEND_PATH='))?.split('=').slice(1).join('=');
assert.ok(backend === '/mnt' || backend?.startsWith('/mnt/')); assert.ok(!backend.includes('..'));
const storage = await binaryRun('docker', ['exec', storageName, 'tar', '-cf', '-', '-C', backend, '.']);
assert.equal(storage.code, 0); assert.ok(storage.out.length > 1000);
await writeFile(resolve(PRIVATE, 'local-data.sql.enc'), encrypt(dump.out, key, 'local-data'), { mode: 0o600 });
await writeFile(resolve(PRIVATE, 'local-storage.tar.enc'), encrypt(storage.out, key, 'local-storage'), { mode: 0o600 });
const snapshot = { data: sha256(dump.out), storage: sha256(storage.out), factorCount: Number(await sql('select count(*) from auth.mfa_factors;')) };
for (const f of fixtures) assert.equal((await admin.storage.from(f.bucket).remove([f.path])).error, null);
const names = ['auth', 'rest', 'storage', 'kong'].map(n => `supabase_${n}_${PROJECT}`);
for (const name of names) assert.equal((await run('docker', ['stop', name])).code, 0);
const recoveryStarted = Date.now();
// Destructive drill is strictly local and explicitly pinned by localKeys(). All
// application/Auth/Storage rows are lost and rebuilt from authenticated backup.
const tables = await sql("select string_agg(format('%I.%I', schemaname, tablename), ',') from pg_tables where schemaname in ('public','private','factory_private','integrity_private','auth','storage','supabase_migrations');");
const data = decrypt(await readFile(resolve(PRIVATE, 'local-data.sql.enc')), key, 'local-data');
assert.equal(sha256(data), snapshot.data);
await sql(`BEGIN; SET session_replication_role=replica; TRUNCATE ${tables} CASCADE; ${data.toString('utf8')} SET session_replication_role=origin; COMMIT;`);
const tar = decrypt(await readFile(resolve(PRIVATE, 'local-storage.tar.enc')), key, 'local-storage');
assert.equal(sha256(tar), snapshot.storage);
assert.equal((await run('docker', ['restart', CONTAINER])).code, 0);
for (const name of names) assert.equal((await run('docker', ['start', name])).code, 0);
assert.equal((await binaryRun('docker', ['exec', '-i', storageName, 'tar', '-xf', '-', '-C', backend], tar)).code, 0);
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${keys.API_URL}/auth/v1/health`, { headers: { apikey: keys.PUBLISHABLE_KEY } }); if (r.ok) break; } catch { /* own startup */ }
  if (i === 59) throw new Error('Owned Auth did not recover');
  await new Promise(resolve => setTimeout(resolve, 500));
}
await check('password and MFA survive data loss and owned service restart', async () => {
  assert.equal((await player.auth.signInWithPassword({ email: sourceAccount.PLAYER_EMAIL, password: sourceAccount.SUPABASE_E2E_PASSWORD })).error, null);
  assert.equal((await outsider.auth.signInWithPassword({ email: outsiderEmail, password })).error, null);
  assert.equal(Number(await sql('select count(*) from auth.mfa_factors;')), snapshot.factorCount);
  // Verify a fresh TOTP interval; a previously consumed code is not recovery evidence.
  const wait = 30_000 - Date.now() % 30_000 + 100;
  await new Promise(resolve => setTimeout(resolve, wait));
  assert.equal((await outsider.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) })).error, null);
});
await check('private Storage bytes and access controls survive lost files and restart', async () => {
  for (const f of fixtures) {
    const r = await admin.storage.from(f.bucket).download(f.path); assert.equal(r.error, null); assert.equal(sha256(Buffer.from(await r.data.arrayBuffer())), f.sha256);
    assert.ok((await client(keys.PUBLISHABLE_KEY).storage.from(f.bucket).download(f.path)).error);
    assert.ok((await outsider.storage.from(f.bucket).download(f.path)).error);
    const own = await player.storage.from(f.bucket).download(f.path);
    if (f.bucket === 'kyc-documents') assert.equal(own.error, null); else assert.ok(own.error);
  }
});
assert.equal(await sql('select paused from public.cash_policy;'), 't');
await report('artifacts/rm13/auth-storage-report.json', { status: 'PASS', completedAt: new Date().toISOString(), durationMs: Date.now() - started, recoveryMs: Date.now() - recoveryStarted,
  target: PROJECT, checks, syntheticFiles: fixtures.map(({ bucket, sha256, bytes }) => ({ bucket, sha256, bytes })), snapshot,
  sourceStorageObjects: 0, cloudMutation: false, providerCalls: 0, realMoney: 'NO_GO',
  notCertified: ['Google OAuth reconfiguration after disaster', 'original human MFA encryption-key portability', 'off-machine key custody', 'scheduled cloud RPO', 'cloud infrastructure RTO'],
});
console.log(JSON.stringify({ status: 'PASS', checks: checks.length, recoveryMs: Date.now() - recoveryStarted, files: fixtures.length }));
