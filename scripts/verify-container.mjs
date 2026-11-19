// Read-only HTTP verification of the application and each active WebGL build.
import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3081')
const catalog = spawnSync(process.execPath, [fileURLToPath(new URL('./check-game-builds.mjs', import.meta.url))], { encoding: 'utf8' })
if (catalog.status !== 0) throw new Error(catalog.stderr)
const builds = JSON.parse(catalog.stdout).games
function get(url) {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, response => {
      const hash = createHash('sha256')
      let bytes = 0
      response.on('data', chunk => { bytes += chunk.length; hash.update(chunk) })
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes, sha256: hash.digest('hex') }))
    })
    request.setTimeout(20_000, () => request.destroy(new Error(`HTTP timeout: ${url.pathname}`)))
    request.on('error', reject)
  })
}
const checks = []
for (const route of ['/play', '/play/catalog', '/tournaments']) {
  const result = await get(new URL(route, base))
  if (result.status !== 200) throw new Error(`Application route ${route}: ${result.status}`)
  if (result.headers['x-frame-options'] !== 'DENY') throw new Error(`Application framing: ${route}`)
  checks.push({ route, status: result.status })
}
for (const { game, build, files } of builds) {
  for (const file of files) {
    const route = `/games/${game}/${build}/${file.path}`
    const result = await get(new URL(route, base))
    if (result.status !== 200 || result.bytes !== file.bytes || result.sha256 !== file.sha256) {
      throw new Error(`Published bytes mismatch: ${route}`)
    }
    if (file.path === 'index.html' && (result.headers['x-frame-options'] !== 'SAMEORIGIN' ||
        !result.headers['content-security-policy']?.includes("frame-ancestors 'self'"))) {
      throw new Error(`Game framing: ${route}`)
    }
    if (file.path.endsWith('.gz') && result.headers['content-encoding'] !== 'gzip') throw new Error(`Missing gzip encoding: ${route}`)
    const contentType = result.headers['content-type'] ?? ''
    if (/\.wasm(\.gz)?$/.test(file.path) && !contentType.startsWith('application/wasm')) throw new Error(`WASM MIME: ${route}`)
    if (/\.js(\.gz)?$/.test(file.path) && !/^(application|text)\/javascript/.test(contentType)) throw new Error(`JavaScript MIME: ${route}`)
    checks.push({ route, ...result })
  }
}
const protectedPage = await get(new URL('/admin', base))
if (protectedPage.status !== 307 || !protectedPage.headers.location?.includes('/sign-in')) throw new Error('Anonymous admin access changed')
checks.push({ route: '/admin', status: protectedPage.status, location: protectedPage.headers.location })
console.log(JSON.stringify({ base: base.origin, checks }, null, 2))
