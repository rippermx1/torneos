import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = path.join(root, '.next/standalone')
if (!fs.existsSync(path.join(bundle, 'server.js'))) throw new Error('Next standalone build required')
// All runtime checks and assets are packaged now, never reconstructed at startup.
for (const directory of ['public', '.next/static']) fs.cpSync(path.join(root, directory), path.join(bundle, directory), { recursive: true })
for (const file of ['scripts/start-release.mjs', 'lib/config/validate.mjs', 'lib/config/effective.mjs', 'lib/identity/rut.mjs']) {
  const target = path.join(bundle, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(root, file), target)
}
console.log('Standalone release prepared with startup validation and frozen public assets')
