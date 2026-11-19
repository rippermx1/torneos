// Compile only the owned end-of-game UI delta over the accepted operative context.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { localEnv, docker, sha256 } from './2048-integrity-local.mjs'

const files = [
  'components/game/unity-2048.tsx', 'components/game/unity-2048.module.css',
  'components/game/2048-game-result.tsx', 'lib/game/unity-2048-session.ts',
  'lib/game/2048-results.ts', 'lib/tournament/leaderboard.ts',
  'app/api/tournaments/[id]/leaderboard/route.ts',
  'app/(public)/tournaments/[id]/leaderboard/page.tsx',
  'app/(public)/tournaments/[id]/play/page.tsx',
]
async function main() {
  await localEnv()
  const dir = 'artifacts/2048-result'
  await fs.mkdir(dir, { recursive: true })
  const accepted = JSON.parse(await fs.readFile('artifacts/2048-integrity-integration/candidate.json', 'utf8'))
  assert.equal(accepted.deployedTo3081, true)
  const baseline = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
  assert.equal(baseline.Image, accepted.imageId); assert.equal(baseline.State.Health.Status, 'healthy')
  const runtime = Object.fromEntries(baseline.Config.Env.map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]))
  assert.equal(runtime.TORNEOS_LOCAL_MODE, '1')
  const context = path.resolve(dir, `context-${randomUUID()}`), patches = {}
  await fs.cp(accepted.context, context, { recursive: true })
  for (const file of files) {
    const bytes = await fs.readFile(file)
    patches[file] = sha256(bytes)
    const destination = path.join(context, file)
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, bytes)
  }
  const baseTag = `torneos-app:g2048-result-base-${baseline.Image.slice(7, 23)}`
  docker(['image', 'tag', baseline.Image, baseTag])
  const dockerfile = path.join(context, 'Dockerfile')
  await fs.writeFile(dockerfile, (await fs.readFile(dockerfile, 'utf8')).replace(/^FROM .+ AS operative/m, `FROM ${baseTag} AS operative`))
  const registry = JSON.parse(await fs.readFile(path.join(context, 'lib/game/runtime-builds.json'), 'utf8'))
  const image = `torneos-app:g2048-result-candidate-${Date.now()}`
  const args = ['build', '--tag', image]
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED']) if (runtime[key]) args.push('--build-arg', `${key}=${runtime[key]}`)
  args.push(context)
  const log = await fs.open(`${dir}/build.private.log`, 'w')
  let code
  try {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
    code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  } finally { await log.close() }
  assert.equal(code, 0, 'Candidate build failed; inspect the ignored local log')
  const report = { at: new Date().toISOString(), status: 'PASS_CANDIDATE_BUILD', sourceManifestStatus: 'PASS',
    image, imageId: docker(['image', 'inspect', image, '--format', '{{.Id}}']), baseline: baseline.Image,
    context, patches, registry, activated: false, deployedTo3081: false, schemaChanged: false, unityChanged: false }
  await fs.writeFile(`${dir}/candidate.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, image, imageId: report.imageId, activated: false }))
}
await main().catch(() => { console.error('Result candidate failed; inspect the identified local artifacts. Nothing activated.'); process.exitCode = 1 })
