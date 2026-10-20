// Explicitly invoked development-only QA. Importing this module performs no I/O.
// Auth creates its normal profile/user role; this script never accepts terms or
// writes profile claims, registrations, scores, prizes, wallets or payment data.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { generateTotpCode } from './e2e-totp.mjs'

const KIND = '2048-daily-development'
const PROJECT = 'jnoyjewsqbooqaiighcs'
const ORIGIN = 'https://torneos-dev.vercel.app'
const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactBase = path.join(candidate, 'artifacts', KIND)
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const keys = (value, expected) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join('|') === [...expected].sort().join('|')
const whole = value => Number.isSafeInteger(value) && value >= 0
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const chileDay = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Date.now())
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-')
}

export function validateDailyDevelopment(env, config) {
  assert.equal(config.name, 'torneos-dev')
  assert.equal(config.supabaseProjectRef, PROJECT)
  assert.ok(Array.isArray(config.protectedSupabaseProjectRefs) && !config.protectedSupabaseProjectRefs.includes(PROJECT))
  assert.equal(env.TORNEOS_ENV, 'cloud-development')
  assert.equal(env.DEVELOPMENT_SUPABASE_PROJECT_REF, PROJECT)
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${PROJECT}.supabase.co`)
  assert.ok(!env.SUPABASE_SERVER_URL || env.SUPABASE_SERVER_URL === env.NEXT_PUBLIC_SUPABASE_URL)
  assert.equal(env.APP_URL, ORIGIN)
  assert.equal(env.NEXT_PUBLIC_SITE_URL, ORIGIN)
  assert.equal(env.FLOW_API_BASE, 'https://sandbox.flow.cl/api')
  assert.equal(env.FLOW_API_KEY ?? '', '')
  assert.equal(env.FLOW_API_SECRET ?? '', '')
  assert.equal(env.RESEND_API_KEY ?? '', '')
  assert.ok(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  assert.ok(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)
}

export function validateDailyFixture(fixture) {
  assert.equal(fixture.version, 1)
  assert.equal(fixture.kind, KIND)
  assert.ok(uuid(fixture.runId))
  assert.ok(Number.isFinite(Date.parse(fixture.createdAt)))
  assert.equal(fixture.projectRef, PROJECT)
  assert.equal(fixture.appUrl, ORIGIN)
  assert.ok(day(fixture.baseline.day) && whole(fixture.baseline.profiles)
    && whole(fixture.baseline.walletTransactions) && whole(fixture.baseline.retentionAccounts))
  assert.equal(fixture.accounts.length, 2)
  assert.equal(new Set(fixture.accounts.map(account => account.id)).size, 2)
  for (const [index, account] of fixture.accounts.entries()) {
    assert.equal(account.label, ['A', 'B'][index])
    assert.ok(uuid(account.id))
    assert.equal(account.email, `qa2048_${fixture.runId.replaceAll('-', '')}_${account.label.toLowerCase()}@example.com`)
    assert.ok(typeof account.password === 'string' && account.password.length >= 32)
  }
  return fixture
}

export function assertOwnedDailyUser(user, fixture, account) {
  assert.ok(user && user.id === account.id && user.email === account.email && !user.is_anonymous)
  assert.deepEqual(user.app_metadata?.qa_2048_daily_development, { runId: fixture.runId, label: account.label })
  assert.ok(Date.parse(user.created_at) >= Date.parse(fixture.createdAt) - 60_000)
}

/** This run only checks today's immature cohort; it never fabricates D1/D7. */
export function assertDailyReport(value, expectedDay, withLimitations = true) {
  const expected = ['version', 'unit', 'source', 'cohortBasis', 'timezone', 'from', 'to', 'asOfChileDay', 'cohorts', 'totals']
  assert.ok(keys(value, withLimitations ? [...expected, 'limitations'] : expected))
  assert.equal(value.version, 1); assert.equal(value.unit, 'accounts')
  assert.equal(value.source, 'self_reported_first_valid_move')
  assert.equal(value.cohortBasis, 'first_known_activity_day')
  assert.equal(value.timezone, 'America/Santiago')
  assert.equal(value.from, expectedDay); assert.equal(value.to, expectedDay); assert.equal(value.asOfChileDay, expectedDay)
  assert.ok(Array.isArray(value.cohorts) && value.cohorts.length === 1)
  const cohort = value.cohorts[0]
  assert.ok(keys(cohort, ['cohortDay', 'accounts', 'day1', 'day7']))
  assert.equal(cohort.cohortDay, expectedDay)
  assert.ok(whole(cohort.accounts) && keys(value.totals, ['accounts', 'day1', 'day7']))
  assert.equal(value.totals.accounts, cohort.accounts)
  for (const entry of [cohort, value.totals]) for (const field of ['day1', 'day7']) {
    assert.ok(keys(entry[field], ['eligibleAccounts', 'returnedAccounts', 'rate']))
    assert.deepEqual(entry[field], { eligibleAccounts: 0, returnedAccounts: 0, rate: null })
  }
  if (withLimitations) assert.ok(Array.isArray(value.limitations) && value.limitations.length > 0
    && value.limitations.every(item => typeof item === 'string' && item.length < 1000))
  return { day: expectedDay, accounts: cohort.accounts, day1: cohort.day1, day7: cohort.day7 }
}

export function guestReportDenied(status, location) {
  if (status === 401) return true
  if (![301, 302, 303, 307, 308].includes(status) || !location) return false
  try { const target = new URL(location, ORIGIN); return target.origin === ORIGIN && target.pathname === '/sign-in' } catch { return false }
}

export function fixtureSqlChecks(fixture) {
  validateDailyFixture(fixture)
  return `-- READ ONLY. QA IDs are private; publish labels/counts only.\nSELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY rolname;\nSELECT conname,contype,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=to_regclass('private.player_2048_activity_days') ORDER BY conname;\nSELECT r.role,has_table_privilege(r.role,'private.player_2048_activity_days','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,has_function_privilege(r.role,'public.record_2048_player_activity(uuid,text)','EXECUTE') AS record,has_function_privilege(r.role,'public.report_2048_player_retention(date,date)','EXECUTE') AS report FROM (VALUES ('anon'),('authenticated')) r(role);\nSELECT has_schema_privilege('service_role','private','USAGE') AS schema_usage,has_table_privilege('service_role','private.player_2048_activity_days','SELECT') AS select_allowed,has_table_privilege('service_role','private.player_2048_activity_days','INSERT') AS insert_allowed,has_table_privilege('service_role','private.player_2048_activity_days','UPDATE') AS update_allowed,has_table_privilege('service_role','private.player_2048_activity_days','DELETE') AS delete_allowed;\nWITH qa(label,user_id) AS (VALUES ('A','${fixture.accounts[0].id}'::uuid),('B','${fixture.accounts[1].id}'::uuid)) SELECT qa.label,count(a.user_id) AS activity_rows,count(DISTINCT a.activity_day) AS distinct_days,coalesce(bool_or(a.practice),false) AS practice,coalesce(bool_or(a.daily),false) AS daily,coalesce(bool_and(a.first_seen_at<=a.last_seen_at),true) AS timestamp_order FROM qa LEFT JOIN private.player_2048_activity_days a ON a.user_id=qa.user_id GROUP BY qa.label ORDER BY qa.label;\n-- After cleanup: each own count must be zero; global baselines are supplied by root.\nSELECT (SELECT count(*) FROM auth.users WHERE id IN ('${fixture.accounts[0].id}','${fixture.accounts[1].id}')) AS owned_auth_users,(SELECT count(*) FROM public.profiles WHERE id IN ('${fixture.accounts[0].id}','${fixture.accounts[1].id}')) AS owned_profiles,(SELECT count(*) FROM private.player_2048_activity_days WHERE user_id IN ('${fixture.accounts[0].id}','${fixture.accounts[1].id}')) AS owned_activity_rows,(SELECT count(*) FROM public.profiles) AS total_profiles,(SELECT count(*) FROM public.wallet_transactions) AS total_wallet_transactions;\n`
}

const readJson = async filename => JSON.parse((await fs.readFile(filename, 'utf8')).replace(/^\uFEFF/, ''))
const writeNew = (filename, value) => fs.writeFile(filename, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const checked = async operation => { const { data, error } = await operation; assert.ok(!error); return data }
const countRows = async (service, table, column, id) => {
  let query = service.from(table).select('*', { count: 'exact', head: true })
  if (column) query = query.eq(column, id)
  const result = await query
  assert.ok(!result.error && whole(result.count))
  return result.count
}
const restrictedFetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  assert.equal(url.origin, `https://${PROJECT}.supabase.co`)
  return fetch(input, { ...init, redirect: 'error', signal: init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
}

async function login(env, account, actors) {
  const jar = new Map()
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { fetch: restrictedFetch }, cookieOptions: { name: `sb-${PROJECT}-auth-token` },
      auth: { autoRefreshToken: false }, cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: cookies => cookies.forEach(cookie => cookie.value ? jar.set(cookie.name, cookie.value) : jar.delete(cookie.name)),
      } })
  const actor = { jar, client }; actors.push(actor)
  const signed = await checked(client.auth.signInWithPassword({ email: account.email, password: account.password }))
  assert.ok(signed.user && !signed.user.is_anonymous)
  if (account.id) assert.equal(signed.user.id, account.id)
  const verified = await checked(client.auth.getUser())
  assert.equal(verified.user.id, signed.user.id)
  return actor
}

async function call(actor, route, body, origin = ORIGIN) {
  assert.ok(route.startsWith('/api/2048/') || route.startsWith('/api/admin/reports/2048-retention'))
  const headers = new Headers({ origin })
  if (actor) headers.set('cookie', [...actor.jar].map(([name, value]) => `${name}=${value}`).join('; '))
  if (body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(ORIGIN + route, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0], offset = pair.indexOf('=')
    if (offset > 0 && actor) {
      if (pair.slice(offset + 1)) actor.jar.set(pair.slice(0, offset), pair.slice(offset + 1))
      else actor.jar.delete(pair.slice(0, offset))
    }
  }
  const reader = response.body?.getReader(), chunks = []
  let size = 0
  if (reader) try {
    while (true) {
      const part = await reader.read(); if (part.done) break
      size += part.value.byteLength
      if (size > 128 * 1024) { await reader.cancel(); throw new Error('Response bound exceeded') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  let json = null
  try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { /* Only status is needed for denied requests. */ }
  return { status: response.status, headers: response.headers, json }
}

async function privateFixture(filename) {
  const resolved = path.resolve(filename), base = await fs.realpath(artifactBase)
  const stat = await fs.lstat(resolved)
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 128 * 1024)
  const real = await fs.realpath(resolved)
  assert.ok(real.startsWith(base + path.sep) && path.basename(real) === 'fixture.private.json')
  const fixture = validateDailyFixture(await readJson(real))
  assert.equal(path.basename(path.dirname(real)), fixture.runId)
  return { fixture, directory: path.dirname(real), filename: real }
}

const commercialDependencies = [
  ['wallet_transactions', 'user_id'], ['flow_payment_attempts', 'user_id'], ['flow_refund_attempts', 'user_id'],
  ['withdrawal_requests', 'user_id'], ['accounting_journal_entries', 'user_id'], ['registrations', 'user_id'],
  ['games', 'user_id'], ['tournaments', 'created_by'], ['tournament_results', 'user_id'],
]

export async function runDailyDevelopment(mode, options) {
  const context = { mode, phase: 'configuration', directory: null, checks: [], actors: [] }
  const report = () => ({ version: 1, task: KIND, mode, status: 'PASS', at: new Date().toISOString(),
    environment: 'torneos-dev', origin: ORIGIN, syntheticQaOnly: true, commercialRetentionMeasured: false,
    moneyOrFlow: false, termsAcceptedByScript: false, checks: context.checks,
    limitations: ['Direct requests verify Auth/API contracts; browser movement behavior is checked separately.',
      'D1/D7 maturity is not accelerated; current-day denominators remain zero.',
      'Private activity row/grant/cascade checks require root to execute the supplied read-only SQL.'] })
  const saveReport = value => writeNew(path.join(context.directory, `${mode}-${randomUUID()}.json`), value)
  try {
    assert.ok(['prepare', 'verify', 'cleanup'].includes(mode))
    const developmentRoot = path.resolve(options.developmentRoot)
    const env = parseEnv((await fs.readFile(path.join(developmentRoot, '.env.cloud-development.local'), 'utf8')).replace(/^\uFEFF/, ''))
    const config = await readJson(path.join(developmentRoot, 'config/cloud-development.json'))
    validateDailyDevelopment(env, config)
    const { validateCloudDevelopment } = await import(pathToFileURL(path.join(developmentRoot, 'scripts/check-cloud-development.mjs')).href)
    validateCloudDevelopment(env, config)
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: restrictedFetch } })
    let fixture
    if (mode === 'prepare') {
      context.phase = 'baseline'
      const today = chileDay()
      const baselineReport = assertDailyReport(await checked(service.rpc('report_2048_player_retention', { p_from: today, p_to: today })), today, false)
      const [profiles, walletTransactions] = await Promise.all([countRows(service, 'profiles'), countRows(service, 'wallet_transactions')])
      const runId = randomUUID()
      context.directory = path.join(artifactBase, runId)
      await fs.mkdir(artifactBase, { recursive: true })
      await fs.mkdir(context.directory, { mode: 0o700 })
      fixture = { version: 1, kind: KIND, runId, createdAt: new Date().toISOString(), projectRef: PROJECT, appUrl: ORIGIN,
        baseline: { day: today, profiles, walletTransactions, retentionAccounts: baselineReport.accounts },
        accounts: ['A', 'B'].map(label => ({ label, id: randomUUID(),
          email: `qa2048_${runId.replaceAll('-', '')}_${label.toLowerCase()}@example.com`, password: randomBytes(32).toString('base64url') + 'aA1!' })) }
      validateDailyFixture(fixture)
      await writeNew(path.join(context.directory, 'fixture.private.json'), fixture)
      await writeNew(path.join(context.directory, 'sql-checks.private.sql'), fixtureSqlChecks(fixture))
      context.phase = 'create_owned_auth_users'
      const cookies = { version: 1, appUrl: ORIGIN, accounts: {} }
      for (const account of fixture.accounts) {
        const { user } = await checked(service.auth.admin.createUser({ id: account.id, email: account.email, password: account.password,
          email_confirm: true, app_metadata: { qa_2048_daily_development: { runId, label: account.label } } }))
        assertOwnedDailyUser(user, fixture, account)
        assert.ok(user.email_confirmed_at)
        const actor = await login(env, account, context.actors)
        cookies.accounts[account.label] = [...actor.jar].map(([name, value]) => ({ name, value }))
      }
      await writeNew(path.join(context.directory, 'cookies.private.json'), cookies)
      context.checks.push({ name: 'two owned Auth users created and logged in', accounts: 2, explicitProfileRoleOrTermsWrites: false,
        automaticProfileAndUserRoleTrigger: true, cookiesForCliOnly: true })
      await saveReport(report())
      return { status: 'PASS', mode, fixture: path.join(context.directory, 'fixture.private.json'), privateCookies: path.join(context.directory, 'cookies.private.json') }
    }

    context.phase = 'validate_owned_fixture'
    assert.ok(options.fixture)
    const loaded = await privateFixture(options.fixture)
    fixture = loaded.fixture; context.directory = loaded.directory
    if (mode === 'verify') {
      for (const account of fixture.accounts) assertOwnedDailyUser((await checked(service.auth.admin.getUserById(account.id))).user, fixture, account)
      const [a, b] = await Promise.all(fixture.accounts.map(account => login(env, account, context.actors)))
      context.phase = 'public_daily_definition'
      const definition = await call(null, '/api/2048/daily'), repeat = await call(null, '/api/2048/daily'), authenticated = await call(a, '/api/2048/daily')
      for (const result of [definition, repeat, authenticated]) {
        assert.equal(result.status, 200); assert.match(result.headers.get('cache-control') ?? '', /no-store/)
        assert.ok(keys(result.json, ['id', 'day', 'seed', 'startsAt', 'closesAt', 'targetTile', 'rulesVersion', 'serverNow']))
        assert.ok(day(result.json.day)); assert.equal(result.json.targetTile, 128)
        assert.equal(result.json.rulesVersion, '2048-daily-v1')
        assert.ok(result.json.startsAt <= result.json.serverNow && result.json.serverNow < result.json.closesAt)
      }
      const stable = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'serverNow'))
      assert.deepEqual(stable(repeat.json), stable(definition.json)); assert.deepEqual(stable(authenticated.json), stable(definition.json))
      const today = definition.json.day
      assert.equal(today, fixture.baseline.day, 'A fixture crossing a Chile day needs a new run; never backdate activity')
      context.checks.push({ name: 'public daily shared definition', status: 200, day: today, sharedSeed: true, noStore: true })
      context.phase = 'write_guards'
      assert.equal((await call(null, '/api/2048/activity', { mode: 'practice' })).status, 401)
      assert.equal((await call(a, '/api/2048/activity', { mode: 'practice' }, 'https://invalid.example')).status, 403)
      for (const body of [{ mode: 'tournament' }, { mode: 'practice', userId: fixture.accounts[1].id }, { mode: 'daily', date: today }])
        assert.equal((await call(a, '/api/2048/activity', body)).status, 400)
      context.checks.push({ name: 'guest, cross-origin and forged activity rejected', statuses: [401, 403, 400] })
      context.phase = 'existing_operator_mfa'
      const credentials = parseEnv((await fs.readFile(options.operatorFile || path.join(developmentRoot, '.env.accounting-development-test.local'), 'utf8')).replace(/^\uFEFF/, ''))
      assert.ok(credentials.OPERATOR_EMAIL && credentials.SUPABASE_E2E_PASSWORD && credentials.TOTP_SECRET)
      const admin = await login(env, { email: credentials.OPERATOR_EMAIL, password: credentials.SUPABASE_E2E_PASSWORD }, context.actors)
      const route = `/api/admin/reports/2048-retention?from=${today}&to=${today}`
      const guest = await call(null, route)
      assert.ok(guestReportDenied(guest.status, guest.headers.get('location')))
      assert.equal((await call(a, route)).status, 403)
      const aal1 = await call(admin, route)
      assert.equal(aal1.status, 403); assert.equal(aal1.json?.mfaRequired, true)
      const factors = await checked(admin.client.auth.mfa.listFactors())
      const factor = credentials.ADMIN_MFA_FACTOR_ID ? factors.totp.find(entry => entry.id === credentials.ADMIN_MFA_FACTOR_ID)
        : factors.totp.length === 1 ? factors.totp[0] : null
      assert.ok(factor)
      await checked(admin.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: generateTotpCode(credentials.TOTP_SECRET) }))
      const assurance = await checked(admin.client.auth.mfa.getAuthenticatorAssuranceLevel())
      assert.equal(assurance.currentLevel, 'aal2')
      const readReport = async () => {
        const response = await call(admin, route)
        assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /no-store/)
        return assertDailyReport(response.json, today)
      }
      const before = await readReport()
      context.checks.push({ name: 'admin report role and existing MFA guards', guestDenied: true, playerStatus: 403, adminAal1Status: 403, adminAal2Status: 200 })
      context.phase = 'account_activity_and_deduplication'
      const record = async (actor, mode) => {
        const response = await call(actor, '/api/2048/activity', { mode })
        assert.equal(response.status, 200); assert.ok(keys(response.json, ['ok', 'activityDay']))
        assert.equal(response.json.ok, true); assert.equal(response.json.activityDay, today)
        assert.match(response.headers.get('cache-control') ?? '', /no-store/)
      }
      await record(a, 'practice')
      const first = await readReport()
      await record(a, 'practice'); await record(a, 'daily')
      assert.equal((await readReport()).accounts, first.accounts)
      await record(b, 'daily')
      const after = await readReport()
      assert.equal(after.accounts, fixture.baseline.retentionAccounts + 2)
      assert.ok(after.accounts >= before.accounts)
      assert.equal((await call(admin, route + '&asOf=2030-01-01')).status, 400)
      context.checks.push({ name: 'two accounts; repeat/modes share first-day cohort', beforeAccounts: before.accounts, afterAccounts: after.accounts,
        immatureDay1: after.day1, immatureDay7: after.day7, rowAndFlagConfirmation: 'root read-only SQL required' })
      await saveReport(report())
      return { status: 'PASS', mode, evidenceDirectory: context.directory, checks: context.checks.length }
    }

    context.phase = 'cleanup_evidence_precondition'
    const reports = (await fs.readdir(context.directory)).filter(name => /^(prepare|verify)-[a-f0-9-]+\.json$/.test(name))
    const prior = await Promise.all(reports.map(name => readJson(path.join(context.directory, name))))
    assert.ok(prior.some(entry => entry.task === KIND && (entry.mode === 'verify' || entry.mode === 'prepare' && entry.status === 'FAIL')),
      'Capture verification evidence before cleanup')
    let deletedAccounts = 0, alreadyAbsentAccounts = 0
    context.phase = 'cleanup_owned_profiles_then_auth'
    for (const account of fixture.accounts) {
      const found = await service.auth.admin.getUserById(account.id)
      if (found.error?.status === 404 || found.error?.code === 'user_not_found') {
        assert.equal(await countRows(service, 'profiles', 'id', account.id), 0)
        alreadyAbsentAccounts++; continue
      }
      assert.ok(!found.error); assertOwnedDailyUser(found.data.user, fixture, account)
      const counts = await Promise.all(commercialDependencies.map(([table, column]) => countRows(service, table, column, account.id)))
      assert.ok(counts.every(value => value === 0), 'Owned QA account acquired commercial dependencies; stop without deleting them')
      const profiles = await checked(service.from('profiles').delete().eq('id', account.id).select('id'))
      assert.ok(Array.isArray(profiles) && profiles.length <= 1)
      await checked(service.auth.admin.deleteUser(account.id, false))
      const absent = await service.auth.admin.getUserById(account.id)
      assert.ok(absent.error?.status === 404 || absent.error?.code === 'user_not_found')
      deletedAccounts++
    }
    const [profiles, walletTransactions] = await Promise.all([countRows(service, 'profiles'), countRows(service, 'wallet_transactions')])
    assert.equal(profiles, fixture.baseline.profiles); assert.equal(walletTransactions, fixture.baseline.walletTransactions)
    context.checks.push({ name: 'only owned profiles/Auth removed after zero commercial dependencies', deletedAccounts, alreadyAbsentAccounts,
      totalProfiles: profiles, totalWalletTransactions: walletTransactions, activityCascade: 'root read-only SQL required' })
    context.phase = 'remove_owned_private_files'
    for (const name of ['cookies.private.json', 'sql-checks.private.sql', 'fixture.private.json']) {
      const filename = path.join(context.directory, name)
      try { const stat = await fs.lstat(filename); assert.ok(stat.isFile() && !stat.isSymbolicLink()); await fs.unlink(filename) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    context.checks.push({ name: 'own private credentials/cookies/SQL removed; public evidence retained' })
    await saveReport(report())
    return { status: 'PASS', mode, evidenceDirectory: context.directory, checks: context.checks.length }
  } catch {
    const safe = { ...report(), status: 'FAIL', phase: context.phase, error: 'Verification did not complete; provider payloads and credentials are withheld.' }
    if (context.directory) try { await saveReport(safe) } catch { /* Never emit raw filesystem/provider errors. */ }
    return { status: 'FAIL', mode, phase: context.phase, ...(context.directory ? { evidenceDirectory: context.directory } : {}) }
  } finally {
    // Prepare cookies stay available for CLI use. Verify sessions are independent
    // of the root's UI/operator sessions and sign out only their own local session.
    if (mode === 'verify') for (const actor of context.actors) try { await actor.client.auth.signOut({ scope: 'local' }) } catch { /* No credentials in diagnostics. */ }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) console.log('Usage: node scripts/verify-2048-daily-development.mjs prepare|verify|cleanup --development-root C:/torneos [--fixture <candidate artifacts/.../fixture.private.json>] [--operator-file <existing private env file>]. No migration, deployment, emails, password resets or MFA enrollment.')
  else {
    const options = { developmentRoot: process.cwd() }
    let valid = ['prepare', 'verify', 'cleanup'].includes(args[0])
    for (let index = 1; index < args.length; index += 2) {
      const property = { '--development-root': 'developmentRoot', '--fixture': 'fixture', '--operator-file': 'operatorFile' }[args[index]]
      if (!property || !args[index + 1] || args[index + 1].startsWith('--')) { valid = false; break }
      options[property] = args[index + 1]
    }
    if (!valid) { console.error('Invalid verifier arguments. Use --help.'); process.exitCode = 1 }
    else {
      const result = await runDailyDevelopment(args[0], options)
      console.log(JSON.stringify(result))
      if (result.status !== 'PASS') process.exitCode = 1
    }
  }
}
