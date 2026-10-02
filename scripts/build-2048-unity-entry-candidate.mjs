// Scoped candidate only: preserve the accepted runtime and simultaneous game WIP.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const dir = 'artifacts/2048-unity-entry/', context = path.resolve(dir, 'context')
const accepted = JSON.parse(await fs.readFile('artifacts/2048-competitive/candidate.json', 'utf8'))
const inspect = JSON.parse(execFileSync('docker', ['inspect', 'torneos-app-1'], { encoding: 'utf8', windowsHide: true }))[0]
assert.equal(inspect.State.Health.Status, 'healthy')
assert.equal(inspect.Image, accepted.imageId, 'Re-audit the operative runtime before building another candidate')
assert.equal(accepted.deployedTo3081, true)
await fs.mkdir(dir, { recursive: true })
await fs.cp(accepted.context, context, { recursive: true })
const patches = {}
for (const file of [
  'app/(public)/tournaments/[id]/play/page.tsx',
  'app/(public)/tournaments/[id]/play/unity/page.tsx',
  'app/(public)/play/web/page.tsx',
  'app/(public)/play/unity/page.tsx',
]) {
  const bytes = await fs.readFile(file)
  await fs.writeFile(path.join(context, file), bytes)
  patches[file] = createHash('sha256').update(bytes).digest('hex')
}
// The shared catalog has other game WIP. Apply only the 2048 link removal to the frozen copy.
const catalog = 'app/(public)/play/page.tsx'
let source = await fs.readFile(path.join(context, catalog), 'utf8')
assert.match(source, /Abrir versión ligera/)
source = source.replace('getTournamentReturnPath, withAuthDestination', 'getTournamentReturnPath')
  .replace(/^.*Abrir versión ligera.*\r?\n/m, '')
await fs.writeFile(path.join(context, catalog), source)
patches[catalog] = createHash('sha256').update(source).digest('hex')
const dockerfile = path.join(context, 'Dockerfile')
await fs.writeFile(dockerfile, (await fs.readFile(dockerfile, 'utf8')).replace(/^FROM .+ AS operative/m, `FROM ${inspect.Config.Image} AS operative`))
const env = Object.fromEntries(inspect.Config.Env.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]))
const registry = JSON.parse(await fs.readFile(path.join(context, 'lib/game/runtime-builds.json'), 'utf8'))
const image = 'torneos-app:g2048-101-candidate-' + Date.now()
const args = ['build', '--tag', image, '--build-arg', 'TORNEOS_SNAKE_BUILD=' + registry['snake-arena']]
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED']) {
  if (env[key]) args.push('--build-arg', key + '=' + env[key])
}
args.push(context)
const log = await fs.open(dir + 'candidate-build.log', 'w')
const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
const code = await new Promise(resolve => child.on('exit', resolve))
await log.close()
assert.equal(code, 0, 'Inspect the ignored candidate build log')
const imageId = execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim()
const result = { task: 'G2048-10.1', image, imageId, baseline: inspect.Image, context, patches, registry, at: new Date().toISOString(), deployedTo3081: false, databaseChanged: false }
await fs.writeFile(dir + 'candidate.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
