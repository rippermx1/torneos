import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { validateEnvironment } from '../lib/config/validate.mjs'

process.env.NODE_ENV = 'production'

// Deployment defaults to the actual injected environment. Reading local files is explicit.
if (process.argv.includes('--load-env')) nextEnv.loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), false, { info() {}, error() {} }, true)
const index = process.argv.indexOf('--phase')
const phase = index < 0 ? 'runtime' : process.argv[index + 1]
if (!['runtime', 'public-build'].includes(phase)) throw new Error('Use --phase runtime|public-build')
const result = validateEnvironment({ ...process.env, NODE_ENV: 'production', TORNEOS_ENVIRONMENT: process.env.TORNEOS_ENVIRONMENT ?? 'production' }, { phase })
console.log(JSON.stringify({ ...result, scope: 'structural effective configuration; credentials and callback reachability require staging' }, null, 2))
if (!result.ok) process.exitCode = 1
