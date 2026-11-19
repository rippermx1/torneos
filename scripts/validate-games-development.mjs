import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { parseEnv } from 'node:util'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

const root = process.cwd()
const pack = JSON.parse(fs.readFileSync('artifacts/games-development/latest-package.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync(pack.manifest, 'utf8'))
const config = JSON.parse(fs.readFileSync(path.join(pack.packageDirectory, 'config/cloud-development.json'), 'utf8'))
const env = parseEnv(fs.readFileSync(path.join(pack.directory, '.env.vercel-production.local'), 'utf8'))
validateCloudDevelopment(env, config)
assert.equal(env.FLOW_API_KEY ?? '', '')
assert.equal(env.FLOW_API_SECRET ?? '', '')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
for (const file of manifest.files) assert.equal(hash(fs.readFileSync(path.join(pack.packageDirectory, file.path))), file.sha256, file.path)
const accounting = JSON.parse(fs.readFileSync('artifacts/accounting-cloud/latest-package.json', 'utf8'))
const previous = JSON.parse(fs.readFileSync(accounting.manifest, 'utf8'))
const accountingPaths = previous.changes.filter(file => file !== 'types/database.ts' && file !== 'app/(admin)/admin/reports/page.tsx')
for (const file of accountingPaths) {
  assert.equal(manifest.files.find(f => f.path === file)?.sha256, previous.files.find(f => f.path === file)?.sha256, `Contabilidad publicada modificada: ${file}`)
}
fs.writeFileSync(path.join(pack.directory, 'preflight.json'), JSON.stringify({ at: new Date().toISOString(), status: 'PASS', files: manifest.files.length, games: manifest.games, accountingPreserved: accountingPaths, environment: 'torneos-dev', flow: 'NO_CREDENTIALS', unityContracts: manifest.unityContracts }, null, 2) + '\n')
if (process.argv.includes('--check-only')) { console.log('PASS package hashes, accounting baseline and live dev environment'); process.exit(0) }
const before = fs.readFileSync(path.join(pack.packageDirectory, 'tsconfig.json'))
const log = fs.createWriteStream(path.join(pack.directory, 'next-build.log'))
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], { cwd: pack.packageDirectory, env: { ...process.env, ...env, NODE_ENV: 'production', NEXT_BUILD_DIR: '.next' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log.write(bytes); process.stdout.write(bytes) })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
log.end()
// Keep captured source bytes stable; generated type declarations are not deployed.
fs.writeFileSync(path.join(pack.packageDirectory, 'tsconfig.json'), before)
fs.writeFileSync(path.join(pack.directory, 'build-result.json'), JSON.stringify({ at: new Date().toISOString(), status: code === 0 ? 'PASS' : 'FAIL', code, manifest: pack.manifest, inventorySha256: manifest.inventorySha256, cwd: path.relative(root, pack.packageDirectory) }, null, 2) + '\n')
process.exitCode = code ?? 1
