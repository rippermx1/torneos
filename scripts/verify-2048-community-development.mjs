// Development-only synthetic QA. Import and --help perform no network I/O.
// Uses the ordinary community preset, account requirements and existing MFA.
// Profile DOB/terms are declared fixtures, never evidence of human consent.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { validateDailyDevelopment } from './verify-2048-daily-development.mjs'
import { validateCloudDevelopment } from './check-cloud-development.mjs'
import { generateTotpCode } from './e2e-totp.mjs'

const KIND = '2048-community-development'
const PROJECT = 'jnoyjewsqbooqaiighcs'
const ORIGIN = 'https://torneos-dev.vercel.app'
const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactBase = path.join(candidate, 'artifacts', KIND)
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
const readJson = async filename => JSON.parse((await fs.readFile(filename, 'utf8')).replace(/^\uFEFF/, ''))
const checked = async operation => { const result = await operation; if (result.error) throw Object.assign(new Error('PERSISTENCE_OPERATION_FAILED'), { code: cleanupCode(result.error) }); return result.data }
const writeNew = (filename, value) => fs.writeFile(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })

export function validateCommunityDevelopment(env, config) {
  validateCloudDevelopment(env, config)
  validateDailyDevelopment(env, config)
}

export function validateCommunityFixture(fixture) {
  assert.equal(fixture.version, 1); assert.equal(fixture.kind, KIND)
  assert.ok(uuid(fixture.runId)); assert.ok(Number.isFinite(Date.parse(fixture.createdAt)))
  assert.equal(fixture.projectRef, PROJECT); assert.equal(fixture.appUrl, ORIGIN)
  assert.equal(fixture.syntheticQaOnly, true); assert.equal(fixture.profileClaimsAreFixtures, true)
  assert.ok(['PREPARING', 'REGISTERED', 'PLAYING', 'COMPLETED', 'CLEANED'].includes(fixture.stage))
  assert.equal(fixture.accounts.length, 2)
  assert.equal(new Set(fixture.accounts.map(account => account.id)).size, 2)
  for (const [index, account] of fixture.accounts.entries()) {
    assert.equal(account.label, ['A', 'B'][index]); assert.ok(uuid(account.id))
    assert.equal(account.email, `qa2048community_${fixture.runId.replaceAll('-', '')}_${account.label.toLowerCase()}@example.com`)
    assert.ok(typeof account.password === 'string' && account.password.length >= 32)
  }
  if (fixture.tournamentId !== null) assert.ok(uuid(fixture.tournamentId) && uuid(fixture.operatorId))
  if (['REGISTERED', 'PLAYING', 'COMPLETED'].includes(fixture.stage)) assert.ok(uuid(fixture.tournamentId) && uuid(fixture.operatorId))
  return fixture
}

export function assertCommunityTournament(tournament, fixture) {
  validateCommunityFixture(fixture)
  assert.equal(tournament.id, fixture.tournamentId); assert.equal(tournament.created_by, fixture.operatorId)
  assert.equal(tournament.name, `2048 comunidad QA ${fixture.runId}`)
  assert.equal(tournament.description, `Prueba técnica sintética ${fixture.runId}; perfiles adultos y términos son fixtures, no consentimiento humano.`)
  for (const [key, value] of Object.entries({ preset_key: 'community_free_v1', business_rule_version: 4,
    tournament_type: 'freeroll', game_type: '2048_score', prize_model: 'fixed', is_test: false,
    entry_fee_cents: 0, prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0,
    prize_fund_bps: 5500, platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
    min_players: 2, max_players: 15, max_game_duration_seconds: 300, skill_tier: null })) assert.equal(tournament[key], value, key)
  assert.equal(Date.parse(tournament.play_window_end) - Date.parse(tournament.play_window_start), 86_400_000)
  assert.ok(Date.parse(tournament.registration_opens_at) < Date.parse(tournament.play_window_start))
  return tournament
}

export function assertOwnedCommunityUser(user, fixture, account) {
  validateCommunityFixture(fixture)
  assert.ok(user && user.id === account.id && user.email === account.email && !user.is_anonymous)
  assert.deepEqual(user.app_metadata?.qa_2048_community_development, { runId: fixture.runId, label: account.label })
  assert.ok(Date.parse(user.created_at) >= Date.parse(fixture.createdAt) - 60_000)
}

export function assertOwnedCommunityProfile(profile, user, fixture, account) {
  assertOwnedCommunityUser(user, fixture, account)
  assert.equal(profile.id, account.id)
  assert.ok(Date.parse(profile.created_at) >= Date.parse(fixture.createdAt) - 60_000)
  assert.equal(profile.is_admin, false); assert.equal(profile.is_banned, false)
  assert.equal(profile.kyc_status, 'pending')
  for (const field of ['rut', 'phone', 'city', 'kyc_verified_at']) assert.equal(profile[field], null)
  const seededUsername = `qa2048c_${fixture.runId.slice(0, 8)}_${account.label.toLowerCase()}`
  if (profile.username === seededUsername) {
    assert.equal(profile.full_name, 'QA synthetic community fixture')
    assert.equal(profile.birth_date, '1994-01-01'); assert.equal(profile.terms_version, '1.3')
    assert.ok(Date.parse(profile.terms_accepted_at) >= Date.parse(fixture.createdAt) - 60_000)
  } else {
    // Auth can commit before the seeding request succeeds or returns. Only its
    // exact fresh default profile is accepted alongside the verified QA marker.
    assert.equal(profile.username, `user_${account.id.replaceAll('-', '').slice(0, 8)}`)
    for (const field of ['full_name', 'birth_date', 'terms_version', 'terms_accepted_at']) assert.equal(profile[field], null)
  }
}

export function assertOwnedCommunityCreation(tournament, fixture) {
  const request = fixture.creationRequest
  assert.ok(request && uuid(fixture.operatorId))
  const resolved = { ...fixture, tournamentId: tournament.id }
  assertCommunityTournament(tournament, resolved)
  assert.ok(Date.parse(tournament.created_at) >= Date.parse(fixture.createdAt) - 60_000)
  for (const [field, key] of [['registration_opens_at', 'registrationOpensAt'], ['play_window_start', 'playWindowStart'], ['play_window_end', 'playWindowEnd']]) {
    assert.equal(Date.parse(tournament[field]), Date.parse(request[key]))
  }
  assert.equal(tournament.name, request.name); assert.equal(tournament.description, request.description)
  return resolved
}

export function validateCommunityRoute(route) {
  assert.ok(route === '/api/admin/tournaments'
    || /^\/api\/(?:admin\/)?tournaments\/[\da-f-]{36}\/(?:register|leaderboard|finalize|integrity|game\/(?:start|move|timeout))$/.test(route))
  assert.ok(!route.includes('checkout') && !route.includes('flow') && !route.includes('wallet'))
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
    { global: { fetch: restrictedFetch }, auth: { autoRefreshToken: false }, cookieOptions: { name: `sb-${PROJECT}-auth-token` },
      cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: cookies => cookies.forEach(cookie => cookie.value ? jar.set(cookie.name, cookie.value) : jar.delete(cookie.name)) } })
  const actor = { jar, client }; actors.push(actor)
  const signed = await checked(client.auth.signInWithPassword({ email: account.email, password: account.password }))
  assert.ok(signed.user && !signed.user.is_anonymous)
  if (account.id) assert.equal(signed.user.id, account.id)
  actor.userId = signed.user.id
  return actor
}

async function call(actor, route, body) {
  validateCommunityRoute(route)
  const headers = new Headers({ origin: ORIGIN })
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
  let bytes = 0
  if (reader) try {
    while (true) {
      const part = await reader.read(); if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 128 * 1024) { await reader.cancel(); throw new Error('Response bound exceeded') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  let json = null
  try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { /* A redirect/protected HTML response must fail status assertions. */ }
  return { status: response.status, json, headers: response.headers }
}

async function existingMfa(admin, credentials) {
  const factors = await checked(admin.client.auth.mfa.listFactors())
  const verified = factors.totp.filter(factor => factor.status === 'verified')
  const factor = credentials.ADMIN_MFA_FACTOR_ID ? verified.find(entry => entry.id === credentials.ADMIN_MFA_FACTOR_ID)
    : verified.length === 1 ? verified[0] : null
  assert.ok(factor, 'Select an existing verified factor; never enroll or reset MFA')
  await checked(admin.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: generateTotpCode(credentials.TOTP_SECRET) }))
  const level = await checked(admin.client.auth.mfa.getAuthenticatorAssuranceLevel())
  assert.equal(level.currentLevel, 'aal2')
}

async function privateFixture(filename) {
  const base = await fs.realpath(artifactBase), resolved = path.resolve(filename)
  const stat = await fs.lstat(resolved)
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 128 * 1024)
  const real = await fs.realpath(resolved)
  assert.ok(real.startsWith(base + path.sep) && path.basename(real) === 'fixture.private.json')
  const fixture = validateCommunityFixture(await readJson(real))
  assert.equal(path.basename(path.dirname(real)), fixture.runId)
  return { fixture, directory: path.dirname(real), filename: real }
}

async function count(service, table, column, value) {
  const result = await service.from(table).select('*', { count: 'exact', head: true }).eq(column, value)
  if (result.error) throw Object.assign(new Error('PERSISTENCE_OPERATION_FAILED'), { code: cleanupCode(result.error) })
  assert.ok(Number.isSafeInteger(result.count) && result.count >= 0)
  return result.count
}

async function zeroMoneyAndRatings(service, fixture) {
  const checks = fixture.tournamentId ? [
    ['wallet_transactions', 'reference_id', fixture.tournamentId], ['flow_payment_attempts', 'tournament_id', fixture.tournamentId],
    ['flow_refund_attempts', 'tournament_id', fixture.tournamentId], ['accounting_journal_entries', 'tournament_id', fixture.tournamentId],
  ] : []
  for (const account of fixture.accounts) for (const [table, column] of [
    ['wallet_transactions', 'user_id'], ['flow_payment_attempts', 'user_id'], ['flow_refund_attempts', 'user_id'],
    ['withdrawal_requests', 'user_id'], ['accounting_journal_entries', 'user_id'], ['player_ratings', 'profile_id'],
  ]) checks.push([table, column, account.id])
  for (const [table, column, value] of checks) assert.equal(await count(service, table, column, value), 0, table)
  return { wallet: 0, flow: 0, refunds: 0, withdrawals: 0, journal: 0, playerRatings: 0 }
}

async function ownedTournament(service, fixture) {
  return assertCommunityTournament(await checked(service.from('tournaments').select('*').eq('id', fixture.tournamentId).single()), fixture)
}
async function ownedGames(service, fixture) {
  const games = await checked(service.from('games').select('*').eq('tournament_id', fixture.tournamentId))
  assert.ok(Array.isArray(games) && games.length <= 2)
  assert.ok(games.every(game => fixture.accounts.some(account => account.id === game.user_id)))
  assert.equal(new Set(games.map(game => game.user_id)).size, games.length)
  return games
}

class CommunityCleanupFailure extends Error {
  constructor(diagnostic) { super('COMMUNITY_CLEANUP_FAILED'); this.diagnostic = diagnostic }
}

const cleanupCode = error => typeof error?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code)
  ? error.code : error?.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED'
    : Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? `HTTP_${error.status}` : 'UNCONFIRMED'

/** Diagnostics contain static labels/codes only, never error.message or rows. */
async function withCleanupTrace(service, task) {
  let step = 0, deleteRequested = false
  let current = { phase: 'preflight', step, table: 'fixture', operation: 'assert', assertion: 'OWNED_FIXTURE_REQUIRED' }
  const checkpoint = (table, operation, assertion) => {
    if (operation === 'delete' || operation === 'auth_delete') deleteRequested = true
    current = { phase: deleteRequested ? 'delete_requested' : 'preflight', step: ++step, table, operation, assertion }
  }
  try { return await task(service, checkpoint) }
  catch (error) { throw error instanceof CommunityCleanupFailure ? error : new CommunityCleanupFailure({ ...current, code: cleanupCode(error) }) }
}

/** Explicit owned-QA cleanup only. It does not cancel, settle, adopt or reset. */
export async function cleanupOwnedCommunityDevelopment(service, fixture, { allowPartialOwned = false } = {}) {
  return withCleanupTrace(service, async (service, checkpoint) => {
  validateCommunityFixture(fixture)
  assert.equal(typeof allowPartialOwned, 'boolean')
  if (!allowPartialOwned) assert.equal(fixture.stage, 'COMPLETED')
  const accounts = []
  // Validate every actor first; a mismatched second actor cannot cause deletion
  // of the first. Missing Auth is accepted only if its profile is also absent.
  for (const account of fixture.accounts) {
    checkpoint('auth.users', 'auth_select', 'OWNED_AUTH_READ')
    const found = await service.auth.admin.getUserById(account.id)
    const absent = found.error?.status === 404 || found.error?.code === 'user_not_found'
    assert.ok(absent || !found.error)
    const user = absent ? null : found.data.user
    checkpoint('profiles', 'select', 'OWNED_PROFILE_READ')
    const profile = await checked(service.from('profiles').select('*').eq('id', account.id).maybeSingle())
    checkpoint('auth.users', 'assert', 'AUTH_QA_MARKER_REQUIRED')
    if (user) assertOwnedCommunityUser(user, fixture, account)
    checkpoint('profiles', 'assert', 'OWNED_DEFAULT_OR_SEEDED_QA_PROFILE_REQUIRED')
    if (profile) { assert.ok(user, 'An orphan profile has no verifiable Auth ownership marker'); assertOwnedCommunityProfile(profile, user, fixture, account) }
    checkpoint('profile_roles', 'select', 'OWNED_ROLES_READ')
    const roles = await checked(service.from('profile_roles').select('role').eq('profile_id', account.id))
    checkpoint('profile_roles', 'assert', 'ONLY_QA_USER_ROLE_ALLOWED')
    assert.ok(Array.isArray(roles) && roles.length <= 1 && roles.every(row => row.role === 'user'))
    if (!user && !profile) assert.equal(roles.length, 0)
    if (!allowPartialOwned) assert.ok(user && profile)
    accounts.push({ account, user, profile })
  }
  let resolved = { ...fixture }, tournament = null
  if (fixture.tournamentId) {
    checkpoint('tournaments', 'select', 'OWNED_TOURNAMENT_READ')
    tournament = await checked(service.from('tournaments').select('*').eq('id', fixture.tournamentId).maybeSingle())
    if (tournament) {
      checkpoint('tournaments', 'assert', 'EXACT_OWNED_ZERO_VALUE_V4_FORMAT_REQUIRED')
      assertCommunityTournament(tournament, fixture)
      assert.ok(Date.parse(tournament.created_at) >= Date.parse(fixture.createdAt) - 60_000)
      if (fixture.creationRequest) assertOwnedCommunityCreation(tournament, fixture)
      if (fixture.playWindowStart) assert.equal(Date.parse(tournament.play_window_start), Date.parse(fixture.playWindowStart))
      if (fixture.playWindowEnd) assert.equal(Date.parse(tournament.play_window_end), Date.parse(fixture.playWindowEnd))
    }
  } else if (fixture.creationRequest) {
    checkpoint('tournaments', 'select', 'EXACT_CREATION_OUTCOME_READ')
    assert.ok(uuid(fixture.operatorId))
    const matches = await checked(service.from('tournaments').select('*').eq('name', fixture.creationRequest.name)
      .eq('created_by', fixture.operatorId).limit(2))
    assert.ok(Array.isArray(matches) && matches.length <= 1, 'Ambiguous creation outcome; do not adopt multiple events')
    if (matches.length) { tournament = matches[0]; resolved = assertOwnedCommunityCreation(tournament, fixture) }
  }
  if (!allowPartialOwned) assert.ok(tournament && tournament.status === 'completed')
  checkpoint('monetary_dependencies', 'select', 'ZERO_MONEY_AND_RATINGS_REQUIRED')
  await zeroMoneyAndRatings(service, resolved)
  checkpoint('games', 'select', 'OWNED_GAMES_READ')
  const games = tournament ? await ownedGames(service, resolved) : []
  checkpoint('registrations', 'select', 'OWNED_REGISTRATIONS_READ')
  const registrations = tournament ? await checked(service.from('registrations').select('*').eq('tournament_id', tournament.id).limit(3)) : []
  checkpoint('tournament_results', 'select', 'OWNED_RESULTS_READ')
  const results = tournament ? await checked(service.from('tournament_results').select('*').eq('tournament_id', tournament.id).limit(3)) : []
  for (const rows of [registrations, results]) assert.ok(Array.isArray(rows) && rows.length <= 2
    && rows.every(row => fixture.accounts.some(account => account.id === row.user_id)))
  for (const registration of registrations) {
    checkpoint('registrations', 'assert', 'ENTRY_FEE_MUST_BE_EXACTLY_ZERO')
    assert.equal(registration.entry_fee_cents, 0)
    // The legacy free-registration RPC leaves these inapplicable splits NULL.
    // No monetary amount, missing entry fee or other field is relaxed.
    for (const key of ['prize_fund_contribution_cents', 'platform_fee_gross_cents', 'platform_fee_net_cents', 'platform_fee_iva_cents']) {
      checkpoint('registrations', 'assert', `INAPPLICABLE_${key.toUpperCase()}_MUST_BE_NULL_OR_ZERO`)
      assert.ok(registration[key] === null || registration[key] === 0)
    }
  }
  checkpoint('tournament_results', 'assert', 'RESULT_PRIZES_MUST_BE_ZERO')
  assert.ok(results.every(row => row.prize_awarded_cents === 0))
  if (!allowPartialOwned) assert.ok(games.length === 2 && registrations.length === 2)
  for (const { account } of accounts) {
    for (const [table, rows] of [['registrations', registrations], ['games', games], ['tournament_results', results]]) {
      checkpoint(table, 'select', 'NO_PARTICIPATION_OUTSIDE_OWNED_EVENT')
      assert.equal(await count(service, table, 'user_id', account.id), rows.filter(row => row.user_id === account.id).length,
        'An owned QA account has dependencies outside the owned tournament')
    }
    checkpoint('tournaments', 'select', 'QA_ACCOUNT_CREATED_NO_OTHER_EVENT')
    assert.equal(await count(service, 'tournaments', 'created_by', account.id), 0)
    for (const table of ['kyc_submissions', 'kyc_audit_events', 'disputes']) {
      checkpoint(table, 'select', 'NO_IDENTITY_OR_DISPUTE_DEPENDENCY')
      assert.equal(await count(service, table, 'user_id', account.id), 0)
    }
  }
  // No mutating operation occurs above this point. Unexpected private integrity
  // FKs/guards intentionally stop these deletes; no review/sanction is removed.
  for (const game of games) { checkpoint('game_moves', 'delete', 'DELETE_OWNED_GAME_MOVES'); await checked(service.from('game_moves').delete().eq('game_id', game.id)) }
  if (tournament) {
    const userIds = fixture.accounts.map(account => account.id)
    for (const table of ['tournament_results', 'games', 'registrations']) {
      checkpoint(table, 'delete', 'DELETE_OWNED_GAMEPLAY_ROWS')
      await checked(service.from(table).delete().eq('tournament_id', tournament.id).in('user_id', userIds))
    }
    checkpoint('tournaments', 'delete', 'DELETE_EXACT_OWNED_EVENT')
    await checked(service.from('tournaments').delete().eq('id', tournament.id).eq('created_by', fixture.operatorId).eq('preset_key', 'community_free_v1'))
    assert.equal(await count(service, 'tournaments', 'id', tournament.id), 0)
  }
  for (const { account, user, profile } of accounts) {
    checkpoint('profiles', 'delete', 'DELETE_OWNED_QA_PROFILE')
    if (profile) await checked(service.from('profiles').delete().eq('id', account.id))
    checkpoint('auth.users', 'auth_delete', 'DELETE_OWNED_QA_AUTH')
    if (user) await checked(service.auth.admin.deleteUser(account.id, false))
    assert.equal(await count(service, 'profiles', 'id', account.id), 0)
    const absent = await service.auth.admin.getUserById(account.id)
    assert.ok(absent.error?.status === 404 || absent.error?.code === 'user_not_found')
  }
  return { tournamentId: tournament?.id ?? resolved.tournamentId, accountsRemoved: accounts.filter(account => account.user).length,
    profilesRemoved: accounts.filter(account => account.profile).length, gamesRemoved: games.length,
    registrationsRemoved: registrations.length, resultsRemoved: results.length, partialOwned: allowPartialOwned }
  })
}

export async function runCommunityDevelopment(mode, options) {
  const context = { phase: 'configuration', directory: null, actors: [], checks: [], cleanupDiagnostic: null }
  const report = (status = 'PASS') => ({ version: 1, task: KIND, mode, status, at: new Date().toISOString(),
    environment: 'torneos-dev', origin: ORIGIN, syntheticQaOnly: true, profileClaimsAreFixtures: true,
    humanConsentVerified: false, humanRetentionMeasured: false, moneyOrFlowRequested: false,
    moneyOrFlow: status === 'PASS' ? false : null,
    checks: context.checks, ...(context.cleanupDiagnostic ? { cleanupDiagnostic: context.cleanupDiagnostic } : {}),
    limitations: ['Synthetic accounts are technical fixtures, not audience or legal consent evidence.',
      'API checks do not prove Unity/phone/human acceptance; root captures browser evidence separately.',
      'The 24-hour window is unchanged. Finish uses existing protected early close only after both attempts naturally finish.',
      'Last-start/capacity boundaries use local route/SQL tests; no production clock or activity dates are changed.'] })
  const saveReport = status => writeNew(path.join(context.directory, `${mode}-${randomUUID()}.json`), report(status))
  try {
    assert.ok(['prepare', 'registered', 'play', 'finish', 'verify', 'cleanup'].includes(mode))
    assert.ok(options.browserRegistration === undefined || options.browserRegistration === true && mode === 'prepare')
    const developmentRoot = path.resolve(options.developmentRoot)
    const env = parseEnv((await fs.readFile(path.join(developmentRoot, '.env.cloud-development.local'), 'utf8')).replace(/^\uFEFF/, ''))
    validateCommunityDevelopment(env, await readJson(path.join(developmentRoot, 'config/cloud-development.json')))
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: restrictedFetch } })
    let fixture, filename
    if (mode === 'prepare') {
      const runId = randomUUID()
      context.directory = path.join(artifactBase, runId)
      await fs.mkdir(artifactBase, { recursive: true }); await fs.mkdir(context.directory, { mode: 0o700 })
      fixture = { version: 1, kind: KIND, runId, projectRef: PROJECT, appUrl: ORIGIN, stage: 'PREPARING',
        createdAt: new Date().toISOString(), syntheticQaOnly: true, profileClaimsAreFixtures: true, tournamentId: null,
        accounts: ['A', 'B'].map(label => ({ label, id: randomUUID(),
          email: `qa2048community_${runId.replaceAll('-', '')}_${label.toLowerCase()}@example.com`, password: randomBytes(32).toString('base64url') + 'aA1!' })) }
      validateCommunityFixture(fixture); filename = path.join(context.directory, 'fixture.private.json')
      await writeNew(filename, fixture)
      context.phase = 'create_owned_synthetic_profiles'
      for (const account of fixture.accounts) {
        const { user } = await checked(service.auth.admin.createUser({ id: account.id, email: account.email, password: account.password,
          email_confirm: true, app_metadata: { qa_2048_community_development: { runId, label: account.label },
            ...(options.browserRegistration ? { qa_2048_training_development: { runId } } : {}) } }))
        assertOwnedCommunityUser(user, fixture, account)
        await checked(service.from('profiles').update({ username: `qa2048c_${runId.slice(0, 8)}_${account.label.toLowerCase()}`,
          full_name: 'QA synthetic community fixture', birth_date: '1994-01-01', terms_version: '1.3',
          terms_accepted_at: new Date().toISOString() }).eq('id', account.id))
        assert.equal(await count(service, 'profile_roles', 'profile_id', account.id), 1)
        assert.equal(await count(service, 'player_ratings', 'profile_id', account.id), 0)
      }
    } else {
      const loaded = await privateFixture(options.fixture)
      fixture = loaded.fixture; filename = loaded.filename; context.directory = loaded.directory
      if (mode !== 'cleanup') {
        assert.notEqual(fixture.stage, 'CLEANED')
        for (const account of fixture.accounts) {
          const { user } = await checked(service.auth.admin.getUserById(account.id))
          assertOwnedCommunityUser(user, fixture, account)
        }
        if (fixture.tournamentId) await ownedTournament(service, fixture)
      }
    }
    const persist = () => fs.writeFile(filename, JSON.stringify(fixture, null, 2) + '\n', { mode: 0o600 })
    const players = {}
    if (mode !== 'cleanup') for (const account of fixture.accounts) players[account.label] = await login(env, account, context.actors)

    if (mode === 'prepare') {
      context.phase = 'existing_operator_mfa_and_creation'
      const credentials = parseEnv((await fs.readFile(options.operatorFile, 'utf8')).replace(/^\uFEFF/, ''))
      const admin = await login(env, { email: credentials.OPERATOR_EMAIL, password: credentials.SUPABASE_E2E_PASSWORD }, context.actors)
      const provisionalStart = Date.now() + (options.browserRegistration ? 600_000 : 90_000)
      const body = { name: `2048 comunidad QA ${fixture.runId}`,
        description: `Prueba técnica sintética ${fixture.runId}; perfiles adultos y términos son fixtures, no consentimiento humano.`,
        presetKey: 'community_free_v1', registrationOpensAt: new Date(Date.now() - 60_000).toISOString(),
        playWindowStart: new Date(provisionalStart).toISOString(), playWindowEnd: new Date(provisionalStart + 86_400_000).toISOString(), skillTier: null }
      assert.equal((await call(players.A, '/api/admin/tournaments', body)).status, 403)
      assert.equal((await call(admin, '/api/admin/tournaments', body)).status, 403)
      await existingMfa(admin, credentials)
      assert.equal((await call(admin, '/api/admin/tournaments', { ...body, entryFeeCents: 1 })).status, 400)
      const start = Date.now() + (options.browserRegistration ? 600_000 : 90_000)
      body.playWindowStart = new Date(start).toISOString(); body.playWindowEnd = new Date(start + 86_400_000).toISOString()
      // Persist exact ownership and intent before an API response can be lost.
      fixture.operatorId = admin.userId; fixture.creationRequest = { ...body }; await persist()
      const created = await call(admin, '/api/admin/tournaments', body)
      assert.equal(created.status, 201); assert.equal(created.json?.ok, true); assert.ok(uuid(created.json.tournamentId))
      fixture.tournamentId = created.json.tournamentId; fixture.operatorId = admin.userId
      await persist()
      const tournament = await ownedTournament(service, fixture)
      fixture.playWindowStart = tournament.play_window_start; fixture.playWindowEnd = tournament.play_window_end
      const labels = options.browserRegistration ? ['B'] : ['A', 'B']
      for (const label of labels) assert.equal((await call(players[label], `/api/tournaments/${fixture.tournamentId}/register`, {})).status, 200)
      if (!options.browserRegistration) assert.equal((await call(players.A, `/api/tournaments/${fixture.tournamentId}/register`, {})).status, 409)
      assert.equal(await count(service, 'registrations', 'tournament_id', fixture.tournamentId), labels.length)
      fixture.stage = options.browserRegistration ? 'PREPARING' : 'REGISTERED'; await persist()
      const cookies = { version: 1, appUrl: ORIGIN, accounts: Object.fromEntries(['A', 'B'].map(label => [label,
        [...players[label].jar].map(([name, value]) => ({ name, value, domain: new URL(ORIGIN).hostname, path: '/', secure: true, httpOnly: false, sameSite: 'Lax' }))])) }
      await writeNew(path.join(context.directory, 'cookies.private.json'), cookies)
      context.checks.push({ name: options.browserRegistration ? 'MFA normal creation; B registered, A explicitly left for real browser registration' : 'two synthetic adult/current-terms fixtures; MFA-only normal creation; duplicate registration',
        format: 'community_free_v1', isTest: false, registrationCount: labels.length, ...await zeroMoneyAndRatings(service, fixture) })
      await saveReport('PASS')
      return { status: 'PASS', mode, evidenceDirectory: context.directory, tournamentId: fixture.tournamentId,
        playWindowStart: fixture.playWindowStart, next: options.browserRegistration ? 'Root completes practice and registers A in browser, then invoke registered; no time acceleration.' : 'Root plays A with the real Unity UI, then invoke play (B via API).' }
    }

    const route = `/api/tournaments/${fixture.tournamentId}`
    if (mode === 'registered') {
      context.phase = 'confirm_actual_browser_registration'
      assert.equal(fixture.stage, 'PREPARING')
      const registrations = await checked(service.from('registrations').select('user_id').eq('tournament_id', fixture.tournamentId))
      assert.deepEqual(registrations.map(row => row.user_id).sort(), fixture.accounts.map(account => account.id).sort())
      assert.equal((await ownedGames(service, fixture)).length, 0)
      assert.equal((await call(players.A, `${route}/register`, {})).status, 409)
      fixture.stage = 'REGISTERED'; await persist()
      context.checks.push({ name: 'Browser A registration persisted; duplicate denied, two owned zero-money registrations',
        registrationCount: 2, ...await zeroMoneyAndRatings(service, fixture) })
      await saveReport('PASS')
      return { status: 'PASS', mode, evidenceDirectory: context.directory, playWindowStart: fixture.playWindowStart }
    }
    if (mode === 'play') {
      context.phase = 'natural_start_and_server_moves'
      assert.equal(fixture.stage, 'REGISTERED')
      assert.ok(Date.now() >= Date.parse(fixture.playWindowStart), 'Invoke after the actual start; do not change clock/dates')
      const before = await ownedGames(service, fixture)
      const uiGame = before.find(game => game.user_id === fixture.accounts[0].id)
      assert.ok(uiGame && uiGame.move_count > 0, 'Root must first play account A through Unity; API does not invent UI evidence')
      const started = await call(players.B, `${route}/game/start`, {})
      assert.equal(started.status, 200); assert.ok(uuid(started.json?.gameId))
      let snapshot = started.json
      const duplicateStart = await call(players.B, `${route}/game/start`, {})
      assert.equal(duplicateStart.status, 200); assert.equal(duplicateStart.json?.gameId, snapshot.gameId)
      assert.equal(duplicateStart.json?.deadlineAt, snapshot.deadlineAt)
      const forged = await call(players.B, `${route}/game/move`, { gameId: snapshot.gameId,
        direction: 'left', moveNumber: snapshot.moveNumber, clientTimestamp: Date.now(), score: 9_999_999 })
      assert.equal(forged.status, 400)
      for (const direction of ['left', 'up', 'right', 'down']) {
        const moved = await call(players.B, `${route}/game/move`, { gameId: snapshot.gameId, direction,
          moveNumber: snapshot.moveNumber, clientTimestamp: Date.now() })
        assert.equal(moved.status, 200); snapshot = { ...snapshot, ...moved.json }
      }
      const recovered = await call(players.B, `${route}/game/start`, { recoverOnly: true, gameId: snapshot.gameId })
      assert.equal(recovered.status, 200); assert.equal(recovered.json?.gameId, snapshot.gameId)
      assert.equal(recovered.json?.deadlineAt, snapshot.deadlineAt); assert.equal(recovered.json?.score, snapshot.score)
      const games = await ownedGames(service, fixture)
      assert.equal(games.length, 2); assert.ok(games.every(game => game.move_count > 0 && game.status === 'active'))
      fixture.gameIds = games.map(game => game.id)
      fixture.deadlines = games.map(game => new Date(Date.parse(game.started_at) + 300_000).toISOString())
      fixture.stage = 'PLAYING'; await persist()
      const provisional = await call(players.A, `${route}/leaderboard`)
      assert.equal(provisional.status, 200); assert.equal(provisional.json?.phase, 'provisional'); assert.equal(provisional.json.rows.length, 2)
      context.checks.push({ name: 'one server-created attempt each; directions, forged score denial, recovery and provisional ranking',
        gameCount: games.length, awaitNaturalDeadline: fixture.deadlines, ...await zeroMoneyAndRatings(service, fixture) })
      await saveReport('PASS')
      return { status: 'PASS', mode, evidenceDirectory: context.directory, deadlines: fixture.deadlines,
        next: 'Invoke finish after both original deadlines; this script never sleeps or accelerates timestamps.' }
    }

    if (mode === 'finish' || mode === 'verify') {
      context.phase = 'natural_timeout_existing_mfa_and_official_results'
      assert.equal(fixture.stage, mode === 'finish' ? 'PLAYING' : 'COMPLETED')
      if (mode === 'finish') assert.ok(fixture.deadlines.every(deadline => Date.now() >= Date.parse(deadline)))
      const credentials = parseEnv((await fs.readFile(options.operatorFile, 'utf8')).replace(/^\uFEFF/, ''))
      const admin = await login(env, { email: credentials.OPERATOR_EMAIL, password: credentials.SUPABASE_E2E_PASSWORD }, context.actors)
      assert.equal(admin.userId, fixture.operatorId)
      assert.equal((await call(players.A, `/api/admin/tournaments/${fixture.tournamentId}/finalize`, {})).status, 403)
      assert.equal((await call(admin, `/api/admin/tournaments/${fixture.tournamentId}/finalize`, {})).status, 403)
      await existingMfa(admin, credentials)
      if (mode === 'finish') {
        const awaitingClosure = await ownedGames(service, fixture)
        if (awaitingClosure.some(game => game.status !== 'completed')) {
          assert.equal((await call(admin, `/api/admin/tournaments/${fixture.tournamentId}/finalize`, {})).status, 400)
          assert.equal((await ownedTournament(service, fixture)).status, 'live')
          context.checks.push({ name: 'AAL2 early finalization denied until every registered game is actually completed' })
        }
        for (const account of fixture.accounts) {
          const game = (await ownedGames(service, fixture)).find(entry => entry.user_id === account.id)
          assert.ok(game)
          const timedOut = await call(players[account.label], `${route}/game/timeout`, { gameId: game.id })
          assert.equal(timedOut.status, 200); assert.equal(timedOut.json?.status, 'completed'); assert.equal(timedOut.json.endReason, 'timeout')
        }
        const inspection = await call(admin, `/api/admin/tournaments/${fixture.tournamentId}/integrity`)
        assert.equal(inspection.status, 200)
        assert.ok(Array.isArray(inspection.json.reviews) && inspection.json.reviews.every(review => review.decision !== 'pending'),
          'Do not auto-clear integrity findings; root reviews any actual pending finding')
        const finalized = await call(admin, `/api/admin/tournaments/${fixture.tournamentId}/finalize`, {})
        assert.equal(finalized.status, 200)
        fixture.stage = 'COMPLETED'; await persist()
      }
      const tournament = await ownedTournament(service, fixture)
      assert.equal(tournament.status, 'completed'); assert.equal(tournament.play_window_end, fixture.playWindowEnd)
      const games = await ownedGames(service, fixture)
      assert.equal(games.length, 2); assert.ok(games.every(game => game.status === 'completed' && game.end_reason === 'timeout'))
      const official = await call(players.A, `${route}/leaderboard`)
      assert.equal(official.status, 200); assert.equal(official.json?.phase, 'official'); assert.equal(official.json.rows.length, 2)
      assert.deepEqual(official.json.rows.map(row => row.position), [1, 2])
      assert.ok(official.json.rows.every(row => row.prizeCents === 0))
      assert.deepEqual(official.json.rows.map(row => row.score).sort((a, b) => a - b), games.map(game => game.final_score).sort((a, b) => a - b))
      const immutable = structuredClone(games)
      for (const account of fixture.accounts) {
        const game = games.find(entry => entry.user_id === account.id)
        const recovery = await call(players[account.label], `${route}/game/start`, { recoverOnly: true, gameId: game.id })
        assert.equal(recovery.status, 200); assert.equal(recovery.json?.score, game.final_score); assert.equal(recovery.json.gameId, game.id)
        assert.equal((await call(players[account.label], `${route}/game/move`, { gameId: game.id, direction: 'left',
          moveNumber: game.move_count + 2, clientTimestamp: Date.now() })).status, 400)
      }
      assert.equal((await call(admin, `/api/admin/tournaments/${fixture.tournamentId}/finalize`, {})).status, 400)
      assert.deepEqual(await ownedGames(service, fixture), immutable)
      context.checks.push({ name: 'two natural 300-second timeouts; protected early close; official immutable ranking and unchanged 24-hour window',
        results: official.json.rows.map(row => ({ position: row.position, score: row.score, prizeCents: row.prizeCents })),
        ...await zeroMoneyAndRatings(service, fixture) })
      await saveReport('PASS')
      return { status: 'PASS', mode, evidenceDirectory: context.directory }
    }

    context.phase = 'cleanup_owned_zero_money_rows'
    if (!options.allowPartialOwned) {
      const prior = await Promise.all((await fs.readdir(context.directory)).filter(name => /^(finish|verify)-[\da-f-]+\.json$/.test(name))
        .map(name => readJson(path.join(context.directory, name))))
      assert.ok(prior.some(entry => entry.task === KIND && entry.status === 'PASS'), 'Keep completed evidence before cleanup')
    }
    const removed = await cleanupOwnedCommunityDevelopment(service, fixture, { allowPartialOwned: options.allowPartialOwned === true })
    fixture.cleanup = { ...removed, fromStage: fixture.stage, at: new Date().toISOString() }
    fixture.tournamentId = removed.tournamentId; fixture.stage = 'CLEANED'; await persist()
    context.checks.push({ name: 'only validated owned synthetic gameplay/profile/Auth tuples removed; financial/operator audit rows and private evidence retained', ...removed })
    await saveReport('PASS')
    return { status: 'PASS', mode, evidenceDirectory: context.directory }
  } catch (error) {
    if (mode === 'cleanup' && error instanceof CommunityCleanupFailure) context.cleanupDiagnostic = error.diagnostic
    if (context.directory) try { await saveReport('FAIL') } catch { /* Withhold raw provider/credential payloads. */ }
    return { status: 'FAIL', mode, phase: context.phase, ...(context.cleanupDiagnostic ? { cleanupDiagnostic: context.cleanupDiagnostic } : {}),
      ...(context.directory ? { evidenceDirectory: context.directory } : {}) }
  } finally {
    // Prepare cookies remain usable for root's isolated UI; later phases use
    // their own sessions and never sign out the operator's other sessions.
    if (mode !== 'prepare') for (const actor of context.actors) try { await actor.client.auth.signOut({ scope: 'local' }) } catch { /* No secret diagnostics. */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) console.log('Integrated browser QA: prepare --browser-registration leaves A unregistered and starts the ordinary window ten real minutes later; register A in browser, then run registered --fixture <owned fixture> before play. Only B is registered by prepare. The extra trusted development marker keeps local practice observations synthetic. No deadlines, rules, money or production are changed.')
  if (args.includes('--help')) console.log('Usage: node scripts/verify-2048-community-development.mjs prepare|play|finish|verify|cleanup --development-root C:/torneos [--fixture <candidate artifacts/.../fixture.private.json>] [--operator-file <existing private env>] [--allow-partial-owned (cleanup only)]. Creates two explicit synthetic QA profiles and one normal zero-prize community tournament. No migrations, deploys, Flow, emails, MFA enrollment, clock acceleration or human-consent claims. Root plays A in Unity before play; finish waits externally for real 300-second deadlines. Cleanup retains private fixtures/cookies/evidence; the explicit partial flag permits only validated owned zero-money rows from an incomplete run.')
  else {
    const options = { developmentRoot: process.cwd() }
    let valid = ['prepare', 'registered', 'play', 'finish', 'verify', 'cleanup'].includes(args[0])
    for (let index = 1; index < args.length; index++) {
      if (args[index] === '--browser-registration') {
        if (args[0] !== 'prepare' || options.browserRegistration) { valid = false; break }
        options.browserRegistration = true; continue
      }
      if (args[index] === '--allow-partial-owned') {
        if (args[0] !== 'cleanup' || options.allowPartialOwned) { valid = false; break }
        options.allowPartialOwned = true; continue
      }
      const property = { '--development-root': 'developmentRoot', '--fixture': 'fixture', '--operator-file': 'operatorFile' }[args[index]]
      if (!property || !args[index + 1] || args[index + 1].startsWith('--')) { valid = false; break }
      options[property] = args[++index]
    }
    if (!valid || args[0] !== 'prepare' && !options.fixture || ['prepare', 'finish', 'verify'].includes(args[0]) && !options.operatorFile) {
      console.error('Invalid verifier arguments. Use --help.'); process.exitCode = 1
    } else {
      const result = await runCommunityDevelopment(args[0], options)
      console.log(JSON.stringify(result)); if (result.status !== 'PASS') process.exitCode = 1
    }
  }
}
