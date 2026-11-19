import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function validationEnvironment(input = process.env) {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'ComSpec']
  return { ...Object.fromEntries(allowed.filter(key => input[key]).map(key => [key, input[key]])),
    CI: '1', TZ: 'UTC', NEXT_TELEMETRY_DISABLED: '1', TORNEOS_ENVIRONMENT: 'local',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:65534', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'source-validation-placeholder',
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false' }
}
export function assertSourcePaths(files) {
  for (const file of files) {
    if (file.split('/').some(part => part === '..') || file.startsWith('/') || file.includes('\\')) throw new Error('Unsafe source path')
    if (/(^|\/)\.env[^/]*$/.test(file) && !file.endsWith('.example')) throw new Error('Environment file tracked: source validation stopped')
    if (/public\/games\/[^/]+\/[^/]+\/|\/Assets\/(ThirdParty|KayKit[^/]*|Kay Lousberg)\/|alien-run\/UnityProject\/Assets\/Orbit\/AlienRun\/LocalArt(\/|\.meta$)/i.test(file)) {
      throw new Error('Private or compiled game asset tracked: source validation stopped')
    }
  }
}
export function aggregate(checks) {
  return checks.length && checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL'
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
