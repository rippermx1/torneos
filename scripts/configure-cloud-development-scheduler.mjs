import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateCloudDevelopment } from './check-cloud-development.mjs'
import { buildSchedulerSql } from './configure-scheduler.mjs'
const config = JSON.parse(fs.readFileSync(new URL('../config/cloud-development.json', import.meta.url), 'utf8'))
const summary = validateCloudDevelopment(process.env, config)
const input = new URL('../.env.cloud-scheduler.local', import.meta.url)
fs.writeFileSync(input, buildSchedulerSql({ appUrl: summary.appUrl, cronSecret: process.env.CRON_SECRET }))
const executable = process.platform === 'win32' ? process.env.ComSpec : 'npx'
const queryArgs = ['supabase', 'db', 'query', '--linked', '--project-ref', config.supabaseProjectRef, '--workdir', fileURLToPath(new URL('../artifacts/cloud-development/supabase-config', import.meta.url)), '--file', fileURLToPath(input)]
const args = process.platform === 'win32' ? ['/d', '/c', 'npx', ...queryArgs] : queryArgs
try {
  const output = execFileSync(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 })
  const redacted = output.replaceAll(process.env.CRON_SECRET, '[REDACTED]')
  fs.writeFileSync(new URL('../artifacts/cloud-development/scheduler.log', import.meta.url), redacted)
  console.log(redacted)
} catch (error) {
  throw new Error(String(error.stderr || error.stdout || error.message).replaceAll(process.env.CRON_SECRET, '[REDACTED]'))
}
