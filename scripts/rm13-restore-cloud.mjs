/** Transactional recovery only into the explicitly owned, loopback Supabase stack. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertOwnedStack, sql, PRIVATE, encryptionKey, decrypt, sha256, report } from './rm13-recovery-lib.mjs';
import { importStorage } from './rm13-storage-import.mjs';

const verifyOnly = process.argv.includes('--verify-restored-target');
if (!verifyOnly && !process.argv.includes('--confirm-owned-empty-target')) throw new Error('Requires --confirm-owned-empty-target or --verify-restored-target');
await assertOwnedStack();
const started = Date.now(), key = await encryptionKey();
const manifest = JSON.parse(await readFile('artifacts/rm13/cloud-backup-manifest.json', 'utf8'));
if (manifest.projectRef !== 'jnoyjewsqbooqaiighcs') throw new Error('Unexpected backup source');
const sections = {};
for (const f of manifest.files) {
  const file = f.file ?? resolve(PRIVATE, `cloud-${f.name}.sql.enc`);
  if (!resolve(file).startsWith(PRIVATE + '\\') && !resolve(file).startsWith(PRIVATE + '/')) throw new Error('Backup path outside private recovery directory');
  const sealed = await readFile(file);
  if (sha256(sealed) !== f.encryptedSha256) throw new Error('Backup ciphertext hash mismatch');
  const bytes = decrypt(sealed, key, f.name);
  if (sha256(bytes) !== f.sha256) throw new Error('Backup plaintext hash mismatch');
  if (['roles', 'schema', 'managed-schema', 'data', 'storage-index'].includes(f.name)) sections[f.name] = bytes.toString('utf8');
}
// An existing object backup needs the import stage after database reconstruction;
// never silently certify a DB-only restore as complete Storage recovery.
const storageIndex = sections['storage-index'] ? JSON.parse(sections['storage-index']) : null;
if (!verifyOnly && (await sql("select count(*) from auth.users;") !== '0' || await sql("select to_regclass('public.profiles') is null;") !== 't')) {
  throw new Error('Target is not empty. Recovery never overwrites an existing project.');
}
// Managed schemas are supplied by the real local services. Restore custom Auth
// triggers and Storage policies from the separately archived managed-schema DDL.
// Never replay all managed constraints over an already initialized service schema.
const managedCustom = sections['managed-schema'].split(/\r?\n/).filter(line =>
  /^CREATE OR REPLACE TRIGGER /.test(line) && line.includes('"auth"."users"') ||
  /^CREATE POLICY /.test(line) && line.includes('"storage".')
).join('\n');
if (!verifyOnly) {
await sql("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);");
await sql("alter table supabase_migrations.schema_migrations add column if not exists created_by text, add column if not exists idempotency_key text, add column if not exists rollback text[];");
// Realtime is deliberately not running in this isolated drill. Keep its ACL role
// as NOLOGIN, without adding a network service or copying a hosted password.
await sql("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_realtime_admin') THEN CREATE ROLE supabase_realtime_admin NOLOGIN NOINHERIT; END IF; END $$;");
await sql(`BEGIN;\n${sections.roles}\n${sections.schema}\n${managedCustom}\nSET session_replication_role=replica;\n${sections.data}\nSET session_replication_role=origin;\nCOMMIT;`);
}
// Compare every backed-up COPY projection, including password hashes, MFA rows,
// balances and private tables. No sensitive values leave PostgreSQL.
const copyBlocks = [...sections.data.matchAll(/COPY ("[\w]+"\."[\w]+") \(([^)]+)\) FROM stdin;\r?\n([\s\S]*?)\\\.\r?\n/g)];
if (!copyBlocks.length) throw new Error('Backup has no COPY blocks');
const checks = copyBlocks.map(([, table, columns, rows], i) => {
  const temp = `rm13_verify_${i}`;
  const projection = relation => `SELECT to_jsonb(r) FROM (SELECT ${columns} FROM ${relation}) r`;
  return `CREATE TEMP TABLE ${temp} AS SELECT ${columns} FROM ${table} WHERE false;\nCOPY ${temp} (${columns}) FROM stdin;\n${rows}\\.\nDO $$ BEGIN IF EXISTS ((${projection(temp)} EXCEPT ALL ${projection(table)}) UNION ALL (${projection(table)} EXCEPT ALL ${projection(temp)})) THEN RAISE EXCEPTION 'Recovery row mismatch: ${table}'; END IF; END $$;\nDROP TABLE ${temp};`;
});
await sql(checks.join('\n'));
const storageImport = storageIndex ? await importStorage(storageIndex, key) : { status: 'NOT_IN_DATABASE_MANIFEST_VERIFY_SEPARATE_STORAGE_SNAPSHOT' };
if (await sql('select paused from public.cash_policy;') !== 't') throw new Error('Recovered cash policy must remain paused');
const result = JSON.parse(await sql(`select json_build_object(
 'authUsers',(select count(*) from auth.users),'identities',(select count(*) from auth.identities),
 'sessions',(select count(*) from auth.sessions),'mfaFactors',(select count(*) from auth.mfa_factors),
 'buckets',(select count(*) from storage.buckets),'objects',(select count(*) from storage.objects),
 'payments',(select count(*) from public.flow_payment_attempts),'refunds',(select count(*) from public.flow_refund_attempts),
 'migrations',(select count(*) from supabase_migrations.schema_migrations),'cashPaused',(select paused from public.cash_policy),
 'cronActive',(select count(*) from cron.job where active));`));
if (result.cronActive) throw new Error('External cron dispatch must remain disabled');
await report('artifacts/rm13/cloud-restore-report.json', { status: 'PASS_DATABASE_RESTORE', completedAt: new Date().toISOString(), durationMs: Date.now() - started,
  source: manifest.projectRef, target: 'torneos-rm13-recovery', engine: await sql('show server_version;'), aggregate: result,
  managedCustomStatements: managedCustom.split('\n').filter(Boolean).length,
  exactCopyProjectionsVerified: copyBlocks.length,
  protectedTransport: 'loopback; no external cron jobs or provider credentials restored',
  authConfiguration: 'New local signing keys and SMTP; OAuth provider settings require separate reconstruction',
  storageBytes: storageImport, rtoObservedMs: verifyOnly ? null : Date.now() - started, verificationOnly: verifyOnly, rpo: 'NOT_CERTIFIED_NO_AUTOMATED_BACKUP_SCHEDULE',
});
console.log(JSON.stringify({ status: 'PASS_DATABASE_RESTORE', aggregate: result, durationMs: Date.now() - started }));
