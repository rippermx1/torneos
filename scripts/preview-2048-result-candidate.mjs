// Preview the compiled candidate on loopback with the accepted local configuration.
// Existing services, volumes, migrations and operative image are not changed.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import { docker, localEnv } from './2048-integrity-local.mjs'

function api(method, route, body) {
  const bytes = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath: '//./pipe/dockerDesktopLinuxEngine', path: '/v1.51' + route,
      method, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) } : {} }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk })
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve(text ? JSON.parse(text) : null) : reject(new Error('Preview container operation failed')))
    })
    request.setTimeout(15000, () => request.destroy(new Error('Preview operation timed out')))
    request.on('error', reject); request.end(bytes)
  })
}
await localEnv()
await new Promise((resolve, reject) => {
  const check = net.createServer(); check.once('error', reject)
  check.listen(65175, '127.0.0.1', () => check.close(resolve))
})
const candidate = JSON.parse(await fs.readFile('artifacts/2048-result/candidate.json', 'utf8'))
assert.equal(candidate.status, 'PASS_CANDIDATE_BUILD')
const baseline = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
assert.equal(baseline.Image, candidate.baseline)
const config = structuredClone(baseline.Config)
config.Image = candidate.imageId; config.Cmd = ['node', 'server.js']; delete config.Labels
config.Env = config.Env.map(pair => pair.startsWith('APP_URL=') || pair.startsWith('NEXT_PUBLIC_APP_URL=')
  ? pair.slice(0, pair.indexOf('=')) + '=http://127.0.0.1:65175' : pair)
const created = await api('POST', `/containers/create?name=torneos-2048-result-preview-${Date.now()}`, {
  ...config, HostConfig: { NetworkMode: baseline.HostConfig.NetworkMode,
    PortBindings: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '65175' }] } },
  NetworkingConfig: { EndpointsConfig: Object.fromEntries(Object.keys(baseline.NetworkSettings.Networks).map(name => [name, {}])) },
})
await api('POST', `/containers/${created.Id}/start`)
await fs.writeFile('artifacts/2048-result/preview.json', JSON.stringify({ at: new Date().toISOString(), id: created.Id,
  imageId: candidate.imageId, origin: 'http://127.0.0.1:65175', operativeUnchanged: true }, null, 2) + '\n')
console.log(JSON.stringify({ id: created.Id, origin: 'http://127.0.0.1:65175', operativeUnchanged: true }))
