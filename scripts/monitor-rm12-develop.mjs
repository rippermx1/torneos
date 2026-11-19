import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'

const origin = 'https://rm12-torneos-dev.vercel.app'
const expectedJobs = ['process-tournaments', 'flow-reconcile', 'reconcile-refunds', 'watchdog']

// Runs outside the web process and DB scheduler. Read-only: no provider calls or queue mutations.
export async function checkRm12Monitor(env, fetcher = fetch, now = Date.now()) {
  if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://jnoyjewsqbooqaiighcs.supabase.co' || !env.CRON_SECRET || env.CRON_SECRET.length < 32) {
    throw new Error('Monitor RM-12 requiere configuración explícita de develop')
  }
  let http = null, schedulerHealthy = false, operationalReady = false, notificationsDeferred = null, reason = 'unreachable'
  try {
    const response = await fetcher(origin + '/api/cron/monitor-status', { redirect: 'manual',
      headers: { Authorization: 'Bearer ' + env.CRON_SECRET }, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    http = response.status
    const body = await response.json()
    schedulerHealthy = [200, 503].includes(http) && body.schedulerHealthy === true && Array.isArray(body.jobs) && expectedJobs.every(name => {
      const entries = body.jobs.filter(job => job.job === name)
      const last = Date.parse(entries[0]?.lastSuccessAt)
      return entries.length === 1 && entries[0].state === 'healthy' && Number.isFinite(last) && last <= now + 60_000 && now - last < 15 * 60_000
    })
    operationalReady = http === 200 && body.ok === true && body.operationalReady === true && schedulerHealthy && body.notificationsDeferred === false
    notificationsDeferred = typeof body.notificationsDeferred === 'boolean' ? body.notificationsDeferred : null
    reason = operationalReady ? 'ready' : schedulerHealthy ? 'operational-acceptance-pending' : 'processing-unverified'
  } catch { /* Preserve a failed signal, including HTML, redirects and unreachable targets. */ }
  return { observedAt: new Date(now).toISOString(), origin, http, schedulerHealthy, operationalReady, notificationsDeferred,
    reason, providerCalls: 0, productionDecision: 'NO_GO' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const envFile = args[args.indexOf('--env-file') + 1]
    const output = args[args.indexOf('--output') + 1]
    if (!args.includes('--env-file') || !envFile || !args.includes('--output') || !output) throw new Error('Faltan --env-file y --output')
    const env = parseEnv(fs.readFileSync(envFile, 'utf8'))
    const result = await checkRm12Monitor(env)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    const temp = output + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(result, null, 2) + '\n')
    fs.renameSync(temp, output)
    console.log(JSON.stringify(result))
    if (!result.operationalReady) process.exitCode = 1
  } catch { console.error('No se pudo ejecutar el monitor independiente RM-12'); process.exitCode = 1 }
}
