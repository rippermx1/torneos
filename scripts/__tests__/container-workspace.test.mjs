import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const relative = 'games/alien-run/UnityProject/Assets/pilot.cs'
const hash = text => createHash('sha256').update(text).digest('hex')
function fixture(t, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torneos-workspace-'))
  // Only this newly created temporary directory is removed.
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'target'), source = path.join(dir, 'source')
  fs.mkdirSync(path.join(target, 'scripts'), { recursive: true })
  fs.mkdirSync(source)
  fs.copyFileSync(path.join(root, 'scripts', script), path.join(target, 'scripts', script))
  const write = (base, file, data) => {
    const dest = path.join(base, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
  }
  const run = (...args) => spawnSync(process.execPath, [path.join(target, 'scripts', script), ...args], { encoding: 'utf8' })
  return { target, source, write, run }
}

test('dry-run reports missing files without creating inventory or destination sources', t => {
  const f = fixture(t, 'migrate-alien-run.mjs')
  f.write(f.source, relative, 'source')
  const result = f.run(f.source, '--dry-run')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).pending, [{ path: relative, action: 'copy', sha256: hash('source') }])
  assert.equal(fs.existsSync(path.join(f.target, 'games')), false)
  assert.equal(fs.existsSync(path.join(f.target, 'artifacts')), false)
  assert.equal(fs.readFileSync(path.join(f.source, relative), 'utf8'), 'source')
})

test('dry-run distinguishes a safe update from a destination conflict and preserves baseline', t => {
  const f = fixture(t, 'migrate-alien-run.mjs')
  const inventory = 'artifacts/alien-run-transfer.json'
  const baseline = JSON.stringify({ files: { [relative]: hash('previous') } })
  f.write(f.target, inventory, baseline)
  f.write(f.source, relative, 'new source')
  f.write(f.target, relative, 'previous')
  let result = f.run('--dry-run', f.source)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).pending[0].action, 'update')
  assert.equal(fs.readFileSync(path.join(f.target, relative), 'utf8'), 'previous')
  f.write(f.target, relative, 'destination work')
  result = f.run(f.source, '--dry-run')
  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout).conflicts, [relative])
  assert.equal(fs.readFileSync(path.join(f.target, inventory), 'utf8'), baseline)
  assert.equal(fs.readFileSync(path.join(f.target, relative), 'utf8'), 'destination work')
})

test('transfer preserves metadata bytes and refuses overwriting destination edits', t => {
  const f = fixture(t, 'migrate-alien-run.mjs')
  f.write(f.source, relative, 'new source')
  f.write(f.source, `${relative}.meta`, 'guid: original\r\n')
  let result = f.run(f.source)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(f.target, `${relative}.meta`), 'utf8'), 'guid: original\r\n')
  f.write(f.target, relative, 'destination work')
  result = f.run(f.source)
  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout).conflicts, [relative])
  assert.equal(fs.readFileSync(path.join(f.target, relative), 'utf8'), 'destination work')
})

test('published game check fails for absent or empty runtime assets and reports exact hashes', t => {
  const f = fixture(t, 'check-game-builds.mjs')
  f.write(f.target, 'lib/game/runtime-builds.json', JSON.stringify({ 'pilot': 'v1' }))
  const directory = 'public/games/pilot/v1/'
  const assets = ['game.loader.js', 'game.data', 'game.framework.js', 'game.wasm']
  f.write(f.target, `${directory}index.html`, assets.map(file => `'Build/${file}'`).join(','))
  assert.notEqual(f.run().status, 0)
  for (const file of assets) f.write(f.target, `${directory}Build/${file}`, 'asset')
  let result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).games[0].files.find(file => file.path.endsWith('.wasm')).sha256, hash('asset'))
  f.write(f.target, `${directory}Build/game.wasm`, '')
  result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Empty published asset/)
})
