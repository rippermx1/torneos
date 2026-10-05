import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { validateTarget, privateTables } from './staging-preflight.mjs'

// Explicit Node --env-file only. Never loads .env.local or operates on Flow.
export function classifyRead({ status, error }) {
  // PostgREST HEAD errors may omit the JSON error body entirely.
  if (status === 403 || error?.code === '42501') return 'DENIED'
  if (status >= 200 && status < 300 && !error) return 'UNEXPECTED_ACCESS'
  return 'BLOCKED'
}
export async function probeIdentity(client, credentials, label, readRoles) {
  /** @type {Record<string,string>} */
  const privateReads = {}
  const result = { label, identity: 'NOT_RUN', role: 'NOT_RUN', mfa: 'NOT_RUN', private_table_reads: privateReads, seed_column: 'NOT_RUN', session_cleanup: 'NOT_RUN', current_aal: null, next_aal: null, verified_factors: 0, transport: 'NOT_RUN' }
  let signedIn = false
  try {
    const login = await client.auth.signInWithPassword(credentials)
    if (login.error || !login.data?.user?.id) { result.identity = 'FAIL'; return result }
    signedIn = true
    const verified = await client.auth.getUser()
    if (verified.error || verified.data?.user?.id !== login.data.user.id) { result.identity = 'FAIL'; return result }
    result.identity = 'PASS'
    result.transport = 'PASS'
    const roles = await readRoles(verified.data.user.id)
    result.role = roles && (label === 'operator' ? roles.some(role => ['owner','admin'].includes(role)) : !roles.some(role => ['owner','admin'].includes(role))) ? 'PASS' : 'FAIL'
    const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    const factors = await client.auth.mfa.listFactors()
    if (!aal.error && !factors.error) {
      result.current_aal = aal.data.currentLevel
      result.next_aal = aal.data.nextLevel
      result.verified_factors = factors.data.all.filter(factor => factor.status === 'verified').length
      result.mfa = label === 'operator' ? (aal.data.currentLevel === 'aal2' ? 'PASS' : 'CHALLENGE_NOT_RUN') : 'OBSERVED'
    }
    // Zero-row GET: the installed PostgREST client normalizes bodyless HEAD 404
    // into 200, so HEAD cannot distinguish a missing relation here.
    // No private rows are retrieved; missing schema remains BLOCKED.
    for (const table of privateTables) {
      const response = await client.from(table).select('*').limit(0)
      result.private_table_reads[table] = classifyRead(response)
    }
    result.seed_column = classifyRead(await client.from('games').select('seed').limit(0))
    return result
  } catch { result.transport = 'FAIL'; return result }
  finally {
    // Only the newly opened probe session; preserve other tasks' sessions and MFA.
    if (signedIn) {
      try { const { error } = await client.auth.signOut({ scope: 'local' }); result.session_cleanup = error ? 'FAIL' : 'PASS' }
      catch { result.session_cleanup = 'FAIL' }
    }
  }
}
export async function run(args, env = process.env) {
  const value = name => args[args.indexOf(name) + 1]
  for (const name of ['--project-ref','--production-ref','--app-url','--output']) if (!args.includes(name) || !value(name) || value(name).startsWith('--')) throw new Error('Explicit target arguments required')
  const target = { projectRef: value('--project-ref'), productionRef: value('--production-ref'), appUrl: value('--app-url') }
  validateTarget(target)
  const url = `https://${target.projectRef}.supabase.co`
  if (env.NEXT_PUBLIC_SUPABASE_URL !== url || (env.SUPABASE_SERVER_URL && env.SUPABASE_SERVER_URL !== url)) throw new Error('Supabase target mismatch')
  for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_E2E_PASSWORD','PLAYER_EMAIL','OPERATOR_EMAIL']) if (!env[name]) throw new Error('Missing explicit probe credentials')
  if (env.PLAYER_EMAIL.toLowerCase() === env.OPERATOR_EMAIL.toLowerCase()) throw new Error('Separate accounts required')
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) }) } }
  const server = createClient(url, env.SUPABASE_SECRET_KEY, options)
  const readRoles = async id => {
    const { data,error } = await server.from('profile_roles').select('role').eq('profile_id',id)
    return error ? null : data.map(row => row.role)
  }
  const probes = []
  for (const [label,email] of [['player',env.PLAYER_EMAIL],['operator',env.OPERATOR_EMAIL]]) {
    probes.push(await probeIdentity(createClient(url,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options), { email,password: env.SUPABASE_E2E_PASSWORD },label,readRoles))
  }
  const complete = probes.every(probe => probe.identity === 'PASS' && probe.role === 'PASS' && probe.seed_column === 'DENIED' && probe.session_cleanup === 'PASS' && Object.values(probe.private_table_reads).every(value => value === 'DENIED') && (probe.label !== 'operator' || probe.mfa === 'PASS'))
  const report = { schema: 1, status: complete ? 'PASS' : 'INCOMPLETE', verified_at: new Date().toISOString(), target, probes, production_decision: 'NO_GO', scope: 'live Auth password sessions, server getUser, trusted role reads and zero-row GET Data API checks; no MFA challenge, object uploads, application-session/E2E or financial mutations' }
  const output = value('--output'); fs.mkdirSync(path.dirname(output),{ recursive:true }); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  return report
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const report = await run(process.argv.slice(2)); console.log(JSON.stringify(report,null,2)); if (report.status !== 'PASS') process.exitCode = 1 }
  catch { console.error('Auth preflight rechazado: revisa destino y credenciales explícitas. No se imprimen errores remotos ni secretos.'); process.exitCode = 1 }
}
