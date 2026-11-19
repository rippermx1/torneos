import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { packageCloudDevelopment } from './cloud-development-package.mjs'

const base = path.resolve('artifacts/games-development/package-tests')
fs.mkdirSync(base, { recursive: true })
function fixture() {
  const root = fs.mkdtempSync(path.join(base, 'case-'))
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value) }
  const config = { name: 'torneos-dev', supabaseProjectRef: 'abcdefghijklmnopqrst', protectedSupabaseProjectRefs: ['production'], publishedGames: ['2048'], excludedGames: {} }
  write('config/cloud-development.json', JSON.stringify(config))
  write('lib/game/runtime-builds.json', JSON.stringify({ '2048': 'puzzle-001' }))
  for (const directory of ['app', 'components', 'types', '__tests__']) fs.mkdirSync(path.join(root, directory), { recursive: true })
  for (const file of ['package.json', 'package-lock.json', 'next.config.ts', 'postcss.config.mjs', 'proxy.ts', 'eslint.config.mjs', 'vitest.config.mts', 'scripts/check-cloud-development.mjs', 'scripts/start-standalone.mjs']) write(file, '{}')
  write('tsconfig.json', JSON.stringify({ include: ['artifacts/shared-preview/types/**/*.ts'], exclude: ['node_modules'] }))
  for (const [game, build] of [['2048', 'puzzle-001']]) {
    const dir = `public/games/${game}/${build}`
    write(`${dir}/index.html`, ['loader.js', 'data.gz', 'framework.js.gz', 'wasm.gz'].map(ext => `"Build/client.${ext}"`).join('\n'))
    for (const ext of ['loader.js', 'data.gz', 'framework.js.gz', 'wasm.gz']) write(`${dir}/Build/client.${ext}`, 'asset')
  }
  write('public/games/alien-run/level-030/LocalArt.png', 'private-art')
  write('public/games/snake-arena/snake-014/index.html', 'not-hosted')
  write('.env.local', 'PRIVATE_TEST_SECRET=never-copy')
  execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'fixture', '--quiet'], { cwd: root, windowsHide: true })
  return { root, write, config }
}

test('freezes only 2048 and deployment configuration with complete hashes', () => {
  const f = fixture(), result = packageCloudDevelopment(f.root, { artifactName: 'games-development' })
  const manifest = JSON.parse(fs.readFileSync(result.manifest, 'utf8'))
  assert.equal(manifest.unityContracts.length, 0)
  assert.ok(manifest.files.some(f => f.path === 'vercel.json'))
  assert.ok(manifest.files.some(f => f.path === '.vercelignore'))
  assert.ok(!manifest.files.some(f => /alien-run|snake|factory|rts-duel|\.env/.test(f.path)))
  assert.deepEqual(manifest.games, { '2048': 'puzzle-001' })
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.packageDirectory, 'vercel.json'))).installCommand, 'npm ci')
  for (const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(result.packageDirectory, file.path))).digest('hex'), file.sha256)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.packageDirectory, 'vercel.json'))).crons, [])
  assert.ok(!JSON.parse(fs.readFileSync(path.join(result.packageDirectory, 'tsconfig.json'))).include.some(p => p.includes('shared-preview')))
  f.write('lib/game/runtime-builds.json', '{"2048":"later-build"}')
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.packageDirectory, 'lib/game/runtime-builds.json')))['2048'], 'puzzle-001')
})
test('rejects a selected build with a missing binary', () => {
  const f = fixture()
  fs.unlinkSync(path.join(f.root, 'public/games/2048/puzzle-001/Build/client.wasm.gz'))
  assert.throws(() => packageCloudDevelopment(f.root), /ENOENT/)
})
test('rejects a secret inside copied web sources', () => {
  const f = fixture(); f.write('app/.env.production', 'PRIVATE_TEST_SECRET=never-copy')
  assert.throws(() => packageCloudDevelopment(f.root), /Archivo no publicable/)
})
test('rejects retired games even if someone changes publishedGames', () => {
  const f = fixture(); f.config.publishedGames.push('alien-run'); f.write('config/cloud-development.json', JSON.stringify(f.config))
  assert.throws(() => packageCloudDevelopment(f.root), /Juego no publicable/)
})
