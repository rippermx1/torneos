import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const standaloneServer = path.join(rootDir, '.next', 'standalone', 'server.js')

if (!fs.existsSync(standaloneServer)) {
  console.error('Standalone build not found. Run "npm run build" first.')
  process.exit(1)
}

// `server.js` from Next changes cwd to `.next/standalone`, so load `.env*`
// from the project root before spawning it.
loadEnvConfig(rootDir)

const child = spawn(process.execPath, [standaloneServer], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
})

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal)
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
