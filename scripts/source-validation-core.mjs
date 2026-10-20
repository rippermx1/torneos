import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'

export const MAX_SOURCE_MANIFEST_BYTES = 2 * 1024 * 1024
export const MAX_SOURCE_FILE_BYTES = 128 * 1024 * 1024
export const MAX_SOURCE_TOTAL_BYTES = 512 * 1024 * 1024
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const exactKeys = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const comparePaths = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0

export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function validationEnvironment(input = process.env) {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'ProgramFiles', 'DOTNET_ROOT', 'DOTNET_ROOT_X64']
  return { ...Object.fromEntries(allowed.filter(key => input[key]).map(key => [key, input[key]])),
    CI: '1', TZ: 'UTC', NEXT_TELEMETRY_DISABLED: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:65534', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'source-validation-placeholder',
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false' }
}
export function assertSourcePaths(files) {
  const seen = new Set()
  for (const file of files) {
    if (typeof file !== 'string' || !file || file.length > 512 || file.normalize('NFC') !== file
      || file.startsWith('/') || /[\\:\x00-\x1f\x7f<>"|?*]/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
        || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe source path')
    const folded = file.toLowerCase()
    if (seen.has(folded)) throw new Error('Duplicate or case-conflicting source path')
    seen.add(folded)
    if (/(^|\/)(?:\.git|\.vercel|\.next|node_modules|artifacts)(?:\/|$)/i.test(file)
      || /(^|\/)(?:\.npmrc|\.netrc|\.pypirc|\.yarnrc(?:\.yml)?)$/i.test(file)
      || /\.(?:pem|key|p12|pfx|pkcs12|keystore|jks)$/i.test(file)) throw new Error('Private context or generated output in source')
    if (/(^|\/)\.env[^/]*$/i.test(file) && !file.endsWith('.example')) throw new Error('Environment file tracked: source validation stopped')
    if (/^public\/games(?:\/|$)|\/Assets\/(ThirdParty|KayKit[^/]*|Kay Lousberg)\/|alien-run\/UnityProject\/Assets\/Orbit\/AlienRun\/LocalArt(\/|\.meta$)/i.test(file)) {
      throw new Error('Private or compiled game asset tracked: source validation stopped')
    }
  }
}

export function parseValidationOptions(args) {
  const values = new Map(), known = new Set(['--ref', '--snapshot', '--manifest', '--expected-inventory', '--output'])
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1]
    if (!known.has(key) || values.has(key) || typeof value !== 'string' || !value || value.startsWith('--')) throw new Error('Invalid source validation options')
    values.set(key, value)
  }
  const snapshot = values.get('--snapshot'), manifest = values.get('--manifest'), expectedInventory = values.get('--expected-inventory')
  if (snapshot ? values.has('--ref') || !manifest || !digest(expectedInventory) : manifest || expectedInventory) throw new Error('Snapshot requires manifest and pinned inventory, without ref')
  return { kind: snapshot ? 'snapshot' : 'commit', ref: values.get('--ref') ?? 'HEAD', snapshot, manifest, expectedInventory, output: values.get('--output') }
}

export function createSourceManifest(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 5000) throw new Error('Invalid source manifest')
  let size = 0
  const rows = files.map(file => {
    if (!exactKeys(file, ['path', 'sha256', 'bytes']) || !digest(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_SOURCE_FILE_BYTES) throw new Error('Invalid source manifest')
    size += file.bytes
    return { path: file.path, sha256: file.sha256, bytes: file.bytes }
  }).sort(comparePaths)
  if (size > MAX_SOURCE_TOTAL_BYTES) throw new Error('Source exceeds size bound')
  assertSourcePaths(rows.map(file => file.path))
  const paths = new Set(rows.map(file => file.path.toLowerCase()))
  for (const row of rows) {
    const parts = row.path.toLowerCase().split('/')
    for (let index = 1; index < parts.length; index++) if (paths.has(parts.slice(0, index).join('/'))) throw new Error('Conflicting source paths')
  }
  return { format: 'torneos.source-manifest', version: 1, files: rows,
    inventorySha256: hash(rows.map(file => `${file.path}\t${file.sha256}\n`).join('')) }
}

export function readSourceManifest(raw, expectedInventory) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_SOURCE_MANIFEST_BYTES || !digest(expectedInventory)) throw new Error('Invalid or unpinned source manifest')
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('Invalid source manifest') }
  if (!exactKeys(value, ['format', 'version', 'files', 'inventorySha256']) || value.format !== 'torneos.source-manifest' || value.version !== 1) throw new Error('Invalid source manifest')
  const manifest = createSourceManifest(value.files)
  if (manifest.inventorySha256 !== value.inventorySha256 || manifest.inventorySha256 !== expectedInventory) throw new Error('Source inventory mismatch')
  return manifest
}

async function safeExistingPath(value, directory) {
  const resolved = path.resolve(value), stat = await fs.lstat(resolved)
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || await fs.realpath(resolved) !== resolved) throw new Error('Source input must be a regular non-symlink path')
  return resolved
}

export async function readSourceManifestFile(file, expectedInventory) {
  const resolved = await safeExistingPath(file, false), stat = await fs.stat(resolved)
  if (stat.size > MAX_SOURCE_MANIFEST_BYTES) throw new Error('Source manifest exceeds size bound')
  return readSourceManifest(await fs.readFile(resolved, 'utf8'), expectedInventory)
}

async function sourceFiles(directory) {
  const root = await safeExistingPath(directory, true), files = []
  const visit = async (folder, prefix = '') => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name, absolute = path.join(folder, entry.name)
      assertSourcePaths([relative])
      const stat = await fs.lstat(absolute)
      if (stat.isSymbolicLink()) throw new Error('Source symlinks are forbidden')
      if (stat.isDirectory()) await visit(absolute, relative + '/')
      else if (stat.isFile()) files.push(relative)
      else throw new Error('Source special files are forbidden')
      if (files.length > 5000) throw new Error('Source exceeds file bound')
    }
  }
  await visit(root)
  assertSourcePaths(files)
  return { root, files }
}

async function readRegularSourceFile(absolute) {
  const resolved = await safeExistingPath(absolute, false)
  const file = await fs.open(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > MAX_SOURCE_FILE_BYTES) throw new Error('Source file exceeds size bound')
    const bytes = await file.readFile(), after = await file.stat()
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Source changed while reading')
    await safeExistingPath(absolute, false)
    return bytes
  } finally { await file.close() }
}

export async function manifestForSourceDirectory(directory) {
  const { root, files } = await sourceFiles(directory), rows = []
  let size = 0
  for (const relative of files) {
    const bytes = await readRegularSourceFile(path.join(root, relative))
    size += bytes.length
    if (size > MAX_SOURCE_TOTAL_BYTES) throw new Error('Source exceeds size bound')
    rows.push({ path: relative, sha256: hash(bytes), bytes: bytes.length })
  }
  return createSourceManifest(rows)
}

export async function verifySourceSnapshot(directory, manifest, { exact = true } = {}) {
  const checked = readSourceManifest(JSON.stringify(manifest), manifest.inventorySha256)
  const root = await safeExistingPath(directory, true)
  if (exact) {
    const actual = (await sourceFiles(root)).files.sort()
    if (JSON.stringify(actual) !== JSON.stringify(checked.files.map(file => file.path).sort())) throw new Error('Snapshot file set mismatch')
  }
  for (const row of checked.files) {
    const bytes = await readRegularSourceFile(path.join(root, row.path))
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) throw new Error('Snapshot source content mismatch')
  }
  return checked
}

export async function copyVerifiedSourceSnapshot(directory, destination, manifest) {
  const input = path.resolve(directory), target = path.resolve(destination)
  if (target === input || target.startsWith(input + path.sep) || input.startsWith(target + path.sep)) throw new Error('Source input and destination must be disjoint')
  await verifySourceSnapshot(input, manifest)
  if (await fs.realpath(path.dirname(target)) !== path.dirname(target)) throw new Error('Symlinked source destination')
  await fs.mkdir(target)
  for (const row of manifest.files) {
    const bytes = await readRegularSourceFile(path.join(directory, row.path))
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) throw new Error('Snapshot changed before copy')
    const file = path.resolve(target, row.path)
    if (!file.startsWith(target + path.sep)) throw new Error('Invalid source destination')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, bytes, { flag: 'wx' })
  }
  await verifySourceSnapshot(target, manifest)
  await verifySourceSnapshot(directory, manifest)
}
export function aggregate(checks) {
  return checks.length && checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL'
}

const whole = value => Number.isSafeInteger(value) && value >= 0
const invalidEvidence = () => { throw new Error('Invalid or missing test evidence') }
const evidenceText = raw => {
  if (typeof raw !== 'string' || !raw.trim() || Buffer.byteLength(raw, 'utf8') > 64 * 1024 * 1024) invalidEvidence()
}

export function readVitestEvidence(raw) {
  evidenceText(raw)
  let value
  try { value = JSON.parse(raw) } catch { invalidEvidence() }
  const counts = ['numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites',
    'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests']
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.success !== 'boolean'
    || counts.some(key => !whole(value[key])) || !Array.isArray(value.testResults) || !value.testResults.length
    || value.testResults.length > 5000 || value.numTotalTests > 1_000_000
    || value.numTotalTests !== value.numPassedTests + value.numFailedTests + value.numPendingTests + value.numTodoTests
    || value.numTotalTestSuites !== value.numPassedTestSuites + value.numFailedTestSuites + value.numPendingTestSuites
    || value.numTotalTestSuites < value.testResults.length) invalidEvidence()
  const actual = { passed: 0, failed: 0, pending: 0, todo: 0 }
  let failure = !value.success || value.numFailedTestSuites > 0
  for (const file of value.testResults) {
    if (!file || typeof file !== 'object' || !['passed', 'failed'].includes(file.status)
      || typeof file.name !== 'string' || !file.name || typeof file.message !== 'string'
      || !Number.isFinite(file.startTime) || file.startTime < 0 || !Number.isFinite(file.endTime) || file.endTime < file.startTime
      || !Array.isArray(file.assertionResults) || file.assertionResults.length > 1_000_000) invalidEvidence()
    failure ||= file.status === 'failed' || !!file.message
    for (const assertion of file.assertionResults) {
      if (!assertion || typeof assertion !== 'object' || !['passed', 'failed', 'pending', 'skipped', 'todo'].includes(assertion.status)
        || !Array.isArray(assertion.failureMessages) || assertion.failureMessages.some(message => typeof message !== 'string')
        || assertion.duration !== undefined && assertion.duration !== null && (!Number.isFinite(assertion.duration) || assertion.duration < 0)) invalidEvidence()
      const status = assertion.status === 'skipped' ? 'pending' : assertion.status
      actual[status]++
      failure ||= status === 'failed' || assertion.failureMessages.length > 0
    }
  }
  if (actual.passed !== value.numPassedTests || actual.failed !== value.numFailedTests || actual.pending !== value.numPendingTests
    || actual.todo !== value.numTodoTests) invalidEvidence()
  const executed = actual.passed + actual.failed
  return { status: !failure && executed > 0 ? 'PASS' : 'FAIL', summary: {
    total: value.numTotalTests, passed: actual.passed, failed: actual.failed, pending: actual.pending, todo: actual.todo,
    executed, files: value.testResults.length, failedSuites: value.numFailedTestSuites,
  } }
}

export function readTapEvidence(raw) {
  evidenceText(raw)
  const text = raw.replaceAll('\r\n', '\n')
  if ([...text.matchAll(/^TAP version 13$/gm)].length !== 1 || /^Bail out!/im.test(text)) invalidEvidence()
  const summary = {}
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...text.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))]
    if (matches.length !== 1 || !whole(Number(matches[0][1]))) invalidEvidence()
    summary[key] = Number(matches[0][1])
  }
  if (summary.tests !== summary.pass + summary.fail + summary.cancelled + summary.skipped + summary.todo) invalidEvidence()
  const plans = [...text.matchAll(/^1\.\.(\d+)(?:\s+#.*)?$/gm)]
  const outcomes = [...text.matchAll(/^(?:not )?ok (\d+)(?:[ \t]+(?:-[^\n]*|#[^\n]*))?$/gm)]
  if (plans.length !== 1 || !whole(Number(plans[0][1])) || outcomes.length !== Number(plans[0][1])
    || outcomes.some((match, index) => Number(match[1]) !== index + 1)) invalidEvidence()
  const suites = [...text.matchAll(/^# suites (\d+)$/gm)]
  if (suites.length > 1 || suites.length && !whole(Number(suites[0][1]))) invalidEvidence()
  const allOutcomes = [...text.matchAll(/^[ \t]*(?:not )?ok (\d+)(?:[ \t]+(?:-[^\n]*|#[^\n]*))?$/gm)]
  if (allOutcomes.length !== summary.tests + Number(suites[0]?.[1] ?? 0)) invalidEvidence()
  const failedOutcome = /^\s*not ok \d+(?:\s+-)?[^\n]*$/gm
  const unexpectedFailure = [...text.matchAll(failedOutcome)].some(match => !/\s+#\s*(?:TODO|SKIP)\b/i.test(match[0]))
  const executed = summary.pass + summary.fail + summary.cancelled
  return { status: executed > 0 && summary.fail === 0 && summary.cancelled === 0 && !unexpectedFailure ? 'PASS' : 'FAIL',
    summary: { ...summary, executed } }
}

/** Report metadata can only preserve or downgrade the process outcome. */
export function combineTestEvidence(result, evidence) {
  return { ...result, status: result.status === 'PASS' && evidence.status === 'PASS' ? 'PASS' : 'FAIL' }
}

export function sourceValidationSteps(files) {
  const paths = new Set(files.map(file => file.toLowerCase()))
  const snakePackage = paths.has('games/snake-arena/server/package.json'), snakeLock = paths.has('games/snake-arena/server/package-lock.json')
  if (snakePackage !== snakeLock) throw new Error('Snake server validation requires package and lock together')
  const nodeTests = files.filter(file => file.endsWith('.test.mjs'))
  const lintFiles = files.filter(file => /\.(mjs|[jt]sx?)$/.test(file) && !file.startsWith('public/'))
  return { snakeServer: snakePackage && snakeLock, nodeTests, lintFiles,
    names: ['integrity-before', 'install', ...(snakePackage ? ['install-snake-server', 'snake-server-tests'] : []),
      'tests', ...(nodeTests.length ? ['node-tests'] : []),
      ...Array.from({ length: Math.ceil(lintFiles.length / 100) }, (_, index) => `lint-${index + 1}`), 'build', 'types', 'integrity-after'] }
}

export function npmInvocation(args, platform = process.platform, execPath = process.execPath) {
  return platform === 'win32' ? { command: execPath, args: [path.win32.join(path.win32.dirname(execPath), 'node_modules/npm/bin/npm-cli.js'), ...args] }
    : { command: 'npm', args: [...args] }
}

// Node 24 may default to spec even through a pipe. Apply only this owned fixed
// option to npm test and its nested node --test; never forward parent NODE_OPTIONS.
export function tapTestEnvironment(env) {
  return { ...env, NODE_OPTIONS: '--test-reporter=tap' }
}

export async function runCommand(command, args, { cwd, env, log, timeoutMs = 600000 }) {
  const output = await fs.open(log, 'w')
  let timer
  try {
    const child = spawn(command, args, { cwd, env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', output.fd, output.fd] })
    const result = await new Promise(resolve => {
      let timedOut = false
      timer = setTimeout(() => {
        timedOut = true
        if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
        else { try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill() } }
      }, timeoutMs)
      child.once('error', error => resolve({ code: null, error: error.code ?? 'SPAWN_ERROR' }))
      child.once('exit', (code, signal) => resolve({ code, signal, timedOut }))
    })
    return { status: result.code === 0 && !result.timedOut ? 'PASS' : 'FAIL', ...result }
  } finally { clearTimeout(timer); await output.close() }
}
export async function safeOutputDirectory(root, value) {
  const artifacts = path.join(await fs.realpath(root), 'artifacts')
  await fs.mkdir(artifacts, { recursive: true })
  const output = path.resolve(root, value)
  const relative = path.relative(artifacts, output)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must be inside artifacts in a new directory')
  // Reject a symlinked parent before creating anything outside the workspace.
  let parent = path.dirname(output)
  while (parent !== artifacts) {
    try { if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error('Symlinked output parent') } catch (error) { if (error.code !== 'ENOENT') throw error }
    parent = path.dirname(parent)
  }
  if (await fs.realpath(artifacts) !== artifacts) throw new Error('Symlinked artifacts root')
  await fs.mkdir(path.dirname(output), { recursive: true })
  if (await fs.realpath(path.dirname(output)) !== path.dirname(output)) throw new Error('Symlinked output parent')
  await fs.mkdir(output) // Existing evidence is never overwritten.
  return output
}
