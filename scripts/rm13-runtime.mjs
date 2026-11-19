import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { localKeys, sql, report } from './rm13-recovery-lib.mjs';
let keys;
for (let n = 0; n < 60; n++) {
  try { keys = await localKeys(); break; }
  catch { if (n === 59) throw new Error('Owned local services did not become ready'); }
  await new Promise(resolve => setTimeout(resolve, 500));
}
const config = {
  NODE_ENV: 'development', TORNEOS_ENV: 'local', TORNEOS_LOCAL_MODE: '1',
  APP_URL: 'http://127.0.0.1:23431', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:23431',
  NEXT_PUBLIC_SUPABASE_URL: keys.API_URL, SUPABASE_SERVER_URL: keys.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: keys.SECRET_KEY,
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', STAGING_PHASE: '', STAGING_TARGET_REF: '',
  CRON_SECRET: randomBytes(32).toString('hex'), FLOW_API_BASE: 'http://127.0.0.1:23431/api/local-flow',
  FLOW_API_KEY: `local-${randomBytes(16).toString('hex')}`, FLOW_API_SECRET: randomBytes(32).toString('hex'),
  RESEND_API_KEY: '', ALERT_EMAIL: '', OPS_ESCALATION_EMAIL: '', LOCAL_EMAIL_API_URL: '',
  LOCAL_FLOW_DATA_DIR: 'artifacts/rm13/private/flow', CONFIRM_SUPABASE_PROJECT_REF: 'local',
};
const env = { ...process.env, ...config };
if (await sql('select paused from public.cash_policy;') !== 't') throw new Error('Cash must remain paused');
await writeFile('.env.rm13-local', Object.entries(config).map(([k, v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '23431'], { env, windowsHide: true, stdio: 'inherit' });
await report('artifacts/rm13/runtime-process.json', { pid: child.pid, port: 23431, target: 'torneos-rm13-recovery', mode: 'next-dev', providers: 'local simulator only' });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
