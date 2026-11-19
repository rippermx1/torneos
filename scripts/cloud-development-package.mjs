import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)

// Capture the shared checkout without changing its environment or project links.
export function packageCloudDevelopment(sourceRoot, { artifactName = 'cloud-development' } = {}) {
  if (!identifier(artifactName)) throw new Error('Nombre de artefacto inválido')
  const config = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'config/cloud-development.json'), 'utf8'))
  const registry = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'lib/game/runtime-builds.json'), 'utf8'))
  if (config.name !== 'torneos-dev' || config.protectedSupabaseProjectRefs.includes(config.supabaseProjectRef)) throw new Error('Destino de desarrollo inválido')
  if (!Array.isArray(config.publishedGames) || new Set(config.publishedGames).size !== config.publishedGames.length) throw new Error('Juegos duplicados o inválidos')
  for (const game of config.publishedGames) {
    if (!identifier(game) || !identifier(registry[game]) || Object.hasOwn(config.excludedGames, game) || game !== '2048') throw new Error(`Juego no publicable: ${game}`)
  }
  const directory = path.join(sourceRoot, 'artifacts', artifactName, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`)
  const target = path.join(directory, 'package')
  fs.mkdirSync(target, { recursive: true })
  const files = new Map()
  function write(relative, bytes, sourceSha256) {
    const destination = path.resolve(target, relative)
    if (!destination.startsWith(target + path.sep)) throw new Error(`Ruta fuera del paquete: ${relative}`)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, bytes)
    files.set(relative.replaceAll('\\', '/'), { path: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes), ...(sourceSha256 ? { sourceSha256 } : {}) })
  }
  function copy(relative) {
    if (/(^|[\\/])(?:\.env[^\\/]*|node_modules|LocalArt|KayKit[^\\/]*|\.git|Library)(?:[\\/]|$)/i.test(relative)) throw new Error(`Archivo no publicable: ${relative}`)
    const source = path.resolve(sourceRoot, relative)
    if (!source.startsWith(path.resolve(sourceRoot) + path.sep)) throw new Error('Ruta fuera del origen')
    const stat = fs.lstatSync(source)
    if (stat.isSymbolicLink()) throw new Error(`Enlace no permitido: ${relative}`)
    if (stat.isDirectory()) { for (const name of fs.readdirSync(source).sort()) copy(path.join(relative, name)); return }
    if (!stat.isFile()) throw new Error(`Archivo inválido: ${relative}`)
    const bytes = fs.readFileSync(source)
    write(relative, bytes, digest(bytes))
  }
  const sources = ['app', 'components', 'lib', 'types', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'proxy.ts', 'eslint.config.mjs', 'vitest.config.mts', 'config/cloud-development.json', 'scripts/check-cloud-development.mjs', 'scripts/start-standalone.mjs']
  for (const relative of sources) copy(relative)
  for (const name of fs.readdirSync(path.join(sourceRoot, 'config')).sort()) {
    if (/^[a-z0-9-]+\.json$/.test(name) && name !== 'cloud-development.json') copy(path.join('config', name))
  }
  const contracts = new Set()
  for (const name of fs.readdirSync(path.join(sourceRoot, 'public')).sort()) if (name !== 'games') copy(path.join('public', name))
  const games = {}
  for (const game of config.publishedGames) {
    const build = registry[game]
    copy(path.join('public/games', game, build))
    const buildRoot = path.join(target, 'public/games', game, build)
    const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8')
    const assets = [...html.matchAll(/['"](Build\/[^'"\s]+)['"]/g)].map(match => match[1])
    if (!['loader.js', '.data', '.framework.js', '.wasm'].every(suffix => assets.some(file => file.endsWith(suffix) || file.endsWith(`${suffix}.gz`)))) throw new Error(`Build incompleta: ${game}`)
    for (const asset of assets) {
      const absolute = path.resolve(buildRoot, asset)
      if (!absolute.startsWith(buildRoot + path.sep) || !fs.statSync(absolute).size) throw new Error(`Asset inválido: ${asset}`)
    }
    games[game] = build
  }
  // Normalize preview-generated includes in the isolated copy only.
  const tsconfig = JSON.parse(fs.readFileSync(path.join(target, 'tsconfig.json'), 'utf8'))
  tsconfig.include = ['next-env.d.ts', '**/*.ts', '**/*.tsx', '**/*.mts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts']
  write('tsconfig.json', Buffer.from(JSON.stringify(tsconfig, null, 2) + '\n'), digest(fs.readFileSync(path.join(sourceRoot, 'tsconfig.json'))))
  write('vercel.json', Buffer.from(JSON.stringify({ framework: 'nextjs', installCommand: 'npm ci', buildCommand: 'node scripts/check-cloud-development.mjs && next build --webpack', crons: [], headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] }, null, 2) + '\n'))
  write('.vercelignore', Buffer.from('.env*\n.next\nnode_modules\n.git\n*.tsbuildinfo\nnext-env.d.ts\n'))
  const git = args => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', windowsHide: true }).trim()
  const manifest = [...files.values()].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of manifest) {
    if (file.sourceSha256 && digest(fs.readFileSync(path.join(sourceRoot, file.path))) !== file.sourceSha256) throw new Error(`Origen cambió durante captura: ${file.path}`)
  }
  const report = { createdAt: new Date().toISOString(), packageDirectory: target, sourceBranch: git(['branch', '--show-current']), sourceHead: git(['rev-parse', 'HEAD']), includesWorkingChanges: true, games, localGames: registry, excludedGames: config.excludedGames, unityContracts: [...contracts].sort(), totalBytes: manifest.reduce((sum, file) => sum + file.bytes, 0), inventorySha256: digest(Buffer.from(JSON.stringify(manifest))), files: manifest }
  const reportPath = path.join(directory, 'package-manifest.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  const latest = { directory, packageDirectory: target, manifest: reportPath }
  fs.writeFileSync(path.join(sourceRoot, 'artifacts', artifactName, 'latest-package.json'), JSON.stringify(latest, null, 2) + '\n')
  return { ...latest, files: manifest.length, bytes: report.totalBytes, games, unityContracts: report.unityContracts, inventorySha256: report.inventorySha256 }
}
