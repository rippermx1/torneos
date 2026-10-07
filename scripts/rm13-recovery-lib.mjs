import { spawn } from 'node:child_process';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export const DEV_REF = 'jnoyjewsqbooqaiighcs';
export const PROJECT = 'torneos-rm13-recovery';
export const CONTAINER = `supabase_db_${PROJECT}`;
export const PRIVATE = resolve('artifacts/rm13/private');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function run(bin, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', x => { out += x; });
    child.stderr.on('data', x => { err += x; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, out, err }));
    child.stdin.end(input);
  });
}
export const cli = args => run(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args]);
export async function binaryRun(bin, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let err = '';
    child.stdout.on('data', x => chunks.push(x)); child.stderr.on('data', x => { err += x; });
    child.on('error', reject); child.on('close', code => resolve({ code, out: Buffer.concat(chunks), err })); child.stdin.end(input);
  });
}
export async function assertOwnedStack() {
  const r = await run('docker', ['inspect', CONTAINER]);
  if (r.code) throw new Error('Owned RM13 database is not running');
  const info = JSON.parse(r.out)[0];
  const bindings = Object.values(info.HostConfig.PortBindings ?? {}).flat();
  if (!bindings.length || bindings.some(b => b.HostIp !== '127.0.0.1')) throw new Error('Recovery target must bind only to loopback');
  if (!info.NetworkSettings.Networks[PROJECT]) throw new Error('Unexpected recovery target network');
}
export async function sql(statement) {
  const r = await run('docker', ['exec', '-i', CONTAINER, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], statement);
  if (r.code) {
    await mkdir(PRIVATE, { recursive: true });
    await writeFile(resolve(PRIVATE, 'last-sql-error.log'), r.err);
    throw new Error('SQL failed; inspect the private local diagnostic log');
  }
  return r.out.trim();
}
export async function localKeys() {
  await assertOwnedStack();
  const r = await cli(['status', '--workdir', 'artifacts/rm13/stack', '--output', 'json']);
  if (r.code) throw new Error('Cannot read owned local stack status');
  const keys = JSON.parse(r.out);
  if (new URL(keys.API_URL).hostname !== '127.0.0.1' || new URL(keys.API_URL).port !== '23421') throw new Error('Unexpected API target');
  return keys;
}
export async function encryptionKey() {
  await mkdir(PRIVATE, { recursive: true });
  const file = resolve(PRIVATE, 'recovery.key');
  try { const key = await readFile(file); if (key.length !== 32) throw new Error('Invalid recovery key'); return key; }
  catch (e) { if (e.code !== 'ENOENT') throw e; const key = randomBytes(32); await writeFile(file, key, { flag: 'wx', mode: 0o600 }); return key; }
}
export function encrypt(bytes, key, label) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(label));
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('RM13GCM1'), iv, cipher.getAuthTag(), body]);
}
export function decrypt(bytes, key, label) {
  if (bytes.subarray(0, 8).toString() !== 'RM13GCM1') throw new Error('Invalid recovery envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
  decipher.setAAD(Buffer.from(label)); decipher.setAuthTag(bytes.subarray(20, 36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}
export async function sealFile(file, key, label) {
  const bytes = await readFile(file), target = `${file}.enc`;
  await writeFile(target, encrypt(bytes, key, label), { mode: 0o600 });
  return { name: label, sha256: sha256(bytes), bytes: bytes.length, encryptedSha256: sha256(await readFile(target)) };
}
export async function readEnv(file) {
  return Object.fromEntries((await readFile(file, 'utf8')).split(/\r?\n/).filter(x => /^[A-Z0-9_]+=/.test(x)).map(x => {
    const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1).replace(/^['"]|['"]$/g, '')];
  }));
}
export async function report(file, data) {
  await mkdir(dirname(resolve(file)), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}
