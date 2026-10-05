// Validate the actual injection before Next binds a socket or prints readiness.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { assertEnvironment } from '../lib/config/validate.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = fs.existsSync(path.join(root, 'server.js')) ? root : path.join(root, '.next/standalone')
process.env.NODE_ENV = 'production'
const build = JSON.parse(fs.readFileSync(path.join(bundle, '.next/required-server-files.json'), 'utf8'))
const frozen = build.config.env?.TORNEOS_BUILD_PUBLIC_CONFIG
if (!frozen) throw new Error('Artefacto sin configuración pública congelada; reconstruir')
assertEnvironment(process.env, { builtPublic: JSON.parse(frozen) })
await import(pathToFileURL(path.join(bundle, 'server.js')).href)
