// Build the owned 09.2/09.3 delta and E23 host on the accepted context/runtime.
// Baseline mismatch is a real stop: never replace simultaneous game work blindly.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { localEnv, docker, sha256, migrationSources } from './2048-integrity-local.mjs'

const files = [
  'app/(public)/tournaments/[id]/audit/page.tsx', 'app/(public)/tournaments/[id]/leaderboard/page.tsx',
  'app/api/tournaments/[id]/game/start/route.ts', 'app/api/tournaments/[id]/game/move/route.ts',
  'app/api/tournaments/[id]/game/timeout/route.ts', 'lib/security/rate-limit.ts', 'lib/tournament/game-request.ts',
  'lib/tournament/helpers.ts', 'lib/anticheat/integrity.ts', 'lib/anticheat/detector.ts', 'lib/anticheat/winner-review.ts',
  'lib/tournament/lifecycle.ts', 'app/api/admin/users/[id]/ban/route.ts',
  'app/api/admin/tournaments/[id]/integrity/route.ts', 'app/api/admin/tournaments/[id]/finalize/route.ts',
  'app/(admin)/admin/tournaments/[id]/games/page.tsx', 'app/(admin)/admin/tournaments/[id]/games/[gameId]/page.tsx',
  'components/tournament/integrity-reviews.tsx',
  'components/game/unity-2048.tsx', 'components/game/unity-2048.module.css',
]
const dir = 'artifacts/2048-integrity-integration'
const report = { task: 'G2048-09.4', at: new Date().toISOString(), patches: {}, status: 'NOT_RUN', activated: false }
try {
  await localEnv(); await migrationSources()
  const hostEvidence = JSON.parse(await fs.readFile('docs/2048-FIRST-MOVE-EVIDENCE.json', 'utf8'))
  assert.equal(hostEvidence.task, 'G2048-07.2.1')
  // Compare owned patches with the reviewed commit or explicit E23 source hashes.
  for (const file of files) {
    const bytes = await fs.readFile(file)
    if (file.startsWith('components/game/unity-2048')) {
      assert.equal(sha256(bytes.toString('utf8').replaceAll('\r\n', '\n')), hostEvidence.sources[file],
        `Re-audit changed E23 host: ${file}`)
    } else {
      const committed = execFileSync('git', ['show', `79f5e89:${file}`], { windowsHide: true })
      assert.equal(bytes.toString('utf8').replaceAll('\r\n', '\n'), committed.toString('utf8').replaceAll('\r\n', '\n'),
        `Re-audit changed owned source: ${file}`)
    }
    report.patches[file] = sha256(bytes)
  }
  report.sourceManifestStatus = 'PASS'
  if (!process.argv.includes('--build')) {
    report.status = 'PASS_SOURCE_MANIFEST_ONLY'
  } else {
    const at = process.argv.indexOf('--accepted-artifact')
    const acceptedFile = at < 0 ? 'artifacts/2048-unity-entry/candidate.json' : process.argv[at + 1]
    const accepted = JSON.parse(await fs.readFile(acceptedFile, 'utf8'))
    assert.equal(accepted.deployedTo3081, true)
    const instance = JSON.parse(docker(['inspect', 'torneos-app-1'], undefined, 5000))[0]
    assert.equal(instance.State.Health.Status, 'healthy')
    assert.equal(instance.Image, accepted.imageId, 'Operative image differs: select its verified accepted source manifest')
    const runtime = Object.fromEntries(instance.Config.Env.map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]))
    assert.equal(runtime.TORNEOS_LOCAL_MODE, '1')
    assert.equal(runtime.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321')
    const context = path.resolve(dir, `context-${randomUUID()}`)
    await fs.cp(accepted.context, context, { recursive: true })
    for (const file of files) {
      const destination = path.join(context, file)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(file, destination)
    }
    const dockerfile = path.join(context, 'Dockerfile')
    const original = await fs.readFile(dockerfile, 'utf8')
    assert.match(original, /^FROM .+ AS operative/m)
    await fs.writeFile(dockerfile, original.replace(/^FROM .+ AS operative/m, `FROM ${instance.Image} AS operative`))
    const registry = JSON.parse(await fs.readFile(path.join(context, 'lib/game/runtime-builds.json'), 'utf8'))
    const image = `torneos-app:g2048-094-candidate-${Date.now()}`
    const args = ['build', '--tag', image, '--build-arg', `TORNEOS_SNAKE_BUILD=${registry['snake-arena']}`]
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED']) if (runtime[key]) args.push('--build-arg', `${key}=${runtime[key]}`)
    args.push(context)
    const log = await fs.open(`${dir}/candidate-build.private.log`, 'w')
    let code
    try {
      const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
      code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    } finally { await log.close() }
    assert.equal(code, 0, 'Candidate build failed; inspect ignored local log')
    report.status = 'PASS_CANDIDATE_BUILD'
    report.image = image; report.imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}'])
    report.baseline = instance.Image; report.context = context; report.registry = registry
    report.deployedTo3081 = false
  }
} catch {
  report.status = 'NOT_COMPLETED'
  report.blocker = 'Local runtime unavailable, accepted baseline differs, or source/build check failed; nothing activated'
  process.exitCode = 1
}
await fs.mkdir(dir, { recursive: true })
await fs.writeFile(`${dir}/candidate.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
