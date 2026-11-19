import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageCloudDevelopment } from './cloud-development-package.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
console.log(JSON.stringify(packageCloudDevelopment(root, {
  artifactName: process.argv.includes('--games') ? 'games-development' : 'cloud-development',
})))
