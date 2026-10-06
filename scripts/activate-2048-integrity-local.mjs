// Scoped local activation: clone the accepted runtime, retain it for rollback.
// Docker IPC bodies and configuration are saved only to ignored private artifacts.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { docker, localEnv, sql, assertInstalled, sha256 } from './2048-integrity-local.mjs'

const results = process.argv.includes('--results')
const root = results ? 'artifacts/2048-result' : 'artifacts/2048-integrity-integration'
const run = `${root}/activation-${randomUUID()}`
const name = 'torneos-app-1'
const report = { task: results ? '2048-visible-result' : 'G2048-09.4', at: new Date().toISOString(), status: 'NOT_RUN', activated: false, checks: [] }
const socketPath = '//./pipe/dockerDesktopLinuxEngine'
function api(method, route, body) {
  const bytes = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: `/v1.51${route}`, method,
      headers: bytes ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) } : {} }, response => {
      let text = ''
      response.setEncoding('utf8'); response.on('data', chunk => { text += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Docker ${method} ${route.split('?')[0]} failed (${response.statusCode})`))
        try { resolve(text ? JSON.parse(text) : null) } catch { reject(new Error('Invalid Docker response')) }
      })
    })
    request.setTimeout(30000, () => request.destroy(new Error('Docker operation timed out; inspect state before retry')))
    request.on('error', reject); request.end(bytes)
  })
}
const inspect = id => api('GET', `/containers/${id}/json`)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function healthy(id) {
  for (let attempt = 0; attempt < 22; attempt++) {
    const current = await inspect(id)
    if (current.State.Health?.Status === 'healthy') return current
    assert.equal(current.State.Running, true, 'Candidate stopped')
    await delay(2000)
  }
  throw new Error('Candidate health did not confirm')
}
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject)
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}
function networkConfig(instance) {
  return Object.fromEntries(Object.entries(instance.NetworkSettings.Networks).map(([network, endpoint]) => {
    assert.equal(endpoint.IPAMConfig, null, 'Re-audit static addressing before activation')
    return [network, { Aliases: endpoint.Aliases ?? [] }]
  }))
}
function settings(instance) {
  const config = structuredClone(instance.Config)
  delete config.Image
  const labels = { ...config.Labels }; delete labels['com.docker.compose.image']; config.Labels = labels
  return { config, host: instance.HostConfig, networks: networkConfig(instance),
    mounts: instance.Mounts.map(({ Type, Name, Destination, RW }) => ({ Type, Name, Destination, RW })) }
}
let baseline, previewId, createdId, renamed = false, stopped = false
const disconnected = []
const backupName = `torneos-app-g2048-${results ? 'result' : '094'}-backup-${Date.now()}`
try {
  assert.ok(process.argv.slice(2).every(argument => argument === '--activate' || argument === '--results'), 'Use --results for the result candidate, optionally --activate')
  assert.equal(process.platform, 'win32', 'This activation targets the reviewed Windows Docker Desktop host')
  assert.equal(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), 'npipe:////./pipe/dockerDesktopLinuxEngine', 'Only the local Linux engine is supported')
  const env = await localEnv()
  const candidate = JSON.parse(await fs.readFile(`${root}/candidate.json`, 'utf8'))
  assert.equal(candidate.status, 'PASS_CANDIDATE_BUILD')
  assert.equal(candidate.sourceManifestStatus, 'PASS')
  assert.equal(candidate.activated, false)
  assert.equal(docker(['image', 'inspect', candidate.image, '--format', '{{.Id}}']), candidate.imageId)
  baseline = await inspect(name)
  assert.equal(baseline.Image, candidate.baseline)
  assert.equal(baseline.State.Health.Status, 'healthy')
  const runtime = Object.fromEntries(baseline.Config.Env.map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]))
  assert.equal(runtime.TORNEOS_LOCAL_MODE, '1')
  assert.equal(runtime.APP_URL, env.APP_URL)
  assert.equal(runtime.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL)
  assert.equal(sha256(runtime.SUPABASE_SECRET_KEY ?? ''), sha256(env.SUPABASE_SECRET_KEY ?? ''))
  assert.deepEqual(baseline.HostConfig.PortBindings, { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3081' }] })
  assert.ok(baseline.Mounts.every(mount => mount.Type === 'volume'), 'Re-audit bind mounts before activation')
  assertInstalled()
  const before = await api('GET', '/containers/json?all=true')
  report.otherContainerIds = before.filter(item => item.Id !== baseline.Id).map(item => item.Id).sort()
  await fs.mkdir(run, { recursive: true })
  await fs.writeFile(`${run}/baseline.private.json`, JSON.stringify(baseline), { flag: 'wx' })
  report.baseline = baseline.Image; report.candidate = candidate.imageId
  report.backupContainer = backupName; report.artifacts = run

  // Smoke the new web image without the Snake runtime or writable shared volumes.
  await freePort(65164)
  const preview = structuredClone(baseline.Config)
  preview.Image = candidate.imageId; preview.Cmd = ['node', 'server.js']
  preview.Labels = { 'torneos.g2048.scope': '094-owned-preview' }
  preview.Env = preview.Env.map(pair => pair.startsWith('APP_URL=') ? 'APP_URL=http://127.0.0.1:65164' : pair)
  const previewNetworks = Object.fromEntries(Object.keys(networkConfig(baseline)).map(network => [network, {}]))
  const createdPreview = await api('POST', `/containers/create?name=torneos-g2048-094-preview-${Date.now()}`, {
    ...preview, HostConfig: { NetworkMode: baseline.HostConfig.NetworkMode, Init: true,
      PortBindings: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '65164' }] } },
    NetworkingConfig: { EndpointsConfig: previewNetworks },
  })
  previewId = createdPreview.Id
  await api('POST', `/containers/${previewId}/start`)
  await healthy(previewId)
  for (const route of ['/play', '/games/2048/unity-2048-007/index.html']) {
    const response = await fetch(`http://127.0.0.1:65164${route}`, { signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200, 'Preview route failed')
  }
  // Verify byte-identical public capsules and Snake server against the accepted image.
  const hashAssets = id => docker(['exec', id, 'sh', '-c',
    "find /app/public/games /app/games/snake-arena/server -type f -exec sha256sum '{}' ';' | sort"], undefined, 30000)
  assert.equal(sha256(hashAssets(previewId)), sha256(hashAssets(baseline.Id)), 'Accepted capsules/server changed')
  report.checks.push('preview healthy; routes load; all capsule and Snake server file hashes preserved')
  await api('POST', `/containers/${previewId}/stop?t=10`)
  await api('DELETE', `/containers/${previewId}?v=true`); previewId = null

  const arena = await fetch(`${env.APP_URL}/snake-arena/health`, { signal: AbortSignal.timeout(5000) }).then(response => response.json())
  assert.equal(arena.ccu, 0); assert.equal(arena.rooms, 0)
  if (results) {
    // E27 is our identified single-entry test fixture, already closed in E28.
    // Do not cancel it or alter its window just to replace a local web image.
    const fixture = JSON.parse(await fs.readFile('artifacts/2048-background/manifest.json', 'utf8'))
    assert.equal(fixture.tournamentId, '82f51723-acf1-4676-8d9a-49906a11e47f')
    assert.equal(sql(`SELECT count(*) FROM tournaments WHERE id='${fixture.tournamentId}' AND is_test=true;`), '1')
    assert.equal(sql(`SELECT count(*) FROM games WHERE tournament_id='${fixture.tournamentId}' AND status='completed';`), '1')
    assert.equal(sql(`SELECT count(*) FROM games WHERE tournament_id='${fixture.tournamentId}' AND status='active';`), '0')
    assert.equal(sql(`SELECT count(*) FROM tournaments WHERE status='live' AND play_window_end>now() AND id<>'${fixture.tournamentId}';`), '0', 'Another active tournament; defer replacement')
    report.checks.push('only live tournament is the identified E27 test fixture, with its single game already closed')
  } else {
    assert.equal(sql("SELECT count(*) FROM tournaments WHERE status='live' AND play_window_end>now();"), '0', 'Active tournament; defer local replacement')
  }
  const rechecked = await inspect(name)
  assert.equal(rechecked.Id, baseline.Id); assert.equal(rechecked.Image, baseline.Image)
  assert.deepEqual(settings(rechecked), settings(baseline), 'Runtime changed during candidate verification')
  if (!process.argv.includes('--activate')) {
    report.status = 'PASS_PREVIEW_ONLY'
  } else {
    await api('POST', `/containers/${baseline.Id}/stop?t=20`); stopped = true
    await api('POST', `/containers/${baseline.Id}/rename?name=${backupName}`); renamed = true
    for (const network of Object.keys(networkConfig(baseline))) {
      await api('POST', `/networks/${network}/disconnect`, { Container: baseline.Id, Force: false })
      disconnected.push(network)
    }
    const config = structuredClone(baseline.Config)
    config.Image = candidate.imageId
    config.Labels['com.docker.compose.image'] = candidate.imageId
    const created = await api('POST', `/containers/create?name=${name}`, { ...config,
      HostConfig: baseline.HostConfig, NetworkingConfig: { EndpointsConfig: networkConfig(baseline) } })
    createdId = created.Id
    await api('POST', `/containers/${createdId}/start`)
    const active = await healthy(createdId)
    assert.equal(active.Image, candidate.imageId)
    assert.deepEqual(settings(active), settings(baseline), 'Runtime configuration was not preserved')
    const after = await api('GET', '/containers/json?all=true')
    assert.deepEqual(after.filter(item => ![baseline.Id, createdId].includes(item.Id)).map(item => item.Id).sort(), report.otherContainerIds)
    const arenaAfter = await fetch(`${env.APP_URL}/snake-arena/health`, { signal: AbortSignal.timeout(5000) }).then(response => response.json())
    assert.equal(arenaAfter.ccu, 0); assert.equal(arenaAfter.rooms, 0)
    assertInstalled()
    docker(['image', 'tag', candidate.imageId, 'torneos-app:local'])
    candidate.activated = true; candidate.deployedTo3081 = true; candidate.activationReport = `${run}/report.json`
    await fs.writeFile(`${root}/candidate.json`, JSON.stringify(candidate, null, 2) + '\n')
    report.containerId = createdId; report.activated = true; report.status = 'PASS_ACTIVATED_LOCAL'
    report.checks.push('runtime configuration, networks, volumes and other container identities preserved')
  }
} catch {
  report.status = 'NOT_COMPLETED'
  report.blocker = 'Precondition, preview or activation failed; inspect private artifact and exact local state before retry'
  if (stopped && !report.activated) {
    try {
      if (createdId) {
        await api('POST', `/containers/${createdId}/stop?t=10`).catch(() => {})
        await api('DELETE', `/containers/${createdId}`)
      }
      if (renamed) await api('POST', `/containers/${baseline.Id}/rename?name=${name}`)
      for (const network of disconnected) await api('POST', `/networks/${network}/connect`, {
        Container: baseline.Id, EndpointConfig: networkConfig(baseline)[network],
      })
      await api('POST', `/containers/${baseline.Id}/start`)
      await healthy(baseline.Id); report.rollback = 'PASS_BASELINE_RESTORED'
    } catch { report.rollback = 'UNCONFIRMED_INSPECT_BEFORE_RETRY' }
  }
  process.exitCode = 1
} finally {
  if (previewId) {
    try {
      await api('POST', `/containers/${previewId}/stop?t=10`).catch(() => {})
      await api('DELETE', `/containers/${previewId}?v=true`)
    } catch { report.previewCleanup = 'UNCONFIRMED' }
  }
  await fs.mkdir(run, { recursive: true })
  await fs.writeFile(`${run}/report.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(report, null, 2))
}
