// Fail the image build if a game selected by the clients is not published locally.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const builds = JSON.parse(fs.readFileSync(path.join(root, 'lib/game/runtime-builds.json'), 'utf8'))
const report = []
for (const [game, build] of Object.entries(builds)) {
  if (![game, build].every(value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value))) {
    throw new Error('Invalid game/build identifier')
  }
  const directory = path.join(root, 'public/games', game, build)
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  const assets = [...html.matchAll(/['"](Build\/[^'"\s]+)['"]/g)].map(match => match[1])
  if (!['loader.js', '.data', '.framework.js', '.wasm'].every(suffix => assets.some(file => file.endsWith(suffix) || file.endsWith(`${suffix}.gz`)))) {
    throw new Error(`Incomplete WebGL entry: ${game}/${build}`)
  }
  const files = ['index.html', ...new Set(assets)].map(file => {
    const target = path.resolve(directory, file)
    if (!target.startsWith(`${directory}${path.sep}`) || fs.lstatSync(target).isSymbolicLink()) {
      throw new Error(`Invalid published asset: ${file}`)
    }
    const bytes = fs.readFileSync(target)
    if (!bytes.length) throw new Error(`Empty published asset: ${game}/${build}/${file}`)
    return { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
  report.push({ game, build, files })
}
console.log(JSON.stringify({ games: report }, null, 2))
