// Isolated loopback practice probe; preserve the existing 3083 service and its reports.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { sha256 } from './2048-integrity-local.mjs'

const dir = 'artifacts/2048-simulated/probe'
await mkdir(dir, { recursive: true })
const hashes = {}
for (const name of ['server.mjs', 'policy.mjs', 'client.js', 'capsule.js']) {
  const original = await readFile(new URL(`./2048-device-probe/${name}`, import.meta.url), 'utf8')
  hashes[name] = sha256(original)
  let source = original
  if (name === 'server.mjs') {
    assert.equal(source.split('port = 3083').length, 2)
    assert.equal(source.split("'artifacts/2048-device/'").length, 2)
    source = source.replace('port = 3083', 'port = 65170')
      .replace("'artifacts/2048-device/'", "'artifacts/2048-simulated/device/'")
  }
  await writeFile(`${dir}/${name}`, source)
}
await writeFile(`${dir}/sources.json`, JSON.stringify({ at: new Date().toISOString(), hashes,
  changes: ['loopback port 65170', 'own report directory'], original3083Changed: false }, null, 2))
const child = spawn(process.execPath, [`${dir}/server.mjs`, '--host', '127.0.0.1'],
  { stdio: 'inherit', windowsHide: true })
child.on('error', () => { console.error('Isolated probe could not start'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
