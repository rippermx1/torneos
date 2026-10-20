// Validate a committed tree or a pinned source snapshot in a fresh directory.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { aggregate, assertSourcePaths, combineTestEvidence, copyVerifiedSourceSnapshot, hash, manifestForSourceDirectory, MAX_SOURCE_FILE_BYTES, MAX_SOURCE_TOTAL_BYTES,
  npmInvocation, parseValidationOptions, readSourceManifestFile, readTapEvidence, readVitestEvidence, runCommand, safeOutputDirectory, sourceValidationSteps, tapTestEnvironment, validationEnvironment,
  verifySourceSnapshot } from './source-validation-core.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = parseValidationOptions(process.argv.slice(2))
const git = (list, encoding = 'utf8') => execFileSync('git', list, { cwd: root, encoding, windowsHide: true, maxBuffer: 128 * 1024 * 1024 })
const commit = options.kind === 'commit' ? git(['rev-parse', '--verify', '--end-of-options', `${options.ref}^{commit}`]).trim() : null
const tree = commit ? git(['rev-parse', `${commit}^{tree}`]).trim() : null
const entries = commit ? git(['ls-tree', '-rzl', '--full-tree', commit]).split('\0').filter(Boolean).map(value => {
  const separator = value.indexOf('\t'), header = value.slice(0, separator).trim().split(/\s+/), size = Number(header[3])
  if (separator < 0 || header.length !== 4 || !['100644', '100755'].includes(header[0]) || header[1] !== 'blob'
    || !/^[a-f0-9]{40,64}$/.test(header[2]) || !Number.isSafeInteger(size) || size < 0 || size > MAX_SOURCE_FILE_BYTES) throw new Error('Committed source links, special entries or oversized files are forbidden')
  return { path: value.slice(separator + 1), oid: header[2], size }
}) : []
if (commit) {
  assertSourcePaths(entries.map(entry => entry.path))
  if (!entries.length || entries.length > 5000 || entries.reduce((sum, entry) => sum + entry.size, 0) > MAX_SOURCE_TOTAL_BYTES) throw new Error('Committed source exceeds size bound')
}
const pinnedManifest = options.kind === 'snapshot' ? await readSourceManifestFile(options.manifest, options.expectedInventory) : null
const requestedOutput = options.output ?? `artifacts/source-validation/${randomUUID()}`
if (options.snapshot) {
  const input = path.resolve(options.snapshot), target = path.resolve(root, requestedOutput)
  if (input === target || target.startsWith(input + path.sep) || input.startsWith(target + path.sep)) throw new Error('Source input and validation output must be disjoint')
}
const output = await safeOutputDirectory(root, requestedOutput)
const source = path.join(output, 'source'), env = validationEnvironment()
const hosted = process.env.GITHUB_ACTIONS === 'true'
const report = { format: 'torneos.source-validation-receipt', version: 1, task: 'WEB-16.1', sourceKind: options.kind,
  commit, tree, node: process.version, platform: process.platform, execution: hosted ? 'GITHUB_ACTIONS' : 'LOCAL', at: new Date().toISOString(),
  scope: 'Exact source bytes in a new directory; fresh npm ci; no operating credentials or compiled Unity capsules. Capsule integrity is separate release evidence.', checks: [], status: 'NOT_RUN',
  integration: { auth: 'NOT_RUN', database: 'NOT_RUN', flow: 'NOT_RUN', unityRuntime: 'NOT_RUN', restore: 'NOT_RUN', githubHostedRun: hosted ? 'THIS_JOB' : 'NOT_RUN' } }
if (pinnedManifest) await copyVerifiedSourceSnapshot(options.snapshot, source, pinnedManifest)
else {
  await fs.mkdir(source)
  // Direct blobs avoid export-subst/export-ignore and checkout line-ending transformations.
  for (const entry of entries) {
    const destination = path.resolve(source, entry.path)
    if (!destination.startsWith(source + path.sep)) throw new Error('Invalid committed source destination')
    const bytes = git(['cat-file', 'blob', entry.oid], null)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, bytes, { flag: 'wx' })
  }
}
const sourceManifest = pinnedManifest ?? await manifestForSourceDirectory(source)
await verifySourceSnapshot(source, sourceManifest)
const manifestBytes = JSON.stringify(sourceManifest, null, 2) + '\n'
await fs.writeFile(path.join(output, 'source-manifest.json'), manifestBytes, { flag: 'wx' })
report.sourceInventorySha256 = sourceManifest.inventorySha256
report.sourceFiles = sourceManifest.files.length
report.sourceManifest = 'source-manifest.json'
report.sourceManifestSha256 = hash(manifestBytes)
if (pinnedManifest) report.expectedInventorySha256 = options.expectedInventory
const files = sourceManifest.files.map(file => file.path)
report.lockSha256 = hash(await fs.readFile(path.join(source, 'package-lock.json')))
const { nodeTests, lintFiles, snakeServer, names } = sourceValidationSteps(files)
report.checks = names.map(name => ({ name, status: name === 'integrity-before' ? 'PASS' : 'NOT_RUN' }))
await fs.writeFile(path.join(output, 'npm-user.config'), '')
await fs.writeFile(path.join(output, 'npm-global.config'), '')
env.NPM_CONFIG_USERCONFIG = path.join(output, 'npm-user.config')
env.NPM_CONFIG_GLOBALCONFIG = path.join(output, 'npm-global.config')
const home = path.join(output, 'home')
await fs.mkdir(home)
env.HOME = home; env.USERPROFILE = home; env.DOTNET_CLI_HOME = home
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
const execute = async (name, command, list, timeoutMs, commandEnv = env) => {
  const result = await runCommand(command, list, { cwd: source, env: commandEnv, log: path.join(output, `${name}.private.log`), timeoutMs })
  report.checks[report.checks.findIndex(check => check.name === name)] = { name, ...result }
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ ...report, status: aggregate(report.checks) }, null, 2) + '\n')
  console.log(`${name}: ${result.status}`)
  return result.status === 'PASS'
}
const executeNpm = (name, args, commandEnv = env) => { const invocation = npmInvocation(args); return execute(name, invocation.command, invocation.args, undefined, commandEnv) }
const captureTestEvidence = async (name, filename, reader, summaryKey) => {
  const index = report.checks.findIndex(check => check.name === name)
  try {
    const evidence = reader(await fs.readFile(path.join(output, filename), 'utf8'))
    report[summaryKey] = evidence.summary
    report.checks[index] = combineTestEvidence(report.checks[index], evidence)
  } catch {
    report.checks[index] = { ...report.checks[index], status: 'FAIL', error: 'TEST_EVIDENCE_MISSING_OR_INVALID' }
  }
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ ...report, status: aggregate(report.checks) }, null, 2) + '\n')
}
const installed = await executeNpm('install', ['ci', '--no-audit', '--no-fund'])
if (installed) {
  report.dependencies = {}
  for (const dependency of ['next', 'react', 'vitest', 'typescript', 'eslint']) report.dependencies[dependency] = JSON.parse(await fs.readFile(path.join(source, 'node_modules', dependency, 'package.json'), 'utf8')).version
  const bin = relative => path.join(source, 'node_modules', relative)
  if (snakeServer) {
    const snakeInstalled = await executeNpm('install-snake-server', ['ci', '--prefix', 'games/snake-arena/server', '--no-audit', '--no-fund'])
    if (snakeInstalled) {
      await executeNpm('snake-server-tests', ['test', '--prefix', 'games/snake-arena/server'], tapTestEnvironment(env))
      await captureTestEvidence('snake-server-tests', 'snake-server-tests.private.log', readTapEvidence, 'snakeServerTests')
    }
  }
  await execute('tests', process.execPath, [bin('vitest/vitest.mjs'), 'run', '--reporter=json', `--outputFile=${path.join(output, 'tests.private.json')}`])
  await captureTestEvidence('tests', 'tests.private.json', readVitestEvidence, 'tests')
  if (nodeTests.length) {
    await execute('node-tests', process.execPath, ['--test', '--test-reporter=tap', ...nodeTests])
    await captureTestEvidence('node-tests', 'node-tests.private.log', readTapEvidence, 'nodeTests')
  }
  for (let i = 0; i < lintFiles.length; i += 100) await execute(`lint-${i / 100 + 1}`, process.execPath, [bin('eslint/bin/eslint.js'), ...lintFiles.slice(i, i + 100)])
  await execute('build', process.execPath, [bin('next/dist/bin/next'), 'build', '--webpack'], 900000)
  await execute('types', process.execPath, [bin('typescript/bin/tsc'), '--noEmit', '--incremental', 'false'])
}
try {
  // Dependencies, build and test outputs may be generated; original declared bytes cannot change.
  await verifySourceSnapshot(source, sourceManifest, { exact: false })
  if (pinnedManifest) await verifySourceSnapshot(options.snapshot, sourceManifest)
  report.checks[report.checks.findIndex(check => check.name === 'integrity-after')] = { name: 'integrity-after', status: 'PASS' }
} catch {
  report.checks[report.checks.findIndex(check => check.name === 'integrity-after')] = { name: 'integrity-after', status: 'FAIL', error: 'SOURCE_CHANGED_DURING_VALIDATION' }
}
report.status = aggregate(report.checks)
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`Source validation ${report.status}: ${path.relative(root, output)}/summary.json`)
process.exitCode = report.status === 'PASS' ? 0 : 1
