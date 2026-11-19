import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/cloud-development.json'), 'utf8'))
const auth = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'com.vercel.cli/Data/auth.json'), 'utf8'))
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?') ? '&' : '?'}teamId=${config.vercelTeamId}`, {
    method, headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  })
  const data = await response.json()
  if (!response.ok && response.status !== 404) throw new Error(`Vercel ${response.status}: ${data.error?.code ?? 'request_failed'}`)
  return { status: response.status, data }
}
let project = await api(`/v9/projects/${config.name}`)
if (project.status === 404) project = await api('/v11/projects', 'POST', { name: config.name, framework: 'nextjs', publicSource: false, installCommand: 'npm ci', buildCommand: 'node scripts/check-cloud-development.mjs && next build' })
if (project.data.name !== config.name || project.data.accountId !== config.vercelTeamId || config.protectedVercelProjectIds.includes(project.data.id)) throw new Error('Destino Vercel no permitido')
const projectId = project.data.id
const domains = await api(`/v9/projects/${projectId}/domains`)
const hostname = domains.data.domains?.find(domain => domain.name.endsWith('.vercel.app'))?.name
if (!hostname) throw new Error('Falta dominio de desarrollo asignado por Vercel')
const appUrl = `https://${hostname}`
const keyResponse = JSON.parse(fs.readFileSync(path.join(root, '.env.cloud-api-keys.local'), 'utf8').replace(/^\uFEFF/, ''))
const keys = Array.isArray(keyResponse) ? keyResponse : keyResponse.keys ?? keyResponse.api_keys
const publicKey = keys?.find(key => key.type === 'publishable' && key.api_key?.startsWith('sb_publishable_')) ?? keys?.find(key => key.name === 'anon')
const secretKey = keys?.find(key => key.type === 'secret' && key.api_key?.startsWith('sb_secret_')) ?? keys?.find(key => key.name === 'service_role')
if (!publicKey?.api_key || !secretKey?.api_key) throw new Error('Faltan claves del proyecto de desarrollo')
const envFile = path.join(root, '.env.cloud-development.local')
let previous = {}
if (fs.existsSync(envFile)) previous = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(line => /^[A-Z_0-9]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
const env = {
  TORNEOS_ENV: 'cloud-development', DEVELOPMENT_SUPABASE_PROJECT_REF: config.supabaseProjectRef,
  NEXT_PUBLIC_SUPABASE_URL: `https://${config.supabaseProjectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey.api_key, SUPABASE_SECRET_KEY: secretKey.api_key,
  APP_URL: appUrl, NEXT_PUBLIC_SITE_URL: appUrl, FLOW_API_BASE: 'https://sandbox.flow.cl/api',
  FLOW_API_KEY: previous.FLOW_API_KEY ?? '', FLOW_API_SECRET: previous.FLOW_API_SECRET ?? '',
  RESEND_API_KEY: '', NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CRON_SECRET: previous.CRON_SECRET ?? randomBytes(32).toString('hex'),
}
const summary = validateCloudDevelopment(env, config)
const keyCheck = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` }, signal: AbortSignal.timeout(20000) })
if (!keyCheck.ok) throw new Error('La clave de servidor no autentica en Supabase de desarrollo')
fs.writeFileSync(envFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
await api(`/v10/projects/${projectId}/env?upsert=true`, 'POST', Object.entries(env).map(([key, value]) => ({ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] })))
const cloudDir = path.join(root, 'artifacts/cloud-development')
fs.mkdirSync(path.join(cloudDir, 'supabase-config/supabase'), { recursive: true })
fs.writeFileSync(path.join(cloudDir, 'supabase-config/supabase/config.toml'), `project_id = "torneos-dev"\n[auth]\nsite_url = "${appUrl}"\nadditional_redirect_urls = ["${appUrl}/**"]\n[auth.email]\nenable_confirmations = true\n`)
fs.writeFileSync(path.join(cloudDir, 'resources.json'), JSON.stringify({ ...summary, vercelProjectId: projectId, vercelTeamId: config.vercelTeamId, vercelScope: config.vercelScope, protectedProductionProjectId: config.protectedVercelProjectIds[0] }, null, 2) + '\n')
const latest = path.join(cloudDir, 'latest-package.json')
if (fs.existsSync(latest)) {
  const { packageDirectory } = JSON.parse(fs.readFileSync(latest, 'utf8'))
  fs.mkdirSync(path.join(packageDirectory, '.vercel'), { recursive: true })
  fs.writeFileSync(path.join(packageDirectory, '.vercel/project.json'), JSON.stringify({ projectId, orgId: config.vercelTeamId, projectName: config.name }, null, 2) + '\n')
}
console.log(JSON.stringify({ ...summary, vercelProjectId: projectId, envFile }))
