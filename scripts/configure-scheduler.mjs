import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import nextEnv from '@next/env'
import { requireExplicitProjectTarget } from './supabase-safety.mjs'

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const JOBS = [
  {
    name: 'torneos-process-tournaments',
    schedule: '*/5 * * * *',
    path: '/api/cron/process-tournaments',
  },
  {
    name: 'torneos-flow-reconcile',
    schedule: '*/10 * * * *',
    path: '/api/cron/flow-reconcile',
  },
  {
    name: 'torneos-reconcile-refunds',
    schedule: '*/10 * * * *',
    path: '/api/cron/reconcile-refunds',
  },
  {
    name: 'torneos-watchdog',
    schedule: '17 * * * *',
    path: '/api/cron/watchdog',
  },
]

/**
 * @param {Record<string, string | undefined>} env
 * @param {...string} names
 */
function firstNonEmpty(env, ...names) {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

/** @param {Record<string, string | undefined>} env */
export function validateSchedulerConfig(env = process.env) {
  const appUrl = firstNonEmpty(env, 'APP_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL')
  const supabaseUrl = firstNonEmpty(env, 'NEXT_PUBLIC_SUPABASE_URL')
  const cronSecret = firstNonEmpty(env, 'CRON_SECRET')

  if (!appUrl) throw new Error('Falta APP_URL/NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_SITE_URL.')
  if (!supabaseUrl) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL.')
  if (!cronSecret || cronSecret.length < 32) {
    throw new Error('CRON_SECRET debe estar configurado y tener al menos 32 caracteres.')
  }

  let parsedAppUrl
  try {
    parsedAppUrl = new URL(appUrl)
  } catch {
    throw new Error('La URL publica de la aplicacion no es valida.')
  }

  if (parsedAppUrl.protocol !== 'https:') {
    throw new Error('La URL publica de la aplicacion debe usar HTTPS.')
  }
  if (parsedAppUrl.username || parsedAppUrl.password || parsedAppUrl.search || parsedAppUrl.hash) {
    throw new Error('La URL publica no puede contener credenciales, query ni fragmento.')
  }
  if (parsedAppUrl.pathname !== '/' && parsedAppUrl.pathname !== '') {
    throw new Error('La URL publica debe apuntar al origen, sin una ruta adicional.')
  }

  const projectRef = requireExplicitProjectTarget(
    supabaseUrl,
    'Configuracion del scheduler',
    env
  )

  return {
    appUrl: parsedAppUrl.origin,
    cronSecret,
    projectRef,
  }
}

export function buildSchedulerSql({ appUrl, cronSecret }) {
  const appUrlLiteral = sqlLiteral(appUrl)
  const cronSecretLiteral = sqlLiteral(cronSecret)
  const jobNames = JOBS.map((job) => sqlLiteral(job.name)).join(', ')

  const schedules = JOBS.map(
    (job) => `select cron.schedule(
  ${sqlLiteral(job.name)},
  ${sqlLiteral(job.schedule)},
  ${sqlLiteral(`select private.invoke_app_cron('${job.path}');`)}
);`
  ).join('\n\n')

  return `
do $vault$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id
  from vault.secrets
  where name = 'torneos_app_url'
  order by updated_at desc
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(${appUrlLiteral}, 'torneos_app_url', 'URL canonica para tareas programadas');
  else
    perform vault.update_secret(v_secret_id, ${appUrlLiteral}, 'torneos_app_url', 'URL canonica para tareas programadas');
  end if;

  v_secret_id := null;
  select id into v_secret_id
  from vault.secrets
  where name = 'torneos_cron_secret'
  order by updated_at desc
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(${cronSecretLiteral}, 'torneos_cron_secret', 'Bearer para endpoints cron de TorneosPlay');
  else
    perform vault.update_secret(v_secret_id, ${cronSecretLiteral}, 'torneos_cron_secret', 'Bearer para endpoints cron de TorneosPlay');
  end if;
end;
$vault$;

do $unschedule$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname in (${jobNames})
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$unschedule$;

${schedules}

select jobname, schedule, active
from cron.job
where jobname in (${jobNames})
order by jobname;
`
}

function runLinkedSql(sql, secretsToRedact) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32'
      ? (process.env.ComSpec ?? 'cmd.exe')
      : 'npx'
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx supabase db query --linked']
      : ['supabase', 'db', 'query', '--linked']
    const child = spawn(executable, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      const redact = (value) => secretsToRedact.reduce(
        (current, secret) => current.replaceAll(secret, '[REDACTED]'),
        value
      )

      if (code !== 0) {
        reject(new Error(redact(stderr || stdout || `Supabase CLI termino con codigo ${code}.`)))
        return
      }

      resolve(redact(stdout))
    })

    child.stdin.end(sql)
  })
}

export async function main() {
  loadEnvConfig(rootDir)
  const config = validateSchedulerConfig(process.env)
  const sql = buildSchedulerSql(config)

  console.log(`Configurando scheduler en el proyecto ${config.projectRef}...`)
  const output = await runLinkedSql(sql, [config.cronSecret])
  if (output.trim()) console.log(output.trim())
  console.log(`Scheduler configurado: ${JOBS.map((job) => job.name).join(', ')}`)
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
