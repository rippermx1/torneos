import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { parseEnv } from 'node:util'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServerClient } from '@supabase/ssr'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

const pack = JSON.parse(fs.readFileSync('artifacts/games-development/latest-package.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync(pack.manifest, 'utf8'))
const config = JSON.parse(fs.readFileSync('config/cloud-development.json', 'utf8'))
const env = parseEnv(fs.readFileSync(path.join(pack.directory, '.env.vercel-production.local'), 'utf8'))
validateCloudDevelopment(env, config)
const record = JSON.parse(fs.readFileSync(path.join(pack.directory, 'deployment.json'), 'utf8').replace(/^\uFEFF/, ''))
const cliDeployment = record.deployment ?? record
const vercelAuth = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'com.vercel.cli/Data/auth.json'), 'utf8'))
const deploymentResponse = await fetch(`https://api.vercel.com/v13/deployments/${cliDeployment.id}?teamId=${config.vercelTeamId}`, { headers: { Authorization: `Bearer ${vercelAuth.token}` }, signal: AbortSignal.timeout(30000) })
assert.equal(deploymentResponse.status, 200)
const deployment = await deploymentResponse.json()
const candidate = process.argv.includes('--candidate')
const origin = candidate ? (deployment.url.startsWith('https://') ? deployment.url : `https://${deployment.url}`) : env.APP_URL
assert.equal(deployment.projectId, JSON.parse(fs.readFileSync(path.join(pack.packageDirectory, '.vercel/project.json'), 'utf8')).projectId)
assert.equal(deployment.readyState ?? deployment.status, 'READY')
const report = { at: new Date().toISOString(), origin, deploymentId: deployment.id, candidate, games: manifest.games, checks: [], writes: 'NONE; AUTH_SESSIONS_ONLY' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
let cli
if (candidate) {
  const caches = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx')
  for (const folder of fs.readdirSync(caches)) {
    const file = path.join(caches, folder, 'node_modules/vercel/package.json')
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).version === '62.2.0') { cli = path.join(path.dirname(file), 'dist/vc.js'); break }
  }
  assert.ok(cli, 'Run the pinned Vercel CLI once first')
}
let requestNumber = 0
async function request(route, { headers = {}, method = 'GET', body } = {}) {
  if (candidate) {
    const prefix = path.join(pack.directory, `candidate-request-${++requestNumber}`)
    const bodyFile = prefix + '.body.private', headerFile = prefix + '.headers.private'
    const args = [cli, 'curl', route, '--deployment', origin, '--', '--silent', '--show-error', '--max-time', '60', '--output', bodyFile, '--dump-header', headerFile, '--request', method]
    for (const [key, value] of Object.entries(headers)) args.push('--header', `${key}: ${value}`)
    if (body !== undefined) args.push('--data-raw', JSON.stringify(body))
    execFileSync(process.execPath, args, { cwd: pack.packageDirectory, encoding: 'utf8', windowsHide: true, timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] })
    const raw = fs.readFileSync(headerFile, 'utf8').trim().split(/\r?\n\r?\n/).at(-1).split(/\r?\n/)
    const status = Number(raw.shift().match(/\s(\d{3})/)?.[1])
    const resultHeaders = Object.fromEntries(raw.filter(line => line.includes(':')).map(line => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]))
    const bytes = fs.readFileSync(bodyFile)
    fs.unlinkSync(headerFile); fs.unlinkSync(bodyFile)
    return { status, headers: resultHeaders, bytes }
  }
  return new Promise((resolve, reject) => {
    const req = https.request(origin + route, { method, headers: { 'Accept-Encoding': 'identity', ...headers }, timeout: 60000 }, response => {
      const bytes = []; response.on('data', part => bytes.push(part)); response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(bytes) }))
    })
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Request timeout')))
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
function passed(check) { report.checks.push(check); console.log(`PASS ${check.route ?? check.name}`) }
const htmlPages = []
for (const route of ['/sign-in', '/tournaments', '/play/catalog', '/play'] ) {
  const r = await request(route), html = r.bytes.toString('utf8')
  assert.equal(r.status, 200, route); assert.ok(html.includes('Ambiente de desarrollo'), route)
  assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow')
  if (route === '/tournaments') assert.ok(!html.includes('Ver reglas y participar →'))
  htmlPages.push(html)
  passed({ route, status: r.status, noindex: true })
}
for (const file of manifest.files.filter(f => f.path.startsWith('public/games/'))) {
  const route = '/' + file.path.slice(7), r = await request(route)
  assert.equal(r.status, 200, route); assert.equal(hash(r.bytes), file.sha256, route)
  if (route.endsWith('.gz')) assert.equal(r.headers['content-encoding'], 'gzip', route)
  if (route.endsWith('.wasm.gz')) assert.match(r.headers['content-type'], /application\/wasm/)
  if (route.endsWith('.js.gz')) assert.match(r.headers['content-type'], /javascript/)
  if (route.endsWith('index.html')) assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN')
  passed({ route, status: r.status, sha256: file.sha256, bytes: r.bytes.length })
}
for (const game of ['alien-run', 'snake-arena', 'factory-empire', 'rts-duel']) {
  const missing = await request('/play/' + game)
  assert.equal(missing.status, 404); passed({ name: 'Retired game route: ' + game, status: 404 })
}
const unauthorized = await request('/api/cron/process-tournaments')
assert.equal(unauthorized.status, 401); passed({ route: '/api/cron/process-tournaments', unauthorized: 401 })
const credentials = parseEnv(fs.readFileSync('.env.cloud-test-users.local', 'utf8'))
const jar = new Map()
const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: entries => entries.forEach(({ name, value }) => jar.set(name, value)) } })
try {
  const { data, error } = await auth.auth.signInWithPassword({ email: credentials.PLAYER_EMAIL, password: credentials.SUPABASE_E2E_PASSWORD })
  assert.equal(error, null); assert.ok(data.user?.email_confirmed_at)
  const headers = { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), Origin: env.APP_URL }
  const privateApi = await request('/api/admin/accounting', { headers })
  assert.equal(privateApi.status, 403); passed({ route: '/api/admin/accounting', playerDenied: 403 })
} finally { await auth.auth.signOut({ scope: 'local' }) }
const secrets = [env.SUPABASE_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.CRON_SECRET, ...config.protectedSupabaseProjectRefs].filter(Boolean)
const chunks = new Set(htmlPages.flatMap(html => [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"\s]+\.js)"/g)].map(match => match[1])))
for (const route of chunks) {
  const r = await request(route); assert.equal(r.status, 200, route)
  const js = r.bytes.toString('utf8'); assert.ok(!secrets.some(secret => js.includes(secret)), `Server secret in ${route}`)
}
assert.ok(!htmlPages.some(html => secrets.some(secret => html.includes(secret))))
passed({ name: 'HTML and browser chunks contain no server secrets or production Supabase ref', chunks: chunks.size })
report.status = 'PASS'; report.passed = report.checks.length
fs.writeFileSync(path.join(pack.directory, candidate ? 'candidate-verification.json' : 'published-verification.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, origin, passed: report.passed, chunks: chunks.size }))
