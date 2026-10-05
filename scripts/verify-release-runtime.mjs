// Local synthetic startup checks only. No provider call, DB write or payment dispatch.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const build = JSON.parse(fs.readFileSync(path.join(root, '.next/required-server-files.json'), 'utf8'))
const snapshot = JSON.parse(build.config.env.TORNEOS_BUILD_PUBLIC_CONFIG)
if (snapshot.environment !== 'staging') throw new Error('This local check requires the synthetic staging candidate')
if (snapshot.url !== 'https://abcdefghijklmnopqrst.supabase.co' || snapshot.key !== `sb_publishable_${'a'.repeat(30)}`) throw new Error('Use the documented synthetic public fixture for this verifier')
const ref = new URL(snapshot.url).hostname.split('.')[0]
const fixture = {
  NODE_ENV: 'production', TORNEOS_ENVIRONMENT: 'staging', NEXT_TELEMETRY_DISABLED: '1',
  APP_URL: snapshot.aliases.NEXT_PUBLIC_SITE_URL ?? snapshot.aliases.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: snapshot.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: snapshot.key,
  STAGING_SUPABASE_PROJECT_REF: ref, PRODUCTION_SUPABASE_PROJECT_REF: 'zyxwvutsrqponmlkjihg',
  SUPABASE_SECRET_KEY: `sb_secret_${'b'.repeat(30)}`, FLOW_API_BASE: 'https://sandbox.flow.cl/api',
  FLOW_API_KEY: 'c'.repeat(32), FLOW_API_SECRET: 'd'.repeat(32), COMPANY_LEGAL_NAME: 'Empresa de prueba limitada',
  COMPANY_RUT: '12.345.678-5', CRON_SECRET: 'e'.repeat(64), RESEND_API_KEY: `re_${'f'.repeat(32)}`,
  RESEND_FROM_EMAIL: 'Torneos <ops@example.org>', ALERT_EMAIL: 'owner@example.org', OPS_ESCALATION_EMAIL: 'backup@example.org',
}
for (const [key, value] of Object.entries(snapshot.aliases)) if (value !== null) fixture[key] = value
const checks = []
async function check(name, changes, shouldStart) {
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve))
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(APP_URL$|NEXT_PUBLIC_|TORNEOS_|VERCEL_|SUPABASE_|FLOW_|RESEND_|ALERT_EMAIL$|OPS_ESCALATION_|COMPANY_|CRON_SECRET$|PRODUCTION_SUPABASE_|STAGING_SUPABASE_|LOCAL_)/.test(key)) delete env[key]
  Object.assign(env, fixture, changes, { PORT: String(port), HOSTNAME: '127.0.0.1' })
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key]
  const child = spawn(process.execPath, [path.join(root, '.next/standalone/scripts/start-release.mjs')], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = '', ready = false, exited = false, code
  child.stdout.on('data', chunk => { log += chunk.toString(); if (log.includes('Ready in')) ready = true })
  child.stderr.on('data', chunk => { log += chunk.toString() })
  const closed = new Promise(resolve => child.once('exit', value => { exited = true; code = value; resolve() }))
  try {
    for (let i = 0; i < 200 && !ready && !exited; i++) await pause(100)
    if (shouldStart) {
      if (!ready || exited) throw new Error('Valid fixture did not start')
      const game = JSON.parse(fs.readFileSync(path.join(root, 'lib/game/runtime-builds.json'), 'utf8'))['2048']
      const response = await fetch(`http://127.0.0.1:${port}/games/2048/${game}/index.html`, { signal: AbortSignal.timeout(5000) })
      if (response.status !== 200 || response.headers.get('x-frame-options') !== 'SAMEORIGIN') throw new Error('Static game not served correctly')
      checks.push({ name, status: 'PASS', http_status: response.status, scope: 'synthetic loopback static request only' })
    } else {
      if (!exited || code === 0 || ready || !log.includes('Configuración rechazada')) {
        fs.writeFileSync(path.join(root, 'artifacts/release', `${name}.private.log`), log)
        throw new Error(`Unsafe configuration was not rejected before readiness: ${name}; ready=${ready}; exited=${exited}; code=${code}`)
      }
      checks.push({ name, status: 'PASS', exit_code: code, ready: false })
    }
  } finally { if (!exited) child.kill(); await closed }
}
let status = 'PASS'
try {
  await check('valid-synthetic-staging', {}, true)
  await check('missing-flow-endpoint', { FLOW_API_BASE: undefined }, false)
  await check('frozen-public-key-mismatch', { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'z'.repeat(30)}` }, false)
  await check('frozen-public-origin-mismatch', { APP_URL: 'https://other.example.org', NEXT_PUBLIC_SITE_URL: 'https://other.example.org' }, false)
  await check('frozen-deployment-target-mismatch', { TORNEOS_ENVIRONMENT: 'production', PRODUCTION_SUPABASE_PROJECT_REF: ref, FLOW_API_BASE: 'https://www.flow.cl/api' }, false)
  await check('simulator-outside-local', { TORNEOS_LOCAL_MODE: '1' }, false)
  await check('private-runtime-credential-missing', { SUPABASE_SECRET_KEY: undefined }, false)
} catch (error) { status = 'FAIL'; checks.push({ status: 'FAIL', error: error.message }); process.exitCode = 1 }
const output = path.join(root, 'artifacts/release/runtime.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ status, checks, provider_dispatch: 'NOT_INVOKED_BY_VERIFIER', production_decision: 'NO_GO' }, null, 2) + '\n')
console.log(JSON.stringify({ status, checks: checks.length, evidence: output }))
