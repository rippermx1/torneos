import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
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
