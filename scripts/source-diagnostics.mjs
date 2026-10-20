// Read-only source/runtime inventory. Never read dotenv, Docker inspect, cookies, users or database rows.
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { hash, validationEnvironment } from './source-validation-core.mjs'

export function portAvailability(port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const finish = status => { socket.destroy(); resolve({ port, status }) }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish('ACCEPTS_TCP'))
    socket.once('error', () => finish('UNAVAILABLE'))
    socket.once('timeout', () => finish('TIMEOUT'))
  })
}
export async function diagnostics(root, local = false) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  const report = { task: 'WEB-16.1', at: new Date().toISOString(), commit: git(['rev-parse', 'HEAD']), node: process.version,
    platform: process.platform, workingTreeDirty: !!git(['status', '--porcelain']), dependencies: {}, games: [],
    integration: { auth: 'NOT_RUN', database: 'NOT_RUN', flow: 'NOT_RUN', restore: 'NOT_RUN', unityRuntime: 'NOT_RUN' } }
  report.lockSha256 = hash(await fs.readFile(path.join(root, 'package-lock.json')))
  for (const dependency of ['next', 'react', 'vitest', 'typescript', 'eslint']) {
    try { report.dependencies[dependency] = JSON.parse(await fs.readFile(path.join(root, 'node_modules', dependency, 'package.json'), 'utf8')).version }
    catch { report.dependencies[dependency] = 'NOT_INSTALLED' }
  }
  const builds = JSON.parse(await fs.readFile(path.join(root, 'lib/game/runtime-builds.json'), 'utf8'))
  for (const [game, build] of Object.entries(builds)) {
    if (![game, build].every(value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value))) throw new Error('Invalid runtime identifier')
    let entry = 'ABSENT'
    try { if ((await fs.stat(path.join(root, 'public/games', game, build, 'index.html'))).isFile()) entry = 'PRESENT' } catch { /* Missing local bundles are expected on source-only CI. */ }
    report.games.push({ game, build, entry, integrity: 'NOT_RUN' })
  }
  if (local) {
    report.localPorts = await Promise.all([3081, 54321, 54324].map(port => portAvailability(port)))
    const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', windowsHide: true, timeout: 3000, env: validationEnvironment() })
    report.docker = docker.status === 0 && /^\d+\.\d+\.\d+/.test(docker.stdout?.trim()) ? 'RESPONDS' : 'UNAVAILABLE_OR_TIMEOUT'
    report.localScope = 'Loopback TCP and Docker version only; does not establish service identity or healthy Auth/data'
  }
  return report
}
export async function writeDiagnostic(root, file, report) {
  const artifacts = path.join(await fs.realpath(root), 'artifacts'), output = path.resolve(root, file)
  const relative = path.relative(artifacts, output)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Diagnostic output must be inside artifacts')
  // Reports use an existing, verified artifact directory and never overwrite an earlier diagnosis.
  await fs.mkdir(artifacts, { recursive: true })
  if (await fs.realpath(artifacts) !== artifacts || await fs.realpath(path.dirname(output)) !== path.dirname(output)) throw new Error('Symlinked diagnostic output')
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2)
  const index = args.indexOf('--output')
  if (index < 0 || !args[index + 1] || args.some((value, i) => !['--local', '--output'].includes(value) && i !== index + 1)) throw new Error('Usage: node scripts/source-diagnostics.mjs --output artifacts/NEW_FILE.json [--local]')
  const report = await diagnostics(root, args.includes('--local'))
  await writeDiagnostic(root, args[index + 1], report)
  console.log('Read-only diagnostic saved; Auth/DB/Flow/restore remain NOT_RUN')
}
