import fs from 'node:fs'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { validateCloudDevelopment } from './check-cloud-development.mjs'
const config = JSON.parse(fs.readFileSync(new URL('../config/cloud-development.json', import.meta.url), 'utf8'))
const { appUrl } = validateCloudDevelopment(process.env, config)
const latest = JSON.parse(fs.readFileSync(new URL('../artifacts/cloud-development/latest-package.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(latest.manifest, 'utf8'))
const checks = []
for (const route of ['/', '/sign-in', '/tournaments', '/play', '/play/catalog', '/play/web']) {
  const response = await fetch(appUrl + route, { signal: AbortSignal.timeout(30000) })
  const html = await response.text()
  if (response.status !== 200 || !html.includes('Ambiente de desarrollo')) throw new Error(`Página cloud inválida: ${route} (${response.status})`)
  checks.push({ route, status: response.status, developmentBanner: true, noindex: response.headers.get('x-robots-tag') })
}
function download(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'Accept-Encoding': 'identity' }, timeout: 30000 }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }))
    })
    request.on('timeout', () => request.destroy(new Error('Asset download timeout'))); request.on('error', reject)
  })
}
for (const file of manifest.files.filter(file => file.path.startsWith('public/games/'))) {
  const route = '/' + file.path.slice('public/'.length), result = await download(appUrl + route)
  if (result.status !== 200 || createHash('sha256').update(result.bytes).digest('hex') !== file.sha256) throw new Error(`Asset cloud/hash inválido: ${route}`)
  if (route.endsWith('.gz') && result.headers['content-encoding'] !== 'gzip') throw new Error(`Falta gzip: ${route}`)
  if (route.endsWith('.wasm.gz') && !result.headers['content-type']?.includes('application/wasm')) throw new Error(`MIME WASM incorrecto: ${route}`)
  if (route.endsWith('.js.gz') && !result.headers['content-type']?.includes('javascript')) throw new Error(`MIME JS incorrecto: ${route}`)
  if (route.endsWith('index.html') && result.headers['x-frame-options'] !== 'SAMEORIGIN') throw new Error(`Iframe bloqueado: ${route}`)
  checks.push({ route, status: result.status, bytes: result.bytes.length, sha256: file.sha256, encoding: result.headers['content-encoding'], contentType: result.headers['content-type'] })
}
const unauthorized = await fetch(appUrl + '/api/cron/process-tournaments')
if (unauthorized.status !== 401) throw new Error('Cron accesible sin credencial')
checks.push({ route: '/api/cron/process-tournaments', unauthorized: 401 })
const cron = await fetch(appUrl + '/api/cron/process-tournaments', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
const body = await cron.json()
if (cron.status !== 200 || body.ok !== true) throw new Error('Cron de desarrollo no funciona')
checks.push({ route: '/api/cron/process-tournaments', authorized: 200, ok: body.ok, total: body.total })
const report = { url: appUrl, checkedAt: new Date().toISOString(), checks, passed: checks.length }
fs.writeFileSync(new URL('../artifacts/cloud-development/http-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ url: appUrl, passed: checks.length }))
