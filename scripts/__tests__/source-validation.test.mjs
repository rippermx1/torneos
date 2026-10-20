import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { aggregate, assertSourcePaths, combineTestEvidence, copyVerifiedSourceSnapshot, createSourceManifest, hash, manifestForSourceDirectory,
  MAX_SOURCE_MANIFEST_BYTES, npmInvocation, parseValidationOptions, readSourceManifest, readSourceManifestFile, readTapEvidence, readVitestEvidence,
  runCommand, safeOutputDirectory, sourceValidationSteps, tapTestEnvironment, validationEnvironment, verifySourceSnapshot } from '../source-validation-core.mjs'
import { portAvailability, writeDiagnostic } from '../source-diagnostics.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = () => safeOutputDirectory(root, `artifacts/source-validation-tests/${randomUUID()}`)
test('children receive build placeholders and no credentials or execution injection from parent', () => {
  const env = validationEnvironment({ PATH: '/bin', ProgramFiles: 'C:/Program Files', ProgramData: 'C:/ProgramData', SUPABASE_SERVICE_ROLE_KEY: 'private', CRON_SECRET: 'private', FLOW_API_SECRET: 'private', GITHUB_TOKEN: 'private', NEXT_PUBLIC_SUPABASE_URL: 'https://remote.test', NODE_OPTIONS: '--require attacker.js', DOTNET_OPTIONS: '--malicious' })
  assert.equal(env.PATH, '/bin'); assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:65534')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'source-validation-placeholder')
  assert.equal(JSON.stringify(env).includes('private'), false); assert.equal('NODE_OPTIONS' in env, false)
  assert.equal(env.ProgramFiles, 'C:/Program Files'); assert.equal('ProgramData' in env, false); assert.equal('DOTNET_OPTIONS' in env, false)
})
test('private dotenv, licensed art, compiled runtime and traversal stop source validation', () => {
  assert.doesNotThrow(() => assertSourcePaths(['.env.production.example', 'games/2048/UnityProject/Assets/Art/tile.png', 'app/page.tsx']))
  for (const file of ['.env.local', 'sub/.env', 'public/games/2048/v1/Build/game.wasm', 'games/alien-run/UnityProject/Assets/KayKit/asset.png', 'games/alien-run/UnityProject/Assets/Orbit/AlienRun/LocalArt.meta', '../outside', '/outside']) {
    assert.throws(() => assertSourcePaths([file]), file)
  }
})
test('failure or missing checks cannot be summarized as a pass', () => {
  assert.equal(aggregate([]), 'FAIL'); assert.equal(aggregate([{status:'PASS'}]), 'PASS')
  assert.equal(aggregate([{status:'PASS'}, {status:'FAIL'}]), 'FAIL')
  assert.equal(aggregate([{status:'NOT_RUN'}]), 'FAIL')
})

function vitestFixture() {
  return { numTotalTestSuites: 2, numPassedTestSuites: 2, numFailedTestSuites: 0, numPendingTestSuites: 0,
    numTotalTests: 2, numPassedTests: 1, numFailedTests: 0, numPendingTests: 1, numTodoTests: 0, success: true,
    testResults: [{ name: '/isolated/tests/example.test.ts', status: 'passed', message: '', startTime: 1, endTime: 2,
      assertionResults: [{ status: 'passed', duration: 1, failureMessages: [] }, { status: 'skipped', failureMessages: [] }] }] }
}
function tapFixture(patch = {}, outcomes = ['ok 1 - executes', 'ok 2 - optional # SKIP']) {
  const counts = { tests: 2, pass: 1, fail: 0, cancelled: 0, skipped: 1, todo: 0, ...patch }
  return `> npm test\nTAP version 13\n${outcomes.join('\n')}\n1..${outcomes.length}\n`
    + Object.entries(counts).map(([key, count]) => `# ${key} ${count}\n`).join('')
}

test('Vitest evidence reconciles finite counters and assertion arrays without confusing suites with files', () => {
  assert.deepEqual(readVitestEvidence(JSON.stringify(vitestFixture())), { status: 'PASS', summary: {
    total: 2, passed: 1, failed: 0, pending: 1, todo: 0, executed: 1, files: 1, failedSuites: 0,
  } })
  for (const mutate of [value => { value.numPassedTests = -1 }, value => { value.numTotalTests = 3 },
    value => { value.numTotalTestSuites = 1 }, value => { value.testResults = null },
    value => { value.testResults[0].assertionResults = {} }, value => { value.testResults[0].assertionResults[0].duration = 'Infinity' },
    value => { value.testResults[0].assertionResults[0].failureMessages = 'private' },
    value => { value.testResults[0].assertionResults[0].status = 'unknown' }, value => { value.numPassedTests = null }]) {
    const value = vitestFixture(); mutate(value)
    assert.throws(() => readVitestEvidence(JSON.stringify(value)))
  }
  for (const raw of [null, '', '{}', '{', '[]', '{"numTotalTests":1e309}']) assert.throws(() => readVitestEvidence(raw))
})

test('Vitest success false, failed hooks and no executed assertions cannot become PASS', () => {
  for (const mutate of [value => { value.success = false }, value => { value.testResults[0].status = 'failed'; value.testResults[0].message = 'afterAll hook failed' },
    value => { value.numFailedTestSuites = 1; value.numPassedTestSuites = 1 },
    value => { value.testResults[0].assertionResults[0].failureMessages = ['unexpected failure'] },
    value => { value.numPassedTests = 0; value.numPendingTests = 2; value.testResults[0].assertionResults[0].status = 'skipped' }]) {
    const value = vitestFixture(); mutate(value)
    assert.equal(readVitestEvidence(JSON.stringify(value)).status, 'FAIL')
  }
  const failed = vitestFixture()
  failed.success = false; failed.numPassedTests = 0; failed.numFailedTests = 1
  failed.testResults[0].status = 'failed'; failed.testResults[0].assertionResults[0].status = 'failed'
  assert.equal(readVitestEvidence(JSON.stringify(failed)).summary.failed, 1)
})

test('TAP requires one coherent complete footer, a plan and actual execution', () => {
  assert.deepEqual(readTapEvidence(tapFixture()), { status: 'PASS', summary: {
    tests: 2, pass: 1, fail: 0, cancelled: 0, skipped: 1, todo: 0, executed: 1,
  } })
  for (const raw of [null, '', 'not TAP', tapFixture().replace('# cancelled 0\n', ''), tapFixture() + '# pass 1\n',
    tapFixture({ tests: 3 }), tapFixture({ tests: 3, pass: 2 }), tapFixture().replace('# pass 1', '# pass NaN'), tapFixture().replace('1..2', '1..3'),
    tapFixture().replace('ok 2 -', 'ok 3 -'), tapFixture() + 'Bail out! hook failed\n']) {
    assert.throws(() => readTapEvidence(raw))
  }
  assert.equal(readTapEvidence(tapFixture({ pass: 0, skipped: 2 })).status, 'FAIL')
  assert.equal(readTapEvidence(tapFixture({ pass: 0, fail: 1 }, ['not ok 1 - fails', 'ok 2 - optional # SKIP'])).status, 'FAIL')
  assert.equal(readTapEvidence(tapFixture({ pass: 0, cancelled: 1 }, ['not ok 1 - cancelled', 'ok 2 - optional # SKIP'])).status, 'FAIL')
  assert.equal(readTapEvidence(tapFixture({}, ['not ok 1 - hidden failure', 'ok 2 - optional # SKIP'])).status, 'FAIL')
})

test('a passing report never overrides a failed process or an unfinished integrity check', () => {
  const passing = readVitestEvidence(JSON.stringify(vitestFixture()))
  assert.equal(combineTestEvidence({ status: 'FAIL', code: 1 }, passing).status, 'FAIL')
  assert.equal(combineTestEvidence({ status: 'PASS', code: 0 }, { status: 'FAIL' }).status, 'FAIL')
  assert.equal(combineTestEvidence({ status: 'PASS', code: 0 }, passing).status, 'PASS')
  assert.equal(aggregate([{ status: 'PASS' }, { name: 'integrity-after', status: 'NOT_RUN' }]), 'FAIL')
  assert.equal(aggregate([{ status: 'PASS' }, { name: 'integrity-after', status: 'FAIL' }]), 'FAIL')
})

test('Snake package and lock declare mandatory install and backend tests before aggregation', () => {
  const files = ['package.json', 'package-lock.json', 'games/snake-arena/server/package.json', 'games/snake-arena/server/package-lock.json']
  const { snakeServer, names } = sourceValidationSteps(files)
  assert.equal(snakeServer, true)
  assert.deepEqual(names.slice(0, 5), ['integrity-before', 'install', 'install-snake-server', 'snake-server-tests', 'tests'])
  const checks = names.map(name => ({ name, status: 'PASS' }))
  checks.find(check => check.name === 'snake-server-tests').status = 'NOT_RUN'
  assert.equal(aggregate(checks), 'FAIL')
  checks.find(check => check.name === 'snake-server-tests').status = 'PASS'
  checks.find(check => check.name === 'install-snake-server').status = 'FAIL'
  assert.equal(aggregate(checks), 'FAIL')
  assert.throws(() => sourceValidationSteps(files.slice(0, -1)))
  assert.equal(sourceValidationSteps(files.slice(0, 2)).snakeServer, false)
  assert.equal(sourceValidationSteps(files.map(file => file.toUpperCase())).snakeServer, true)
})

test('all npm stages use structured cross-platform invocations without a shell', () => {
  const args = ['test', '--prefix', 'games/snake-arena/server']
  assert.deepEqual(npmInvocation(args, 'linux', '/usr/bin/node'), { command: 'npm', args })
  assert.deepEqual(npmInvocation(args, 'win32', 'C:\\Program Files\\nodejs\\node.exe'), {
    command: 'C:\\Program Files\\nodejs\\node.exe', args: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', ...args],
  })
})

test('nested Node test processes emit real TAP through the fixed safe environment on Node 24', () => {
  const sanitized = validationEnvironment({ PATH: process.env.PATH, NODE_OPTIONS: '--require secret.js', FLOW_API_SECRET: 'private' })
  const env = tapTestEnvironment(sanitized)
  assert.equal(env.NODE_OPTIONS, '--test-reporter=tap'); assert.equal('FLOW_API_SECRET' in env, false)
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import{test,describe}from'node:test';describe('suite',()=>{test('one',()=>{});test('two',()=>{})})"],
  { env, encoding: 'utf8', windowsHide: true })
  assert.equal(readTapEvidence(raw).status, 'PASS'); assert.equal(readTapEvidence(raw).summary.pass, 2)
})
test('child nonzero exit and timeout remain failures without executing shell arguments', async () => {
  const dir = await fixture()
  const fail = await runCommand(process.execPath, ['-e', 'process.exit(7)'], {cwd:dir,env:validationEnvironment(),log:path.join(dir,'fail.log')})
  assert.equal(fail.status, 'FAIL'); assert.equal(fail.code, 7)
  const timeout = await runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {cwd:dir,env:validationEnvironment(),log:path.join(dir,'timeout.log'),timeoutMs:100})
  assert.equal(timeout.status, 'FAIL'); assert.equal(timeout.timedOut, true)
})
test('outputs stay in new owned artifact directories and preserve previous evidence', async () => {
  const dir = await fixture()
  await assert.rejects(safeOutputDirectory(root, path.relative(root,dir)))
  await assert.rejects(safeOutputDirectory(root, '../outside'))
  const output = path.join(dir,'diagnostic.json')
  await writeDiagnostic(root,output,{auth:'NOT_RUN'})
  await assert.rejects(writeDiagnostic(root,output,{auth:'PASS'}))
  assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),{auth:'NOT_RUN'})
})
test('symlinked artifact parents cannot redirect output outside intended workspace', async () => {
  const dir = await fixture(), target = await fixture(), link = path.join(dir,'redirect')
  await fs.symlink(target,link,process.platform==='win32'?'junction':'dir')
  await assert.rejects(safeOutputDirectory(root,path.relative(root,path.join(link,'child'))))
  await assert.rejects(writeDiagnostic(root,path.join(link,'report.json'),{}))
})
test('TCP availability is a bounded loopback-only probe and says nothing about Auth', async t => {
  const server = net.createServer(socket => socket.end())
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  t.after(()=>server.close())
  const port = server.address().port
  assert.equal((await portAvailability(port)).status,'ACCEPTS_TCP')
  await new Promise(resolve => server.close(resolve))
  assert.equal((await portAvailability(port)).status,'UNAVAILABLE')
})

test('snapshot mode requires an external digest and cannot silently select HEAD', () => {
  const pinned = 'a'.repeat(64)
  assert.equal(parseValidationOptions([]).kind, 'commit')
  assert.equal(parseValidationOptions(['--ref', 'release']).ref, 'release')
  assert.deepEqual(parseValidationOptions(['--snapshot', 'candidate', '--manifest', 'source-manifest.json', '--expected-inventory', pinned]),
    { kind: 'snapshot', ref: 'HEAD', snapshot: 'candidate', manifest: 'source-manifest.json', expectedInventory: pinned, output: undefined })
  for (const args of [['--snapshot', 'candidate'], ['--manifest', 'source.json'], ['--expected-inventory', pinned],
    ['--ref', 'HEAD', '--snapshot', 'candidate', '--manifest', 'source.json', '--expected-inventory', pinned],
    ['--ref', 'HEAD', '--ref', 'other'], ['--unknown', 'value'], ['--output']]) assert.throws(() => parseValidationOptions(args))
})

test('portable inventory is canonical, pinned, strict and independent of input row order', () => {
  const a = { path: 'app/page.tsx', sha256: hash('a'), bytes: 1 }, b = { path: 'README.md', sha256: hash('b'), bytes: 1 }
  const manifest = createSourceManifest([a, b])
  assert.deepEqual(manifest, createSourceManifest([b, a]))
  assert.equal(manifest.inventorySha256, hash(`README.md\t${b.sha256}\napp/page.tsx\t${a.sha256}\n`))
  assert.deepEqual(readSourceManifest(JSON.stringify(manifest), manifest.inventorySha256), manifest)
  assert.throws(() => readSourceManifest(JSON.stringify(manifest), '0'.repeat(64)))
  for (const value of [{ ...manifest, version: 2 }, { ...manifest, summary: { status: 'PASS' } },
    { ...manifest, files: [{ ...a, token: 'private' }] }, { ...manifest, files: [{ ...a, bytes: -1 }] }]) {
    assert.throws(() => readSourceManifest(JSON.stringify(value), manifest.inventorySha256))
  }
  assert.throws(() => readSourceManifest(' '.repeat(MAX_SOURCE_MANIFEST_BYTES + 1), manifest.inventorySha256))
})

test('private context, runtime capsules, control paths and portable collisions remain forbidden even in a pinned manifest', () => {
  const row = file => ({ path: file, sha256: hash('a'), bytes: 1 })
  for (const file of ['.env.production', '.ENV.local', '.npmrc', '.NPMRC', '.git/config', '.vercel/project.json', '.VERCEL/project.json', '.next/cache/x', 'node_modules/x',
    'artifacts/report.json', 'key.pem', 'public/games/2048/unity-2048-007/index.html', '../outside', 'C:/outside',
    'a//b', './a', 'a/../b', 'folder/CON.txt', 'a\tb', 'a\nb', 'folder./x', 'a\\b', 'a?b', 'a*b', 'a|b', 'a<b']) {
    assert.throws(() => createSourceManifest([row(file)]), file)
  }
  assert.throws(() => createSourceManifest([row('app/Page.tsx'), row('app/page.tsx')]))
  assert.throws(() => createSourceManifest([row('app'), row('app/page.tsx')]))
  assert.doesNotThrow(() => createSourceManifest([row('games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Domain/Colony.cs'),
    row('games/snake-arena/UnityProject/Assets/Plugins/WebGL/SnakeArena.jslib')]))
})

async function snapshotFixture() {
  const parent = await fixture(), source = path.join(parent, 'input')
  await fs.mkdir(source)
  await fs.mkdir(path.join(source, 'app'))
  await fs.writeFile(path.join(source, 'app/page.tsx'), 'export default () => null\n')
  await fs.writeFile(path.join(source, 'package.json'), '{"private":true}\n')
  return { parent, source, manifest: await manifestForSourceDirectory(source) }
}

test('exact source copy preserves every byte and refuses mutation, extras, missing paths or overwrite', async () => {
  const { parent, source, manifest } = await snapshotFixture(), destination = path.join(parent, 'copy')
  await copyVerifiedSourceSnapshot(source, destination, manifest)
  assert.deepEqual(await manifestForSourceDirectory(destination), manifest)
  assert.deepEqual(await manifestForSourceDirectory(source), manifest)
  await assert.rejects(copyVerifiedSourceSnapshot(source, destination, manifest))
  await fs.writeFile(path.join(source, 'extra.txt'), 'extra')
  await assert.rejects(verifySourceSnapshot(source, manifest))
  await fs.unlink(path.join(source, 'extra.txt'))
  await fs.writeFile(path.join(source, 'package.json'), '{"private":false}\n')
  await assert.rejects(verifySourceSnapshot(source, manifest))
  await fs.unlink(path.join(source, 'package.json'))
  await assert.rejects(verifySourceSnapshot(source, manifest))
})

test('post-validation integrity allows generated output but never changed original source bytes', async () => {
  const { source, manifest } = await snapshotFixture()
  await fs.mkdir(path.join(source, '.next'))
  await fs.writeFile(path.join(source, '.next/output.json'), '{}')
  await verifySourceSnapshot(source, manifest, { exact: false })
  await assert.rejects(verifySourceSnapshot(source, manifest))
  await fs.writeFile(path.join(source, 'app/page.tsx'), 'export default () => 1\n')
  await assert.rejects(verifySourceSnapshot(source, manifest, { exact: false }))
})

test('copy rejects destinations inside the immutable snapshot before creating any path', async () => {
  const { source, manifest } = await snapshotFixture(), destination = path.join(source, 'copy')
  await assert.rejects(copyVerifiedSourceSnapshot(source, destination, manifest))
  await assert.rejects(fs.access(destination))
  assert.deepEqual(await manifestForSourceDirectory(source), manifest)
})

test('snapshot and manifest symlinked parents cannot redirect reads or copying', async () => {
  const { parent, source, manifest } = await snapshotFixture(), linked = path.join(parent, 'linked')
  await fs.symlink(source, linked, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(verifySourceSnapshot(linked, manifest))
  await assert.rejects(copyVerifiedSourceSnapshot(linked, path.join(parent, 'copy'), manifest))
  const manifestPath = path.join(source, 'source-manifest.json')
  await fs.writeFile(manifestPath, JSON.stringify(manifest))
  await assert.rejects(readSourceManifestFile(path.join(linked, 'source-manifest.json'), manifest.inventorySha256))
  const external = await fixture()
  await fs.symlink(external, path.join(source, 'nested'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(manifestForSourceDirectory(source))
})

test('CI only uploads public receipts and provisions .NET 8 without deploy or extra token permissions', async () => {
  const workflow = await fs.readFile(path.join(root, '.github/workflows/source-validation.yml'), 'utf8')
  assert.match(workflow, /contents: read/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /actions\/setup-dotnet@[a-f0-9]{40}/)
  assert.match(workflow, /dotnet-version: '8\.0\.x'/)
  assert.match(workflow, /artifacts\/ci-source\/source-manifest\.json/)
  assert.doesNotMatch(workflow, /secrets\.|contents: write|id-token: write|vercel deploy|git push|source\.tar|private\.log/)
})
