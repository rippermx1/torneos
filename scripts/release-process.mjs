import fs from 'node:fs'
import path from 'node:path'

export function npmInvocation() {
  const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
  const cli = candidates.find(file => file && fs.existsSync(file))
  if (cli) return { command: process.execPath, prefix: [cli] }
  if (process.platform !== 'win32') return { command: 'npm', prefix: [] }
  throw new Error('npm CLI no encontrado; ejecutar npm run release:check')
}
