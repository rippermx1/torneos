// Complete the 2048 assets referenced by /play in an isolated Snake Next preview.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export async function package2048Preview(root, buildDir) {
  assert.match(buildDir, /^\.next\/snake-sa(?:11|12|13|14|15)[-a-z0-9]*$/)
  const standalone = path.resolve(root, buildDir, 'standalone')
  await fs.access(path.join(standalone, 'server.js'))
  const build = JSON.parse(await fs.readFile(path.join(root, 'lib/game/runtime-builds.json'), 'utf8'))['2048']
  assert.match(build, /^unity-2048-\d+$/)
  const source = path.join(root, 'public/games/2048', build), destination = path.join(standalone, 'public/games/2048', build)
  const files = []
  async function visit(directory, relative = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false)
      const name = path.join(relative, entry.name)
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), name)
      else {
        assert.equal(entry.isFile(), true)
        const bytes = await fs.readFile(path.join(source, name)), target = path.join(destination, name)
        try { assert.deepEqual(await fs.readFile(target), bytes, `Conflicting preview asset: ${name}`) }
        catch (error) { if (error.code !== 'ENOENT') throw error; await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes, { flag: 'wx' }) }
        files.push({ file: name.replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }
  await visit(source)
  assert.ok(files.some(entry => entry.file === 'index.html'))
  assert.ok(files.some(entry => entry.file.endsWith('.wasm.gz')))
  return { build, buildDir, files }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await package2048Preview(process.cwd(), process.argv[2])))
}
