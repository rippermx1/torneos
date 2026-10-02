// Read-only raw HTTP timing/size baseline; it does not measure Unity startup or phone FPS.
import http from 'node:http'
import fs from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:3081/games/2048/unity-2048-007/'
const hashes = JSON.parse(await fs.readFile('docs/2048-ACCESSIBILITY-EVIDENCE.json', 'utf8')).build_sha256
function get(file, headers = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now(), request = http.get(base + file, { headers }, response => {
      const firstByteMs = performance.now() - started, parts = []
      response.on('data', chunk => parts.push(chunk)); response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts), firstByteMs, elapsedMs: performance.now() - started }))
    })
    request.setTimeout(30000, () => request.destroy(Error('Timed out'))); request.on('error', reject)
  })
}
const files = []
for (const [file, expected] of Object.entries(hashes)) {
  const samples = []
  let original
  for (let i = 0; i < 3; i++) {
    const response = await get(file)
    assert.equal(response.status, 200)
    assert.equal(createHash('sha256').update(response.body).digest('hex'), expected, file)
    original = response
    samples.push({ request: i + 1, firstByteMs: +response.firstByteMs.toFixed(2), elapsedMs: +response.elapsedMs.toFixed(2) })
  }
  const gzip = file.endsWith('.gz'), decodedBytes = gzip ? gunzipSync(original.body).length : original.body.length
  if (gzip) assert.equal(original.headers['content-encoding'], 'gzip')
  if (file.endsWith('.wasm.gz')) assert.match(original.headers['content-type'], /^application\/wasm/)
  let conditional = null
  if (original.headers.etag) {
    const warm = await get(file, { 'If-None-Match': original.headers.etag })
    assert.equal(warm.status, 304); assert.equal(warm.body.length, 0)
    conditional = { status: warm.status, bytes: warm.body.length, elapsedMs: +warm.elapsedMs.toFixed(2) }
  }
  files.push({ file, encodedBytes: original.body.length, decodedBytes, encoding: original.headers['content-encoding'] ?? null, cacheControl: original.headers['cache-control'] ?? null, sha256: expected, samples, conditional })
}
const report = { task: 'G2048-08.1', at: new Date().toISOString(), base, evidenceClass: 'LOOPBACK_HTTP_RAW_BYTES_NOT_PHONE_OR_STARTUP', files, encodedBytes: files.reduce((n, f) => n + f.encodedBytes, 0), decodedBytes: files.reduce((n, f) => n + f.decodedBytes, 0), cacheReset: 'NOT_RUN_BROWSER_CACHES_NOT_TOUCHED', settingsWritten: false, deployed: false }
await fs.mkdir('artifacts/2048-device', { recursive: true })
await fs.writeFile('artifacts/2048-device/delivery.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ files: files.length, encodedBytes: report.encodedBytes, decodedBytes: report.decodedBytes, gzipAndHashes: 'PASS', scope: report.evidenceClass }))
