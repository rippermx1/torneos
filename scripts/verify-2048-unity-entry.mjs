// HTTP/access checks against the preview or approved operative image, using owned local fixtures.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

assert.ok(process.argv.length === 2 || process.argv[2] === '--integrated', 'Use --integrated to verify the approved image on 3081')
const integrated = process.argv[2] === '--integrated'
const base = 'http://127.0.0.1:' + (integrated ? '3081' : '3082'), dir = 'artifacts/2048-unity-entry/'
const env = Object.fromEntries((await fs.readFile('.env.local-stack', 'utf8')).split(/\r?\n/)
  .filter(line => /^[A-Z_0-9]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
assert.equal(env.TORNEOS_LOCAL_MODE, '1')
assert.equal(env.CONFIRM_SUPABASE_PROJECT_REF, 'local')
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321')
const manifest = JSON.parse(await fs.readFile('artifacts/2048-competitive/manifest.json', 'utf8'))
const credentials = JSON.parse(await fs.readFile('artifacts/2048-competitive/credentials.private.json', 'utf8'))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const candidate = JSON.parse(await fs.readFile(dir + 'candidate.json', 'utf8'))
const live = () => JSON.parse(execFileSync('docker', ['inspect', 'torneos-app-1'], { encoding: 'utf8', windowsHide: true }))[0]
const baseline = live()
assert.equal(baseline.Image, integrated ? candidate.imageId : candidate.baseline)
if (integrated) assert.equal(candidate.deployedTo3081, true)
const checks = [], record = name => checks.push({ name, status: 'PASS' })
async function sign(account) {
  const jar = new Map(), client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => cookies.forEach(cookie => jar.set(cookie.name, cookie.value)) },
  })
  const signed = await client.auth.signInWithPassword({ email: account.email, password: account.password })
  if (signed.error) throw signed.error
  assert.equal(signed.data.user.id, account.id)
  return [...jar].map(([name, value]) => name + '=' + value).join('; ')
}
async function get(path, cookie = '') {
  const response = await fetch(base + path, { redirect: 'manual', headers: { cookie }, signal: AbortSignal.timeout(15000) })
  return { status: response.status, location: response.headers.get('location'), html: await response.text() }
}
function redirectTo(response, destination) {
  // Next streams a meta refresh when a Server Component redirects after its shell.
  let location = response.location
  if (response.status === 200) {
    location = response.html.match(/<meta id="__next-page-redirect" http-equiv="refresh" content="[01];url=([^"]+)"/)?.[1]?.replaceAll('&amp;', '&')
    assert.ok(location, 'A streamed response must contain the actual redirect marker')
  } else assert.equal(response.status, 307)
  assert.equal(new URL(location, base).pathname + new URL(location, base).search, destination)
}
const fixture = manifest.tournaments.fixedJourney, tournament = '/tournaments/' + fixture.id
assert.equal(fixture.owner, 1)
const owner = await sign(credentials[fixture.owner]), stranger = await sign(credentials[0])
const games = async () => {
  const result = await admin.from('games').select('id,user_id,final_score,status,move_count,current_board').eq('tournament_id', fixture.id).order('id')
  if (result.error) throw result.error
  return result.data
}
const before = await games()
redirectTo(await get(tournament + '/play'), '/sign-in'); record('canonical tournament entry requires authentication')
const owned = await get(tournament + '/play', owner)
assert.equal(owned.status, 200); assert.match(owned.html, /title="2048 · Unity"/); record('owned completed game mounts Unity at the canonical entry')
const denied = await get(tournament + '/play', stranger)
assert.equal(denied.status, 200); assert.match(denied.html, /No estás inscrito/); assert.doesNotMatch(denied.html, /title="2048 · Unity"/); record('unregistered user cannot mount the competitive client')
redirectTo(await get(tournament + '/play/unity', owner), tournament + '/play'); record('competitive Unity bookmark redirects to the same tournament')
const practice = await get('/play')
assert.equal(practice.status, 200); assert.match(practice.html, /title="2048 · Unity"/); assert.doesNotMatch(practice.html, /Abrir versión ligera/); record('practice only offers Unity')
for (const alias of ['/play/web', '/play/unity']) {
  redirectTo(await get(alias), '/play'); record(alias + ' redirects to Unity practice')
  const target = '/play?' + new URLSearchParams({ next: tournament })
  redirectTo(await get(alias + '?' + new URLSearchParams({ next: tournament })), target); record(alias + ' preserves the safe tournament return')
  redirectTo(await get(alias + '?next=https%3A%2F%2Fforeign.test'), '/play'); record(alias + ' rejects an external return destination')
}
const asset = await get('/games/2048/unity-2048-007/index.html')
assert.equal(asset.status, 200); record('accepted Unity capsule remains available')
assert.deepEqual(await games(), before); record('page loads and aliases do not create or alter competitive games')
const after = live()
assert.equal(after.Id, baseline.Id); assert.equal(after.Image, baseline.Image); assert.equal(after.State.Health.Status, 'healthy'); record('operative app remains unchanged and healthy')
const result = { task: 'G2048-10.1', at: new Date().toISOString(), base, image: candidate.image, checks, ownedGame: before.find(game => game.user_id === credentials[fixture.owner].id), deployedTo3081: integrated }
await fs.writeFile(dir + (integrated ? 'http-integrated-checks.json' : 'http-checks.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ task: result.task, base, checks: checks.length, status: 'PASS', ownedGameId: result.ownedGame.id, finalScore: result.ownedGame.final_score }))
