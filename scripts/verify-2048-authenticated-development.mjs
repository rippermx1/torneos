// Explicit development QA only. Importing this module performs no I/O.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { validateDailyDevelopment, assertDailyReport } from './verify-2048-daily-development.mjs'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

export const AUTHENTICATED_2048_KIND = '2048-authenticated-development'
const KIND = AUTHENTICATED_2048_KIND
const PROJECT = 'jnoyjewsqbooqaiighcs', PRODUCTION = 'baeylvoipmazcthnwxmz'
const ORIGIN = 'https://torneos-dev.vercel.app', MARKER = 'qa_2048_authenticated_development'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactBase = path.join(root, 'artifacts', KIND)
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
const exact = (value, fields) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
const whole = value => Number.isSafeInteger(value) && value >= 0
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const checked = async operation => { const result = await operation; assert.ok(!result.error, 'Service operation failed'); return result.data }
const readJson = async filename => JSON.parse((await fs.readFile(filename, 'utf8')).replace(/^\uFEFF/, ''))
const writeNew = (filename, value) => fs.writeFile(filename, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const chileDay = at => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
const accountEmail = (runId, label) => `qa2048auth_${runId.replaceAll('-', '')}_${label.toLowerCase()}@example.com`

export function validateAuthenticatedDevelopment(env, config) {
  validateDailyDevelopment(env, config)
  validateCloudDevelopment(env, config)
  assert.ok(config.protectedSupabaseProjectRefs.includes(PRODUCTION), 'Known production project must remain protected')
  assert.notEqual(config.supabaseProjectRef, PRODUCTION)
  if (env.PRODUCTION_SUPABASE_PROJECT_REF) assert.equal(env.PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION)
}
export function validateAuthenticatedFixture(fixture, now = Date.now()) {
  assert.ok(exact(fixture, ['version', 'kind', 'runId', 'createdAt', 'projectRef', 'appUrl', 'baseline', 'accounts']))
  assert.equal(fixture.version, 1); assert.equal(fixture.kind, KIND)
  assert.equal(fixture.projectRef, PROJECT); assert.equal(fixture.appUrl, ORIGIN)
  assert.ok(uuid(fixture.runId) && instant(fixture.createdAt) && Date.parse(fixture.createdAt) <= now + 60_000)
  assert.ok(exact(fixture.baseline, ['day', 'profiles', 'walletTransactions', 'retentionAccounts']) && date(fixture.baseline.day)
    && whole(fixture.baseline.profiles) && whole(fixture.baseline.walletTransactions) && whole(fixture.baseline.retentionAccounts))
  assert.ok(Array.isArray(fixture.accounts) && fixture.accounts.length === 2)
  assert.equal(new Set(fixture.accounts.map(account => account.id)).size, 2)
  for (const [index, account] of fixture.accounts.entries()) {
    assert.ok(exact(account, ['label', 'id', 'email', 'password']))
    assert.equal(account.label, ['A', 'B'][index]); assert.ok(uuid(account.id) && account.id !== fixture.runId)
    assert.equal(account.email, accountEmail(fixture.runId, account.label))
    assert.match(account.password, /^[A-Za-z0-9_\-!]{32,128}$/)
  }
  return fixture
}
export function assertOwnedAuthenticatedUser(user, fixture, account, now = Date.now()) {
  validateAuthenticatedFixture(fixture, now)
  assert.ok(fixture.accounts.some(owned => owned.id === account.id && owned.email === account.email && owned.label === account.label))
  assert.ok(user && user.id === account.id && user.email === account.email && user.is_anonymous === false)
  assert.deepEqual(user.app_metadata?.[MARKER], { runId: fixture.runId, label: account.label })
  assert.ok(!user.app_metadata?.qa_2048_training_development, 'Training synthetic users must not stand in for central activity QA')
  assert.ok(instant(user.created_at) && Date.parse(user.created_at) >= Date.parse(fixture.createdAt) - 60_000
    && Date.parse(user.created_at) <= Date.parse(fixture.createdAt) + 600_000 && Date.parse(user.created_at) <= now + 60_000)
  assert.ok(instant(user.email_confirmed_at))
}
export function assertNormalAuthenticatedProfile(profile, roles, account, allowMissing = false) {
  if (profile === null) { assert.ok(allowMissing); assert.deepEqual(roles, []); return }
  assert.ok(profile && profile.id === account.id)
  assert.equal(profile.username, `user_${account.id.replaceAll('-', '').slice(0, 8)}`)
  assert.equal(profile.is_admin, false); assert.equal(profile.is_banned, false); assert.equal(profile.kyc_status, 'pending')
  for (const field of ['full_name', 'rut', 'birth_date', 'phone', 'city', 'kyc_verified_at', 'terms_accepted_at', 'terms_version']) assert.equal(profile[field], null)
  assert.deepEqual(roles, [{ role: 'user' }])
}
export function createAuthenticatedRestrictedFetch(fetcher = globalThis.fetch) {
  return (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    assert.equal(url.origin, `https://${PROJECT}.supabase.co`)
    assert.ok(!url.username && !url.password && !url.hash)
    return fetcher(input, { ...init, redirect: 'error', signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
  }
}
const count = async (service, table, column, id) => {
  let query = service.from(table).select('*', { count: 'exact', head: true })
  if (column) query = query.eq(column, id)
  const result = await query
  assert.ok(!result.error && whole(result.count), 'Count unavailable')
  return result.count
}
const dependencies = [
  ['wallet_transactions', 'user_id'], ['flow_payment_attempts', 'user_id'], ['flow_refund_attempts', 'user_id'],
  ['withdrawal_requests', 'user_id'], ['accounting_journal_entries', 'user_id'], ['registrations', 'user_id'],
  ['games', 'user_id'], ['tournaments', 'created_by'], ['tournament_results', 'user_id'],
  ['kyc_submissions', 'user_id'], ['kyc_audit_events', 'user_id'], ['disputes', 'user_id'], ['player_ratings', 'profile_id'],
]
async function inspectOwned(service, fixture, account, now, allowMissing = false) {
  const found = await service.auth.admin.getUserById(account.id)
  if (found.error?.status === 404 || found.error?.code === 'user_not_found') {
    assert.ok(allowMissing); assert.equal(await count(service, 'profiles', 'id', account.id), 0)
    return { user: null, profile: null }
  }
  assert.ok(!found.error); assertOwnedAuthenticatedUser(found.data.user, fixture, account, now)
  const profile = await checked(service.from('profiles')
    .select('id,username,full_name,rut,birth_date,phone,city,kyc_status,kyc_verified_at,is_admin,is_banned,terms_accepted_at,terms_version')
    .eq('id', account.id).maybeSingle())
  const roles = await checked(service.from('profile_roles').select('role').eq('profile_id', account.id))
  assertNormalAuthenticatedProfile(profile, roles, account, allowMissing)
  for (const [table, column] of dependencies) assert.equal(await count(service, table, column, account.id), 0, 'Owned QA acquired dependencies; stop without deleting them')
  // Zero ledger transactions also proves the derived wallet balance is zero.
  return { user: found.data.user, profile }
}

export async function prepareAuthenticatedFixture(service, savePrivate, options = {}) {
  const now = options.now ?? Date.now, at = now(), today = chileDay(at)
  const report = assertDailyReport(await checked(service.rpc('report_2048_player_retention', { p_from: today, p_to: today })), today, false)
  const [profiles, walletTransactions] = await Promise.all([count(service, 'profiles'), count(service, 'wallet_transactions')])
  const newUuid = options.uuid ?? randomUUID, runId = newUuid()
  const fixture = { version: 1, kind: KIND, runId, createdAt: new Date(at).toISOString(), projectRef: PROJECT, appUrl: ORIGIN,
    baseline: { day: today, profiles, walletTransactions, retentionAccounts: report.accounts },
    accounts: ['A', 'B'].map(label => ({ label, id: newUuid(), email: accountEmail(runId, label),
      password: (options.password ?? (() => randomBytes(32).toString('base64url') + 'aA1!'))() })) }
  validateAuthenticatedFixture(fixture, now())
  await savePrivate(fixture) // Before creating anything: partial preparation remains attributable/cleanable.
  for (const account of fixture.accounts) {
    const data = await checked(service.auth.admin.createUser({ id: account.id, email: account.email, password: account.password,
      email_confirm: true, app_metadata: { [MARKER]: { runId, label: account.label } } }))
    assertOwnedAuthenticatedUser(data.user, fixture, account, now())
    await inspectOwned(service, fixture, account, now())
  }
  return fixture
}

export async function cleanupAuthenticatedFixture(service, fixture, options) {
  const now = options.now ?? Date.now
  validateAuthenticatedFixture(fixture, now())
  // Validate BOTH accounts before revoking/deleting either one.
  const owned = []
  for (const account of fixture.accounts) owned.push(await inspectOwned(service, fixture, account, now(), true))
  let deletedAccounts = 0, alreadyAbsentAccounts = 0
  for (const [index, account] of fixture.accounts.entries()) {
    if (!owned[index].user) { alreadyAbsentAccounts++; continue }
    const client = options.createAuthClient(), signed = await checked(client.auth.signInWithPassword({ email: account.email, password: account.password }))
    let verifiedOwnSession = false
    try {
      assertOwnedAuthenticatedUser(signed.user, fixture, account, now())
      assert.ok(typeof signed.session?.access_token === 'string' && signed.session.access_token.length > 0)
      const verified = await checked(client.auth.getUser(signed.session.access_token))
      assertOwnedAuthenticatedUser(verified.user, fixture, account, now()); verifiedOwnSession = true
      // 'global' is scoped to this verified owned user's JWT, never the operator or another user.
      await checked(service.auth.admin.signOut(signed.session.access_token, 'global'))
      await inspectOwned(service, fixture, account, now(), true)
      if (owned[index].profile) {
        const removed = await checked(service.from('profiles').delete().eq('id', account.id).select('id'))
        assert.ok(Array.isArray(removed) && removed.length <= 1 && removed.every(row => row.id === account.id))
      }
      // FK guards remain active. No cascades or dependency deletion are forced by the script.
      await checked(service.auth.admin.deleteUser(account.id, false))
      const absent = await service.auth.admin.getUserById(account.id)
      assert.ok(absent.error?.status === 404 || absent.error?.code === 'user_not_found')
      assert.equal(await count(service, 'profiles', 'id', account.id), 0)
      deletedAccounts++
    } finally {
      if (verifiedOwnSession) try { await client.auth.signOut({ scope: 'local' }) } catch { /* Own cleanup client only. */ }
    }
  }
  const [profiles, walletTransactions] = await Promise.all([count(service, 'profiles'), count(service, 'wallet_transactions')])
  return { deletedAccounts, alreadyAbsentAccounts, profiles, walletTransactions,
    baselineMatches: profiles === fixture.baseline.profiles && walletTransactions === fixture.baseline.walletTransactions,
    activityCascade: 'Root read-only SQL must confirm zero own rows; concurrent global changes are evidence, not a deletion gate.' }
}

/** Private SQL source contains fixture UUIDs; its output contains only A/B labels, counts and activity facts. */
export function fixtureReadOnlySql(fixture) {
  validateAuthenticatedFixture(fixture)
  return `-- READ ONLY; retain this SQL privately. No identifiers/emails in the result.\nWITH qa(label,user_id) AS (VALUES ('A','${fixture.accounts[0].id}'::uuid),('B','${fixture.accounts[1].id}'::uuid))\nSELECT jsonb_build_object('version',1,'kind','${KIND}','day',to_char(clock_timestamp() AT TIME ZONE 'America/Santiago','YYYY-MM-DD'),'accounts',jsonb_agg(jsonb_build_object('label',qa.label,'auth_users',(SELECT count(*) FROM auth.users u WHERE u.id=qa.user_id),'profiles',(SELECT count(*) FROM public.profiles p WHERE p.id=qa.user_id),'sessions',(SELECT count(*) FROM auth.sessions s WHERE s.user_id=qa.user_id),'activity_rows',(SELECT count(*) FROM private.player_2048_activity_days a WHERE a.user_id=qa.user_id),'activities',coalesce((SELECT jsonb_agg(jsonb_build_object('activity_day',a.activity_day,'practice',a.practice,'daily',a.daily,'first_seen_at',a.first_seen_at,'last_seen_at',a.last_seen_at) ORDER BY a.activity_day) FROM private.player_2048_activity_days a WHERE a.user_id=qa.user_id),'[]'::jsonb)) ORDER BY qa.label)) AS snapshot FROM qa;\n`
}
export function assertAuthenticatedActivitySnapshot(value, fixture) {
  validateAuthenticatedFixture(fixture)
  assert.ok(exact(value, ['version', 'kind', 'day', 'accounts']))
  assert.equal(value.version, 1); assert.equal(value.kind, KIND); assert.equal(value.day, fixture.baseline.day)
  assert.ok(Array.isArray(value.accounts) && value.accounts.length === 2)
  for (const [index, account] of value.accounts.entries()) {
    assert.ok(exact(account, ['label', 'auth_users', 'profiles', 'sessions', 'activity_rows', 'activities']))
    assert.equal(account.label, ['A', 'B'][index])
    for (const field of ['auth_users', 'profiles', 'sessions', 'activity_rows']) assert.ok(whole(account[field]))
    assert.ok(Array.isArray(account.activities) && account.activities.length === account.activity_rows && account.activities.length <= 2)
    for (const activity of account.activities) {
      assert.ok(exact(activity, ['activity_day', 'practice', 'daily', 'first_seen_at', 'last_seen_at']))
      assert.equal(activity.activity_day, value.day)
      assert.ok(typeof activity.practice === 'boolean' && typeof activity.daily === 'boolean' && (activity.practice || activity.daily))
      assert.ok(instant(activity.first_seen_at) && instant(activity.last_seen_at) && Date.parse(activity.first_seen_at) <= Date.parse(activity.last_seen_at))
    }
    assert.equal(new Set(account.activities.map(row => row.activity_day)).size, account.activities.length)
  }
  return value
}
export function assertAuthenticatedActivityTransition(before, after, fixture, expected) {
  assertAuthenticatedActivitySnapshot(before, fixture); assertAuthenticatedActivitySnapshot(after, fixture)
  assert.ok(['unchanged', 'practice', 'daily', 'dedup'].includes(expected))
  assert.deepEqual(after.accounts[1].activities, before.accounts[1].activities, 'Control account B must remain unchanged')
  const previous = before.accounts[0].activities, current = after.accounts[0].activities
  if (expected === 'unchanged') { assert.deepEqual(current, previous); return true }
  assert.equal(current.length, 1)
  const row = current[0]
  if (previous.length) {
    assert.equal(previous.length, 1); assert.equal(row.activity_day, previous[0].activity_day)
    assert.equal(row.first_seen_at, previous[0].first_seen_at)
    assert.ok(Date.parse(row.last_seen_at) >= Date.parse(previous[0].last_seen_at))
    assert.ok(!previous[0].practice || row.practice); assert.ok(!previous[0].daily || row.daily)
  }
  if (expected === 'practice') assert.equal(row.practice, true)
  if (expected === 'daily') assert.equal(row.daily, true)
  if (expected === 'dedup') { assert.equal(previous.length, 1); assert.equal(row.practice, previous[0].practice); assert.equal(row.daily, previous[0].daily) }
  return true
}

async function loadFixture(filename) {
  const stat = await fs.lstat(filename); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 65_536)
  const real = await fs.realpath(filename), base = await fs.realpath(artifactBase)
  const fixture = validateAuthenticatedFixture(await readJson(real))
  assert.equal(path.basename(real), 'fixture.private.json'); assert.equal(path.dirname(real), path.join(base, fixture.runId))
  return { fixture, directory: path.dirname(real) }
}
async function readOwnJson(filename, directory) {
  const stat = await fs.lstat(filename); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 262_144)
  const real = await fs.realpath(filename)
  assert.equal(path.dirname(real), directory); assert.ok(path.basename(real).endsWith('.private.json'))
  return readJson(real)
}
export async function runAuthenticatedDevelopment(mode, options) {
  let directory = null, phase = 'configuration'
  try {
    assert.ok(['prepare', 'snapshot', 'compare', 'cleanup'].includes(mode))
    const developmentRoot = path.resolve(options.developmentRoot)
    const env = parseEnv((await fs.readFile(path.join(developmentRoot, '.env.cloud-development.local'), 'utf8')).replace(/^\uFEFF/, ''))
    const config = await readJson(path.join(developmentRoot, 'config/cloud-development.json'))
    validateAuthenticatedDevelopment(env, config)
    const fetch = createAuthenticatedRestrictedFetch()
    const clientOptions = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } }
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, clientOptions)
    if (mode === 'prepare') {
      phase = 'prepare_owned_accounts'
      const fixture = await prepareAuthenticatedFixture(service, async fixture => {
        await fs.mkdir(artifactBase, { recursive: true })
        const baseStat = await fs.lstat(artifactBase); assert.ok(baseStat.isDirectory() && !baseStat.isSymbolicLink())
        directory = path.join(await fs.realpath(artifactBase), fixture.runId)
        await fs.mkdir(directory, { mode: 0o700 })
        await writeNew(path.join(directory, 'fixture.private.json'), fixture)
        await writeNew(path.join(directory, 'activity-read-only.private.sql'), fixtureReadOnlySql(fixture))
      })
      await writeNew(path.join(directory, 'prepare.json'), { kind: KIND, status: 'PASS', createdAccounts: 2, baseline: fixture.baseline,
        noTermsOrProfileClaimsWritten: true, noActivityOrCommercialWrites: true })
      return { status: 'PASS', mode, fixture: path.join(directory, 'fixture.private.json') }
    }
    phase = 'validate_fixture'
    const loaded = await loadFixture(options.fixture); directory = loaded.directory
    const fixture = loaded.fixture
    if (mode === 'snapshot') {
      phase = 'capture_root_sql_result'
      assert.match(options.label ?? '', /^[a-z][a-z0-9-]{0,39}$/)
      const activity = assertAuthenticatedActivitySnapshot(await readOwnJson(options.activityFile, directory), fixture)
      const filename = path.join(directory, `snapshot-${options.label}-${randomUUID()}.private.json`)
      await writeNew(filename, { version: 1, kind: KIND, runId: fixture.runId, label: options.label, activity })
      return { status: 'PASS', mode, snapshot: filename, accounts: 2 }
    }
    if (mode === 'compare') {
      phase = 'compare_root_sql_snapshots'
      const [before, after] = await Promise.all([readOwnJson(options.before, directory), readOwnJson(options.after, directory)])
      for (const snapshot of [before, after]) {
        assert.ok(exact(snapshot, ['version', 'kind', 'runId', 'label', 'activity']))
        assert.equal(snapshot.version, 1); assert.equal(snapshot.kind, KIND); assert.equal(snapshot.runId, fixture.runId)
      }
      assertAuthenticatedActivityTransition(before.activity, after.activity, fixture, options.expect)
      await writeNew(path.join(directory, `compare-${randomUUID()}.json`), { kind: KIND, status: 'PASS', expectation: options.expect,
        controlAccountUnchanged: true, noActivityWrittenByScript: true })
      return { status: 'PASS', mode, expectation: options.expect }
    }
    phase = 'cleanup_owned_accounts'
    const cleanup = await cleanupAuthenticatedFixture(service, fixture, { createAuthClient: () => createClient(env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions) })
    await writeNew(path.join(directory, `cleanup-${randomUUID()}.json`), { kind: KIND, status: 'PASS', ...cleanup })
    for (const filename of ['fixture.private.json', 'activity-read-only.private.sql']) {
      const own = path.join(directory, filename), stat = await fs.lstat(own)
      assert.ok(stat.isFile() && !stat.isSymbolicLink()); await fs.unlink(own)
    }
    return { status: 'PASS', mode, ...cleanup }
  } catch {
    const safe = { status: 'FAIL', mode, phase, error: 'QA operation did not complete; private data and provider errors are withheld.' }
    if (directory) try { await writeNew(path.join(directory, `failure-${randomUUID()}.json`), safe) } catch { /* No raw error output. */ }
    return safe
  }
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (main) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) console.log('Usage: prepare|snapshot|compare|cleanup --development-root C:/torneos [--fixture <own fixture.private.json>] [--label <stage> --activity-file <own SQL result.private.json>] [--before <own snapshot.private.json> --after <own snapshot.private.json> --expect unchanged|practice|daily|dedup]. SQL is read-only/root-executed. Never records activity, accepts terms, resets passwords, enrolls MFA or contacts Flow/email.')
  else {
    const options = { developmentRoot: process.cwd() }, flags = { '--development-root': 'developmentRoot', '--fixture': 'fixture',
      '--label': 'label', '--activity-file': 'activityFile', '--before': 'before', '--after': 'after', '--expect': 'expect' }
    let valid = ['prepare', 'snapshot', 'compare', 'cleanup'].includes(args[0])
    const seen = new Set()
    for (let index = 1; index < args.length; index += 2) {
      const property = flags[args[index]]
      if (!property || seen.has(property) || !args[index + 1] || args[index + 1].startsWith('--')) { valid = false; break }
      seen.add(property); options[property] = args[index + 1]
    }
    if (!valid) { console.error('Invalid verifier arguments; use --help.'); process.exitCode = 1 }
    else { const result = await runAuthenticatedDevelopment(args[0], options); console.log(JSON.stringify(result)); if (result.status !== 'PASS') process.exitCode = 1 }
  }
}
