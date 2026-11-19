// Close only the owner-authorized simulated scope; never certify a physical device or human comprehension.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { docker, sha256 } from './2048-integrity-local.mjs'

const files = {
  regressions: 'artifacts/2048-simulated/vitest.json',
  competitive: 'artifacts/2048-simulated/competitive.json',
  browser: 'artifacts/2048-simulated/browser.json',
  metrics: 'artifacts/2048-simulated/browser-metrics.json',
  delivery: 'artifacts/2048-simulated/delivery.json',
  closure: 'artifacts/2048-background/closed-verification.json',
}
const inputs = {}, hashes = {}
for (const [name, file] of Object.entries(files)) {
  const source = await readFile(file)
  inputs[name] = JSON.parse(source); hashes[file] = sha256(source)
}
const { regressions, competitive, browser, metrics, delivery, closure } = inputs
assert.equal(regressions.success, true); assert.equal(regressions.numFailedTests, 0)
assert.equal(regressions.numPendingTests, 0); assert.ok(regressions.numPassedTests >= 151)
assert.equal(competitive.status, 'PASS'); assert.equal(competitive.checks.length, 7)
assert.equal(browser.status, 'PASS'); assert.ok(browser.checks.length >= 10)
for (const check of [...competitive.checks, ...browser.checks]) assert.equal(check.status, 'PASS')
assert.equal(new Set(browser.layouts.map(item => `${item.viewport}/${item.view}`)).size, 6)
assert.ok(browser.layouts.every(item => !item.overflow && item.boardPreserved))
assert.equal(delivery.files.length, 6); assert.equal(metrics.build, 'unity-2048-007')
assert.equal(closure.status, 'PASS_PERSISTED_CLOSURE'); assert.deepEqual(closure.game, competitive.final)
assert.equal(competitive.realBrowserHidden, false); assert.equal(competitive.clockOrBoardDatabaseAdjustment, false)
const current = JSON.parse(docker(['inspect', 'torneos-app-1']))[0]
assert.equal(current.Image, competitive.imageId); assert.equal(current.State.Health.Status, 'healthy')
assert.ok(metrics.readyMs > 0 && metrics.readyMs < 90000)
assert.equal(metrics.metrics.length, 120)
assert.ok(metrics.metrics.every(item => item.usedWASMHeapSize > 0 && item.usedWASMHeapSize <= item.totalWASMHeapSize))
const fps = metrics.metrics.map(item => item.movingAverageFps).filter(Number.isFinite).sort((a, b) => a - b)
assert.ok(fps.length >= 100 && fps[Math.floor(fps.length / 2)] >= 30, 'PC regression baseline, not a phone SLA')
assert.ok(!metrics.events.some(item => ['game.error', 'contextLost'].includes(item.type)))
const report = {
  id: 'E28', at: new Date().toISOString(), status: 'COMPLETED_OWNER_ACCEPTED_SIMULATED_SCOPE',
  acceptanceDecision: { source: 'Direct owner request in this chat',
    request: 'puedes simular las pruebas? y en base a estar terminar los tickets?',
    change: 'Automated/simulated checks accepted for closing the four remaining local game tickets',
    originalPhysicalAndHumanAcceptanceExecuted: false },
  closedTasks: ['G2048-04.4', 'G2048-06.2', 'G2048-07.2', 'G2048-08.1'],
  closedParents: ['G2048-04', 'G2048-06', 'G2048-07', 'G2048-08'],
  runtime: { target: 'http://127.0.0.1:3081', imageId: current.Image, capsule: 'unity-2048-007', activatedNewImage: false },
  verification: {
    tests: regressions.numPassedTests, testFiles: 12, competitiveChecks: 7, authenticatedImmutableResultChecks: 3,
    browserChecks: browser.checks.length, uniqueViewportAndViewCombinations: 6,
    gzipHashMimeEtagFiles: 6, lint: 'PASS',
    finalGame: { id: competitive.final.id, status: competitive.final.status, score: competitive.final.final_score,
      moves: competitive.final.move_count, startedAt: competitive.final.started_at, endedAt: competitive.final.ended_at,
      endReason: competitive.final.end_reason },
    leaderboard: 'Observed provisional live ranking with the same score 4; no settlement performed',
  },
  measurements: { deviceClass: 'Windows PC, IAB Chromium, mobile viewport simulation', userAgent: metrics.userAgent,
    readyMs: metrics.readyMs, cacheColdControlled: false, samples: 120,
    medianMovingAverageFps: +fps[Math.floor(fps.length / 2)].toFixed(2),
    minimumMovingAverageFps: +fps[0].toFixed(2), maximumMovingAverageFps: +fps.at(-1).toFixed(2),
    reservedWasmMiB: Math.max(...metrics.metrics.map(item => item.totalWASMHeapSize)) / 1048576,
    peakUsedWasmMiB: +(Math.max(...metrics.metrics.map(item => item.usedWASMHeapSize)) / 1048576).toFixed(2),
    encodedBytes: delivery.encodedBytes, decodedBytes: delivery.decodedBytes },
  unmeasured: ['Physical Xiaomi/Android touch, battery, temperature and memory pressure',
    'Actual OS suspension or Chrome background tab lifecycle', 'Real screen reader speech and human comprehension',
    'External production release, paid operations and mobile network performance'],
  modifications: { unityOrPlayerSettings: false, schemaOrFlow: false, existingAccounts: false,
    externalDeployments: false, original3083Service: false,
    ownFixture: 'Previously unused E27 fixture consumed once through real authenticated game APIs' },
  artifacts: files, artifactSha256: hashes,
}
await writeFile('docs/2048-SIMULATED-ACCEPTANCE-EVIDENCE.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, tasks: report.closedTasks, measurements: report.measurements }))
