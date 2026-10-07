import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEV_REF, PRIVATE, readEnv, encryptionKey, encrypt, decrypt, sha256 } from './rm13-recovery-lib.mjs';

export async function backupCloudStorage(directory, key) {
  const env = await readEnv('C:/torneos/.env.cloud-development.local');
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${DEV_REF}.supabase.co`) throw new Error('Storage backup must target develop');
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return backupStorage(client, directory, key, DEV_REF);
}

export async function backupStorage(client, directory, key, source) {
  const buckets = await client.storage.listBuckets();
  if (buckets.error) throw new Error('Cannot list develop Storage buckets');
  const objects = [], files = [];
  await mkdir(directory, { recursive: true });
  async function walk(bucket, prefix = '', capture = true, inventory = []) {
    for (let offset = 0; ; offset += 100) {
      const listed = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (listed.error) throw new Error('Cannot list private Storage objects');
      for (const item of listed.data) {
        const name = [prefix, item.name].filter(Boolean).join('/');
        if (!item.id) { await walk(bucket, name, capture, inventory); continue; }
        inventory.push([bucket, name, item.id, item.updated_at]);
        if (!capture) continue;
        const response = await client.storage.from(bucket).download(name);
        if (response.error) throw new Error('Cannot download private Storage backup object');
        const bytes = Buffer.from(await response.data.arrayBuffer()), label = `storage-object-${objects.length}`;
        const file = resolve(directory, `${label}.enc`), ciphertext = encrypt(bytes, key, label);
        await writeFile(file, ciphertext, { mode: 0o600 });
        const entry = { name: label, file, sha256: sha256(bytes), bytes: bytes.length, encryptedSha256: sha256(ciphertext) };
        files.push(entry); objects.push({ ...entry, bucket, path: name, contentType: item.metadata?.mimetype ?? 'application/octet-stream', updatedAt: item.updated_at });
      }
      if (listed.data.length < 100) break;
    }
    return inventory;
  }
  const before = [];
  for (const b of buckets.data) await walk(b.id, '', true, before);
  // Detect writes during byte export. DB/Storage are separate services; a moving
  // snapshot must be retried in a quiescent window, rather than certified complete.
  const again = await client.storage.listBuckets(), after = [];
  if (again.error || JSON.stringify(again.data.map(b => b.id).sort()) !== JSON.stringify(buckets.data.map(b => b.id).sort())) throw new Error('Storage buckets changed during backup');
  for (const b of again.data) await walk(b.id, '', false, after);
  const canonical = entries => JSON.stringify(entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (canonical(before) !== canonical(after)) throw new Error('Storage inventory changed during backup');
  const bytes = Buffer.from(JSON.stringify({ source, objects })), label = 'storage-index';
  const file = resolve(directory, `${label}.enc`), ciphertext = encrypt(bytes, key, label);
  await writeFile(file, ciphertext, { mode: 0o600 });
  files.push({ name: label, file, sha256: sha256(bytes), bytes: bytes.length, encryptedSha256: sha256(ciphertext) });
  return { files, summary: { status: 'PASS', buckets: buckets.data.length, objects: objects.length, totalBytes: objects.reduce((n, x) => n + x.bytes, 0), concurrency: 'Requires quiescent Storage/DDL window across database and object backup' } };
}

if (process.argv.includes('--confirm-develop-storage-backup')) {
  const directory = resolve(PRIVATE, `storage-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const key = await encryptionKey(), result = await backupCloudStorage(directory, key);
  // Verify envelopes without exposing paths, private documents or credentials.
  for (const f of result.files) if (sha256(decrypt(await readFile(f.file), key, f.name)) !== f.sha256) throw new Error('Storage backup verification failed');
  await writeFile('artifacts/rm13/cloud-storage-manifest.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
}
