// Validate one committed revision; never build the shared working tree or load its .env files.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { aggregate, assertSourcePaths, hash, runCommand, safeOutputDirectory, validationEnvironment } from './source-validation-core.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
if (args.some((arg, i) => !['--ref', '--output'].includes(arg) && !['--ref', '--output'].includes(args[i - 1]))) throw new Error('Usage: node scripts/validate-source.mjs [--ref COMMIT] [--output artifacts/NEW_DIRECTORY]')
for (const name of ['--ref', '--output']) if (args.includes(name) && (!option(name) || option(name).startsWith('--') || args.filter(arg => arg === name).length !== 1)) throw new Error('Missing or repeated option value')
const git = list => execFileSync('git', list, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
const commit = git(['rev-parse', '--verify', '--end-of-options', `${option('--ref') ?? 'HEAD'}^{commit}`])
const files = git(['ls-tree', '-r', '--name-only', commit]).split('\n')
assertSourcePaths(files)
const output = await safeOutputDirectory(root, option('--output') ?? `artifacts/source-validation/${randomUUID()}`)
const source = path.join(output, 'source'), env = validationEnvironment()
const report = { task: 'WEB-16.1', commit, node: process.version, platform: process.platform, at: new Date().toISOString(),
  scope: 'Committed source only; fresh npm ci, no operating environment or Unity bundles', checks: [], status: 'NOT_RUN',
  integration: { auth: 'NOT_RUN', database: 'NOT_RUN', flow: 'NOT_RUN', unityRuntime: 'NOT_RUN', restore: 'NOT_RUN', githubHostedRun: 'NOT_RUN' } }
await fs.mkdir(source)
git(['archive', '--format=tar', '-o', path.join(output, 'source.tar'), commit])
execFileSync('tar', ['-xf', path.join(output, 'source.tar'), '-C', source], { windowsHide: true })
report.lockSha256 = hash(await fs.readFile(path.join(source, 'package-lock.json')))
const nodeTests = files.filter(file => file.endsWith('.test.mjs'))
const lintFiles = files.filter(file => /\.(mjs|[jt]sx?)$/.test(file) && !file.startsWith('public/'))
const names = ['install', 'tests', ...(nodeTests.length ? ['node-tests'] : []), ...Array.from({length: Math.ceil(lintFiles.length / 100)}, (_, i) => `lint-${i + 1}`), 'build', 'types']
report.checks = names.map(name => ({name, status:'NOT_RUN'}))
await fs.writeFile(path.join(output, 'npm-user.config'), '')
await fs.writeFile(path.join(output, 'npm-global.config'), '')
env.NPM_CONFIG_USERCONFIG = path.join(output, 'npm-user.config')
env.NPM_CONFIG_GLOBALCONFIG = path.join(output, 'npm-global.config')
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
const execute = async (name, command, list, timeoutMs) => {
  const result = await runCommand(command, list, { cwd: source, env, log: path.join(output, `${name}.private.log`), timeoutMs })
  report.checks[report.checks.findIndex(check => check.name === name)] = { name, ...result }
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ ...report, status: aggregate(report.checks) }, null, 2) + '\n')
  console.log(`${name}: ${result.status}`)
  return result.status === 'PASS'
}
// npm-cli.js avoids cmd.exe argument quoting on Windows; fresh dependencies also avoid shared-cache edits.
const npm = process.platform === 'win32' ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') : null
const installed = await execute('install', npm ? process.execPath : 'npm', npm ? [npm, 'ci', '--no-audit', '--no-fund'] : ['ci', '--no-audit', '--no-fund'])
if (installed) {
  const bin = relative => path.join(source, 'node_modules', relative)
  await execute('tests', process.execPath, [bin('vitest/vitest.mjs'), 'run', '--reporter=json', `--outputFile=${path.join(output, 'tests.private.json')}`])
  try {
    const tests = JSON.parse(await fs.readFile(path.join(output, 'tests.private.json'), 'utf8'))
    report.tests = { passed: tests.numPassedTests, failed: tests.numFailedTests, pending: tests.numPendingTests, files: tests.testResults.length }
  } catch { /* Command failure remains FAIL; missing test details never become PASS. */ }
  if (nodeTests.length) {
    await execute('node-tests', process.execPath, ['--test', ...nodeTests])
    const tap = await fs.readFile(path.join(output, 'node-tests.private.log'), 'utf8')
    report.nodeTests = Object.fromEntries(['tests', 'pass', 'fail', 'skipped'].map(key => [key, Number([...tap.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))].at(-1)?.[1] ?? 0)]))
  }
  // Chunk Windows command lines without dropping any tracked source file.
  for (let i = 0; i < lintFiles.length; i += 100) await execute(`lint-${i / 100 + 1}`, process.execPath, [bin('eslint/bin/eslint.js'), ...lintFiles.slice(i, i + 100)])
  await execute('build', process.execPath, [bin('next/dist/bin/next'), 'build', '--webpack'], 900000)
  await execute('types', process.execPath, [bin('typescript/bin/tsc'), '--noEmit', '--incremental', 'false'])
}
report.status = aggregate(report.checks)
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`Source validation ${report.status}: ${path.relative(root, output)}/summary.json`)
process.exitCode = report.status === 'PASS' ? 0 : 1
