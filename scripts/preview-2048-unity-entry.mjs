// Isolated web preview, no replacement of the operative app or volumes.
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import net from 'node:net'

const docker = args => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true }).trim()
const candidate = JSON.parse(await fs.readFile('artifacts/2048-unity-entry/candidate.json', 'utf8'))
const live = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
assert.equal(live.Image, candidate.baseline)
assert.equal(live.State.Health.Status, 'healthy')
const name = 'torneos-2048-entry-preview'
assert.ok(!docker(['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.ID}}']), 'Inspect existing preview before reusing its name')
await new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(3082, '127.0.0.1', () => server.close(resolve))
})
const args = ['run', '-d', '--name', name, '--publish', '127.0.0.1:3082:3000', '--network', Object.keys(live.NetworkSettings.Networks)[0]]
for (const entry of live.HostConfig.ExtraHosts ?? []) args.push('--add-host', entry)
for (const value of live.Config.Env) {
  if (/^(APP_URL|NEXT_PUBLIC_APP_URL)=/.test(value)) args.push('--env', value.slice(0, value.indexOf('=')) + '=http://127.0.0.1:3082')
  else args.push('--env', value)
}
args.push(candidate.image, 'node', 'server.js')
const containerId = docker(args)
await fs.writeFile('artifacts/2048-unity-entry/preview.json', JSON.stringify({ containerId, name, url: 'http://127.0.0.1:3082', image: candidate.image, imageId: candidate.imageId, at: new Date().toISOString(), operativeUnchanged: true, mounts: [] }, null, 2) + '\n')
console.log(JSON.stringify({ name, url: 'http://127.0.0.1:3082', image: candidate.image, operativeUnchanged: true }))
