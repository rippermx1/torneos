import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildSchedulerSql } from './configure-scheduler.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execute = promisify(execFile)
const envFile = path.join(root, '.env.local-stack')
const logs = path.join(root, 'artifacts/local-environment')
const random = () => randomBytes(24).toString('hex')
const command = process.argv[2] ?? 'up'

async function run(executable, args, env = process.env, log = 'command') {
  await mkdir(logs, { recursive: true })
  try {
    const result = await execute(executable, args, { cwd: root, env, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
    await writeFile(path.join(logs, `${log}.log`), result.stdout + result.stderr)
    return result.stdout
  } catch (error) {
    await writeFile(path.join(logs, `${log}.log`), (error.stdout ?? '') + (error.stderr ?? ''))
    throw new Error(`${log} falló. Revisa su log local (puede contener credenciales; no lo compartas).`)
  }
}

function cli(args, log) {
  return process.platform === 'win32'
    ? run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx supabase ${args}`], process.env, log)
    : run('npx', ['supabase', ...args.split(' ')], process.env, log)
}

async function readEnv() {
  const content = await readFile(envFile, 'utf8')
  const env = Object.fromEntries(content.split(/\r?\n/).filter((line) => /^[A-Z_0-9]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  if (env.TORNEOS_LOCAL_MODE !== '1' || env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321' ||
      env.APP_URL !== 'http://127.0.0.1:3081' || env.SUPABASE_SERVER_URL !== 'http://host.docker.internal:54321' ||
      env.FLOW_API_BASE !== 'http://127.0.0.1:3000/api/local-flow' || env.CONFIRM_SUPABASE_PROJECT_REF !== 'local') {
    throw new Error('La configuración no corresponde al stack local de Torneos.')
  }
  return { ...process.env, ...env, RESEND_API_KEY: '', ALERT_EMAIL: 'operaciones@torneos.local', SUPABASE_SMOKE_EMAIL_DOMAIN: 'example.com' }
}

async function seed(env) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error('No se pudieron consultar las cuentas locales.')
  const accounts = [
    ['admin.local.e2e@example.com', 'admin_local', true],
    ['jugador1.local.e2e@example.com', 'jugador1_local', false],
    ['jugador2.local.e2e@example.com', 'jugador2_local', false],
    ['operador.local@example.com', 'operador_local', true],
  ]
  let operator
  for (const [email, username, isAdmin] of accounts) {
    let user = data.users.find((item) => item.email === email)
    if (!user) {
      const result = await client.auth.admin.createUser({ email, password: env.SUPABASE_E2E_PASSWORD, email_confirm: true })
      if (result.error || !result.data.user) throw new Error(`No se pudo crear ${email}`)
      user = result.data.user
      const profile = await client.from('profiles').upsert({ id: user.id, username, full_name: username,
        is_admin: isAdmin, is_banned: false, birth_date: '1994-01-01', kyc_status: 'approved',
        kyc_verified_at: new Date().toISOString(), terms_version: '1.3', terms_accepted_at: new Date().toISOString() })
      if (profile.error) throw new Error(profile.error.message)
      const roles = await client.from('profile_roles').upsert((isAdmin ? ['user', 'admin'] : ['user'])
        .map((role) => ({ profile_id: user.id, role, granted_by: user.id })), { onConflict: 'profile_id,role' })
      if (roles.error) throw new Error(roles.error.message)
    }
    if (username === 'operador_local') operator = user.id
  }
  const { data: demos, error: demoError } = await client.from('tournaments').select('id').like('name', 'Demo local%').in('status', ['open', 'scheduled']).gt('play_window_start', new Date().toISOString())
  if (demoError) throw new Error(demoError.message)
  if (!demos.length) {
    const base = { created_by: operator, is_test: true, business_rule_version: 3, game_type: '2048_score',
      status: 'open', description: 'Desarrollo local. Importes y premios simulados sin valor monetario.',
      registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      play_window_start: new Date(Date.now() + 86_400_000).toISOString(),
      play_window_end: new Date(Date.now() + 90_000_000).toISOString(), max_game_duration_seconds: 600,
      prize_fund_bps: 5500, platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
      prize_3rd_cents: 0 }
    const created = await client.from('tournaments').insert([
      { ...base, name: 'Demo local · participación gratuita', tournament_type: 'freeroll', preset_key: 'freeroll_v1',
        entry_fee_cents: 0, prize_1st_cents: 500000, prize_2nd_cents: 0, min_players: 2, max_players: 10 },
      { ...base, name: 'Demo local · pago simulado', tournament_type: 'standard', preset_key: 'commercial_v1',
        entry_fee_cents: 500000, prize_1st_cents: 2475000, prize_2nd_cents: 825000, min_players: 12, max_players: 15 },
    ])
    if (created.error) throw new Error(created.error.message)
  }
  console.log('Cuentas y torneos locales disponibles. Las cuentas existentes conservan sus datos y MFA.')
}

async function scheduler(env) {
  // Docker-only database, never the linked Supabase project.
  const sql = buildSchedulerSql({ appUrl: 'http://host.docker.internal:3081', cronSecret: env.CRON_SECRET })
  const { spawn } = await import('node:child_process')
  await new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', 'supabase_db_torneos', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdout.resume(); child.stderr.resume()
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error('No se pudo configurar el scheduler local.')))
    child.stdin.end(sql)
  })
  console.log('Cuatro tareas de Supabase Cron configuradas para la aplicación local.')
}

async function main() {
  if (command === 'up' || command === 'setup') {
    console.log('Iniciando Supabase local; los logs y claves quedan en archivos ignorados por Git…')
    await cli('start --exclude edge-runtime,imgproxy', 'supabase-start')
    const status = JSON.parse(await cli('status -o json', 'supabase-status'))
    let existing = {}
    try { existing = await readEnv() } catch (error) { if (error.code !== 'ENOENT') throw error }
    const env = {
      TORNEOS_LOCAL_MODE: '1', TORNEOS_RUNTIME_ENV_FILE: '.env.local-stack', APP_URL: 'http://127.0.0.1:3081',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVER_URL: 'http://host.docker.internal:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
      SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CONFIRM_SUPABASE_PROJECT_REF: 'local',
      SUPABASE_E2E_PASSWORD: existing.SUPABASE_E2E_PASSWORD ?? `${random()}Aa9!`,
      CRON_SECRET: existing.CRON_SECRET ?? random(), FLOW_API_BASE: 'http://127.0.0.1:3000/api/local-flow',
      FLOW_API_KEY: existing.FLOW_API_KEY ?? `local-${random()}`, FLOW_API_SECRET: existing.FLOW_API_SECRET ?? random(),
      LOCAL_FLOW_DATA_DIR: '/app/.local-flow', LOCAL_EMAIL_API_URL: 'http://host.docker.internal:54324/api/v1/send',
      RESEND_API_KEY: '', ALERT_EMAIL: 'operaciones@torneos.local',
    }
    await writeFile(envFile, '# Solo desarrollo local. No compartir ni versionar.\n' + Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
    const runtime = await readEnv()
    await seed(runtime)
    await scheduler(runtime)
    if (command === 'up') {
      console.log('Construyendo y levantando el contenedor de aplicación…')
      await run('docker', ['compose', '--env-file', '.env.local-stack', '-f', 'compose.app.yaml', '-f', 'compose.local.yaml', 'up', '-d', '--build', '--wait', '--wait-timeout', '120'], runtime, 'docker-up')
    }
    console.log('Web: http://127.0.0.1:3081 · Correo: http://127.0.0.1:54324 · Studio: http://127.0.0.1:54323')
    console.log('Cuentas: jugador1.local.e2e@example.com, jugador2.local.e2e@example.com, operador.local@example.com. Contraseña en .env.local-stack (SUPABASE_E2E_PASSWORD).')
    return
  }
  const env = await readEnv()
  if (command === 'seed') return seed(env)
  if (command === 'smoke') {
    // Reset only the dedicated synthetic E2E accounts. The operator's MFA is preserved.
    console.log('Preparando cuentas sintéticas E2E y ejecutando pruebas contra Supabase local…')
    await run(process.execPath, ['scripts/setup-test-users.mjs'], env, 'test-users')
    await run(process.execPath, ['scripts/smoke-local-e2e.mjs'], env, 'smoke-local')
    await run(process.execPath, ['scripts/smoke-local-payments.mjs'], env, 'smoke-payments')
    console.log('Smoke de Auth, MFA, creación, inscripción, movimientos, ranking y pagos simulados: PASS.')
    return
  }
  throw new Error('Usa up, setup, seed o smoke.')
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
