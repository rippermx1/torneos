/** Read-only backup of the explicitly pinned develop project. No production fallback. */
import { resolve } from 'node:path';
import { mkdir, writeFile, stat, unlink } from 'node:fs/promises';
import { DEV_REF, PRIVATE, cli, encryptionKey, sealFile, report } from './rm13-recovery-lib.mjs';
import { backupCloudStorage } from './rm13-storage-backup.mjs';

if (!process.argv.includes('--confirm-develop-backup')) throw new Error('Requires --confirm-develop-backup');
await mkdir(PRIVATE, { recursive: true });
const key = await encryptionKey(), started = Date.now();
const files = [];
const snapshotDirectory = resolve(PRIVATE, `cloud-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(snapshotDirectory, { recursive: false });
for (const [name, options] of [['roles', ['--role-only']], ['schema', []], ['managed-schema', ['--schema', 'auth,storage']], ['data', ['--schema', 'public,private,factory_private,integrity_private,auth,storage,supabase_migrations', '--data-only', '--use-copy']]]) {
  const file = resolve(snapshotDirectory, `cloud-${name}.sql`);
  console.log(`Backing up develop ${name}; private output only`);
  const result = await cli(['db', 'dump', '--project-ref', DEV_REF, ...options, '--file', file]);
  await writeFile(resolve(PRIVATE, `${name}-dump.log`), result.out + result.err);
  if (result.code || (await stat(file)).size === 0) throw new Error(`${name} backup failed; inspect private diagnostic log`);
  files.push({ ...await sealFile(file, key, name), file: file + '.enc' });
  await unlink(file); // authenticated encrypted copy remains; no plaintext Auth backup
}
const storage = await backupCloudStorage(snapshotDirectory, key);
files.push(...storage.files);
await report('artifacts/rm13/cloud-backup-manifest.json', {
  projectRef: DEV_REF, completedAt: new Date().toISOString(), durationMs: Date.now() - started, encryption: 'AES-256-GCM with authenticated labels',
  files, databaseScope: ['public', 'private', 'factory_private', 'integrity_private', 'auth', 'storage', 'supabase_migrations'], storageBytes: storage.summary,
  notIncluded: ['OAuth/SMTP/JWT configuration', 'Vault decryption key', 'provider secrets', 'cloud infrastructure', 'PITR WAL'],
  providerDispatch: 'BLOCKED', snapshot: 'pg_dump data transaction; separate schema/role exports require no DDL during backup',
});
console.log(JSON.stringify({ status: 'PASS_DATABASE_BACKUP', files: files.length, durationMs: Date.now() - started }));
