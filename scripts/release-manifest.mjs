import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { npmInvocation } from './release-process.mjs'
import { assertEnvironment } from '../lib/config/validate.mjs'
import { effectiveConfig, normalizeUrl } from '../lib/config/effective.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
// Git checkouts differ in newline conversion. Only source text is canonicalized;
// compiled output and published game files always retain exact byte hashes.
export function sourceHash(bytes, file) {
  const text = /\.(ts|tsx|js|jsx|mjs|mts|cts|json|sql|ya?ml|css|md|html|svg|ps1|py|sh|cmd|bat|txt|webmanifest)$/.test(file) || /(^|\/)(Dockerfile|\.nvmrc|\.dockerignore)$/.test(file)
  return sha(text ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : bytes)
}
export function fileInventory(root, relative) {
  const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(directory, entry.name)
    if (entry.isSymbolicLink() || /(^|\/)\.env(?:\.|$)/.test(file)) throw new Error('Release inventory rejects symlinks and environment files')
    if (entry.isDirectory()) return walk(file)
    const bytes = fs.readFileSync(path.join(root, file))
    return [{ file, bytes: bytes.length, sha256: sha(bytes) }]
  })
  return walk(relative).sort((a, b) => a.file.localeCompare(b.file, 'en'))
}
export function migrationComparison(required, applied) {
  // The live Supabase history preserves the original 001..009 migrations.
  // Accept those identifiers without treating them as timestamped candidate SQL.
  if (!Array.isArray(applied) || applied.some(value => typeof value !== 'string' || !/^(?:\d{14}|00[1-9])$/.test(value)) || new Set(applied).size !== applied.length) throw new Error('Inventario destino inválido: versiones únicas de 14 dígitos o legacy 001..009 requeridas')
  return { pending: required.filter(file => !applied.includes(file.slice(0, 14))), present: required.filter(file => applied.includes(file.slice(0, 14))), warning: 'Version presence does not prove SQL hashes/grants or historical dependencies. Review drift on staging; do not db push all migrations.' }
}
export function sourceInventory(root = process.cwd()) {
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/)
  const selected = [...new Set(names)].filter(file => /^(app\/|__tests__\/|components\/|lib\/|types\/|scripts\/|config\/|public\/|\.github\/)|^(package(-lock)?\.json|next\.config\.ts|instrumentation\.ts|proxy\.ts|Dockerfile|compose\.app\.yaml|eslint\.config\.mjs|tsconfig\.json|vitest\.config\.mts|postcss\.config\.mjs|\.nvmrc|\.dockerignore)$/.test(file)).sort()
  const source = selected.map(file => ({ file, sha256: sourceHash(fs.readFileSync(path.join(root, file)), file) }))
  return source
}
export function createManifest(root = process.cwd(), applied) {
  const read = file => fs.readFileSync(path.join(root, file))
  const build = JSON.parse(read('.next/required-server-files.json'))
  const snapshot = JSON.parse(build.config.env.TORNEOS_BUILD_PUBLIC_CONFIG)
  assertEnvironment(process.env, { phase: 'public-build', builtPublic: snapshot })
  const config = JSON.parse(read('config/commercial-release.json'))
  const migrations = config.migrations.map(file => ({ file, sha256: sourceHash(read(`supabase/migrations/${file}`), file) }))
  const gameOutput = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/check-game-builds.mjs')], { cwd: root, encoding: 'utf8' }))
  const source = sourceInventory(root)
  const publicNames = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED']
  const frozen = { environment: snapshot.environment, app_origin_sha256: sha(normalizeUrl(effectiveConfig(process.env).appUrl)), values: Object.fromEntries(publicNames.map(name => [name, { present: Boolean(process.env[name]), sha256: process.env[name] ? sha(process.env[name]) : null }])) }
  const npm = npmInvocation()
  const application = [
    { file: '.next/BUILD_ID', sha256: sha(read('.next/BUILD_ID')) },
    ...fileInventory(root, '.next/standalone'), ...fileInventory(root, '.next/static'),
  ]
  const sourceFingerprint = sha(JSON.stringify({ source, games: gameOutput.games, migrations, public_build: frozen }))
  return {
    schema: 1, status: 'CANDIDATE_NOT_RELEASED', production_decision: 'NO_GO',
    hashing: { source_and_sql: 'UTF-8 text CRLF normalized to LF; binary source bytes exact', application_and_games: 'exact bytes' },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    toolchain: { node: process.version, npm: execFileSync(npm.command, [...npm.prefix, '--version'], { encoding: 'utf8' }).trim(), declared: JSON.parse(read('package.json')).packageManager, lock_sha256: sha(read('package-lock.json')) },
    source_fingerprint: sourceFingerprint,
    release_fingerprint: sha(JSON.stringify({ source_fingerprint: sourceFingerprint, application })), application,
    code_fingerprint: sha(JSON.stringify(source)), source,
    public_build: frozen, games: gameOutput.games, migrations,
    destination_inventory: applied ? migrationComparison(config.migrations, applied) : { status: 'NOT_RUN' },
    staging_required: config.staging_required,
    reproducibility: 'Exact inputs/artifacts recorded; timestamped compiler output is not claimed bit-for-bit deterministic',
  }
}
if (process.argv[1]?.endsWith('release-manifest.mjs')) {
  const args = process.argv.slice(2), index = args.indexOf('--destination-inventory')
  const applied = index < 0 ? undefined : JSON.parse(fs.readFileSync(args[index + 1], 'utf8'))
  const outputIndex = args.indexOf('--output'), output = outputIndex < 0 ? 'artifacts/release/manifest.json' : args[outputIndex + 1]
  const manifest = createManifest()
  if (applied) manifest.destination_inventory = migrationComparison(manifest.migrations.map(m => m.file), applied)
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ output, games: manifest.games.map(g => `${g.game}/${g.build}`), dirty: manifest.dirty, production_decision: manifest.production_decision }))
}
