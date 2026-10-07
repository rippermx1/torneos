// Read-only release checks against the already completed, owned development fixture.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { createServerClient } from '@supabase/ssr'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

const root = path.resolve('artifacts/2048-gap-closure')
const candidate = process.argv.includes('--candidate')
const config = JSON.parse(fs.readFileSync('config/cloud-development.json', 'utf8'))
const env = parseEnv(fs.readFileSync('.env.cloud-development.local', 'utf8'))
validateCloudDevelopment(env, config)
assert.equal(config.supabaseProjectRef, 'jnoyjewsqbooqaiighcs')
assert.equal(env.APP_URL, 'https://torneos-dev.vercel.app')
const record = JSON.parse(fs.readFileSync(path.join(root, 'deployment-candidate.private.json'), 'utf8').replace(/^\uFEFF/, ''))
const identity = record.deployment ?? record
const auth = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'com.vercel.cli/Data/auth.json'), 'utf8'))
const response = await fetch(`https://api.vercel.com/v13/deployments/${identity.id}?teamId=${config.vercelTeamId}`, {
  headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(30000),
})
assert.equal(response.status, 200)
const deployment = await response.json()
assert.equal(deployment.projectId, 'prj_QHiZYuYkztFToMGmwhPsyOx9nVdG')
assert.equal(deployment.readyState, 'READY')
const origin = candidate ? `https://${deployment.url}` : env.APP_URL
if (!candidate) {
  const aliasResponse = await fetch(`https://api.vercel.com/v4/aliases/${new URL(origin).hostname}?teamId=${config.vercelTeamId}`, {
    headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(30000),
  })
  assert.equal(aliasResponse.status, 200)
  assert.equal((await aliasResponse.json()).deployment.id, deployment.id)
}
const pack = JSON.parse(fs.readFileSync('artifacts/games-development/latest-package.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync(pack.manifest, 'utf8'))
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'cloud-fixture.private.json'), 'utf8'))
assert.equal(fixture.status, 'PASS')
let cli, number = 0
if (candidate) {
  const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx')
  for (const folder of fs.readdirSync(cache)) {
    const file = path.join(cache, folder, 'node_modules/vercel/package.json')
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).version === '62.2.0') {
      cli = path.join(path.dirname(file), 'dist/vc.js'); break
    }
  }
  assert.ok(cli)
}
async function request(route, headers = {}) {
  if (candidate) {
    const prefix = path.join(root, `release-request-${++number}`)
    const bodyFile = prefix + '.body.private', headerFile = prefix + '.headers.private'
    const args = [cli, 'curl', route, '--deployment', origin, '--', '--silent', '--show-error', '--max-time', '60',
      '--output', bodyFile, '--dump-header', headerFile, '--header', 'Accept-Encoding: identity']
    for (const [key, value] of Object.entries(headers)) args.push('--header', `${key}: ${value}`)
    try {
      execFileSync(process.execPath, args, { cwd: path.join(root, 'package'), timeout: 90000, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'] })
      const raw = fs.readFileSync(headerFile, 'utf8').trim().split(/\r?\n\r?\n/).at(-1).split(/\r?\n/)
      const status = Number(raw.shift().match(/\s(\d{3})/)?.[1])
      const resultHeaders = Object.fromEntries(raw.filter(line => line.includes(':')).map(line => {
        const at = line.indexOf(':'); return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
      }))
      return { status, headers: resultHeaders, bytes: fs.readFileSync(bodyFile) }
    } catch { throw new Error(`Protected candidate request failed: ${route}`) }
    finally { for (const file of [bodyFile, headerFile]) if (fs.existsSync(file)) fs.unlinkSync(file) }
  }
  return new Promise((resolve, reject) => {
    const req = https.get(origin + route, { headers: { 'Accept-Encoding': 'identity', ...headers }, timeout: 60000 }, r => {
      const bytes = []; r.on('data', part => bytes.push(part)); r.on('error', reject)
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, bytes: Buffer.concat(bytes) }))
    })
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Request timeout')))
  })
}
const report = { at: new Date().toISOString(), origin, deploymentId: deployment.id, candidate, checks: [],
  writes: 'NONE; OWN AUTH SESSION ONLY', previousDeployment: 'dpl_DXTdRYRTgfUaCrkh6Y4rtu3c1TFM' }
const passed = check => { report.checks.push(check); console.log(`PASS ${check.route ?? check.name}`) }
for (const route of ['/sign-in', '/play', '/play/catalog', '/play/factory-empire']) {
  const r = await request(route); assert.equal(r.status, 200)
  assert.ok(r.bytes.toString().includes('Ambiente de desarrollo'))
  assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow')
  passed({ route, status: 200, development: true })
}
for (const file of manifest.files.filter(entry => entry.path.startsWith('public/games/'))) {
  const route = '/' + file.path.slice(7), r = await request(route)
  assert.equal(r.status, 200, route)
  assert.equal(createHash('sha256').update(r.bytes).digest('hex'), file.sha256, route)
  if (route.endsWith('.gz')) assert.equal(r.headers['content-encoding'], 'gzip')
  passed({ route, sha256: file.sha256 })
}
const rankingRoute = `/api/tournaments/${fixture.id}/leaderboard`
const unauthorized = await request(rankingRoute)
assert.ok([401, 307].includes(unauthorized.status))
if (unauthorized.status === 307) assert.equal(new URL(unauthorized.headers.location, origin).pathname, '/sign-in')
passed({ name: 'Unauthenticated ranking denied', status: unauthorized.status })
const jar = new Map()
const player = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)) } })
try {
  const signed = await player.auth.signInWithPassword({ email: fixture.email, password: fixture.password })
  assert.equal(signed.error, null); assert.equal(signed.data.user.id, fixture.userId)
  const headers = { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }
  const ranking = await request(rankingRoute, headers), json = JSON.parse(ranking.bytes)
  assert.equal(ranking.status, 200); assert.match(ranking.headers['cache-control'], /no-store/)
  assert.equal(json.phase, 'official')
  assert.equal(json.rows.length, 1); assert.equal(json.rows[0].isMe, true)
  assert.equal(json.rows[0].name, `g2048_${fixture.id.slice(0, 8)}`)
  assert.equal(json.rows[0].score, 0); assert.equal(json.rows[0].prizeCents, 100)
  passed({ route: rankingRoute, official: true, noStore: true, score: 0 })
  const page = await request(`/tournaments/${fixture.id}/play`, headers)
  assert.equal(page.status, 200); assert.ok(page.bytes.toString().includes(`2048 prueba técnica ${fixture.id.slice(0, 8)}`))
  passed({ name: 'Authenticated closed-game page is available for the verified fixture' })
} finally { await player.auth.signOut({ scope: 'local' }) }
report.status = 'PASS'
fs.writeFileSync(path.join(root, candidate ? 'candidate-verification.json' : 'published-verification.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, origin, deploymentId: deployment.id, checks: report.checks.length }))
