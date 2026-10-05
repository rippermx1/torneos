import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createManifest } from './release-manifest.mjs'
import { npmInvocation } from './release-process.mjs'

// No deployment, migration, provider dispatch or staging mutation in this command.
const codeOnly = process.argv.includes('--code-only')
const dir = path.resolve('artifacts/release'); fs.mkdirSync(dir, { recursive: true })
const npm = npmInvocation()
const checks = [], run = (name, args, allowAudit = false) => {
  const env = { ...process.env }
  // Unit tests use their own fixtures. They must never inherit deployment credentials.
  if (name === 'tests') for (const key of Object.keys(env)) if (/^(APP_URL$|NEXT_PUBLIC_|TORNEOS_|VERCEL_ENV$|SUPABASE_|FLOW_|RESEND_|ALERT_EMAIL$|OPS_ESCALATION_|COMPANY_|CRON_SECRET$|PRODUCTION_SUPABASE_|STAGING_SUPABASE_|LOCAL_)/.test(key)) delete env[key]
  const result = spawnSync(npm.command, [...npm.prefix, ...args], { env, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 })
  fs.writeFileSync(path.join(dir, `${name}.log`), result.stdout ?? '')
  // Never dump child stderr; it may include environment or credentials from a provider.
  fs.writeFileSync(path.join(dir, `${name}.stderr.log`), result.stderr ?? '')
  checks.push({ name, exit_code: result.status, status: result.status === 0 ? 'PASS' : allowAudit && result.status === 1 ? 'ASSESS' : 'FAIL' })
  if (checks.at(-1).status === 'FAIL') throw new Error(`Check failed: ${name}; inspect private local artifact`)
  return result
}
try {
  if (process.version !== 'v24.14.1') throw new Error('Use Node 24.14.1 from .nvmrc')
  if (spawnSync(npm.command, [...npm.prefix, '--version'], { encoding: 'utf8' }).stdout?.trim() !== '11.11.0') throw new Error('Use npm 11.11.0 from packageManager')
  run('public-config', ['run', 'check:production-env', '--', '--phase', 'public-build'])
  run('tests', ['test', '--', '--reporter=json', `--outputFile=${path.join(dir, 'web.json')}`])
  run('lint', ['run', 'lint', '--', '.'])
  run('build', ['run', 'build', '--', '--webpack'])
  run('types', ['run', 'typecheck'])
  const audit = run('audit', ['audit', '--json'], true)
  fs.writeFileSync(path.join(dir, 'audit.json'), audit.stdout)
  const { assessAudit } = await import('./release-audit.mjs')
  const assessment = assessAudit(JSON.parse(audit.stdout), JSON.parse(fs.readFileSync('config/dependency-audit-policy.json', 'utf8')), JSON.parse(fs.readFileSync('package-lock.json', 'utf8')))
  fs.writeFileSync(path.join(dir, 'audit-assessment.json'), JSON.stringify(assessment, null, 2) + '\n')
  if (!assessment.ok) throw new Error('Audit has unapproved exposure')
  run('audit-production', ['audit', '--omit=dev', '--json'])
  if (!codeOnly) fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(createManifest(), null, 2) + '\n')
  console.log('Candidate checks passed. Runtime configuration, destination DB/grants and authenticated staging E2E remain separate required evidence.')
} catch (error) { process.exitCode = 1; checks.push({ name: 'candidate', status: 'FAIL', error: error.message }); console.error(error.message) }
finally { fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify({ status: process.exitCode ? 'FAIL' : codeOnly ? 'PASS_CODE_ONLY' : 'PASS_LOCAL_CANDIDATE', production_decision: 'NO_GO', checks, staging: 'NOT_RUN' }, null, 2) + '\n') }
