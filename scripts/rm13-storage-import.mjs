import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localKeys, sql, PRIVATE, decrypt, sha256 } from './rm13-recovery-lib.mjs';

// Import bytes through the real Storage API after database reconstruction. An
// upload changes backend version/etag; preserve logical IDs, ownership and audit
// creation time, rather than pointing metadata at a nonexistent old blob version.
export async function importStorage(index, key) {
  const keys = await localKeys();
  const client = createClient(keys.API_URL, keys.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const quote = x => x === null ? 'NULL' : "'" + String(x).replaceAll("'", "''") + "'";
  let imported = 0;
  for (const object of index.objects) {
    const file = resolve(object.file);
    if (!file.startsWith(PRIVATE + '\\') && !file.startsWith(PRIVATE + '/')) throw new Error('Storage backup path outside private directory');
    const ciphertext = await readFile(file);
    if (sha256(ciphertext) !== object.encryptedSha256) throw new Error('Storage ciphertext changed');
    const bytes = decrypt(ciphertext, key, object.name);
    if (sha256(bytes) !== object.sha256) throw new Error('Storage object hash mismatch');
    const predicate = `bucket_id=${quote(object.bucket)} and name=${quote(object.path)}`;
    const source = JSON.parse(await sql(`select coalesce((select json_build_object('id',id,'owner',owner,'owner_id',owner_id,'created_at',created_at,'user_metadata',user_metadata) from storage.objects where ${predicate}),'null'::json);`));
    if (!source) throw new Error('Restore Storage metadata before importing its bytes');
    const upload = await client.storage.from(object.bucket).upload(object.path, bytes, { upsert: true, contentType: object.contentType });
    if (upload.error) throw new Error('Storage recovery upload failed');
    await sql(`update storage.objects set owner=${quote(source.owner)}::uuid,owner_id=${quote(source.owner_id)},created_at=${quote(source.created_at)}::timestamptz,user_metadata=${quote(JSON.stringify(source.user_metadata))}::jsonb where ${predicate} and id=${quote(source.id)}::uuid;`);
    if (await sql(`select id::text from storage.objects where ${predicate};`) !== source.id) throw new Error('Storage recovery changed logical object ID');
    const downloaded = await client.storage.from(object.bucket).download(object.path);
    if (downloaded.error || sha256(Buffer.from(await downloaded.data.arrayBuffer())) !== object.sha256) throw new Error('Recovered Storage bytes mismatch');
    imported++;
  }
  return { status: 'PASS', imported, ownership: 'preserved', objectIds: 'preserved', backendVersion: 'recreated by Storage API' };
}
