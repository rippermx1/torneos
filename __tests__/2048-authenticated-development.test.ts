import { describe, expect, it, vi } from 'vitest'
import {
  AUTHENTICATED_2048_KIND, assertAuthenticatedActivitySnapshot, assertAuthenticatedActivityTransition,
  assertNormalAuthenticatedProfile, assertOwnedAuthenticatedUser, cleanupAuthenticatedFixture,
  createAuthenticatedRestrictedFetch, fixtureReadOnlySql, prepareAuthenticatedFixture,
  runAuthenticatedDevelopment, validateAuthenticatedDevelopment, validateAuthenticatedFixture,
} from '../scripts/verify-2048-authenticated-development.mjs'

const NOW = Date.parse('2026-10-20T15:00:00Z')
const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const marker = 'qa_2048_authenticated_development'
const clone = <T,>(value: T): T => structuredClone(value)
function fixture() {
  return { version: 1, kind: AUTHENTICATED_2048_KIND, runId: IDS[0], createdAt: new Date(NOW).toISOString(),
    projectRef: 'jnoyjewsqbooqaiighcs', appUrl: 'https://torneos-dev.vercel.app',
    baseline: { day: '2026-10-20', profiles: 14, walletTransactions: 1, retentionAccounts: 0 },
    accounts: ['A', 'B'].map((label, index) => ({ label, id: IDS[index + 1],
      email: `qa2048auth_${IDS[0].replaceAll('-', '')}_${label.toLowerCase()}@example.com`, password: 'aA1!'.repeat(12) })) }
}
type Fixture = ReturnType<typeof fixture>
type Account = Fixture['accounts'][number]
function user(f: Fixture, account: Account) {
  return { id: account.id, email: account.email, is_anonymous: false, created_at: f.createdAt, email_confirmed_at: f.createdAt,
    app_metadata: { [marker]: { runId: f.runId, label: account.label } } }
}
function profile(account: Account) {
  return { id: account.id, username: `user_${account.id.replaceAll('-', '').slice(0, 8)}`, is_admin: false, is_banned: false,
    kyc_status: 'pending', full_name: null, rut: null, birth_date: null, phone: null, city: null,
    kyc_verified_at: null, terms_accepted_at: null, terms_version: null }
}
function report() {
  const empty = () => ({ eligibleAccounts: 0, returnedAccounts: 0, rate: null })
  return { version: 1, unit: 'accounts', source: 'self_reported_first_valid_move', cohortBasis: 'first_known_activity_day',
    timezone: 'America/Santiago', from: '2026-10-20', to: '2026-10-20', asOfChileDay: '2026-10-20',
    cohorts: [{ cohortDay: '2026-10-20', accounts: 0, day1: empty(), day7: empty() }],
    totals: { accounts: 0, day1: empty(), day7: empty() } }
}
function fakeService(f = fixture(), populated = true) {
  const users = new Map<string, ReturnType<typeof user>>()
  const profiles = new Map<string, ReturnType<typeof profile>>()
  const roles = new Map<string, { role: string }[]>()
  const dependencies = new Map<string, number>()
  const events: string[] = [], payloads: Record<string, unknown>[] = []
  let globalProfileDelta = 0, failedRevoke = false, wrongSession = false
  const add = (account: Account) => { users.set(account.id, user(f, account)); profiles.set(account.id, profile(account)); roles.set(account.id, [{ role: 'user' }]) }
  if (populated) f.accounts.forEach(add)
  const service = {
    rpc: vi.fn(async () => ({ data: report(), error: null })),
    from: (table: string) => {
      const filters: Record<string, string> = {}; let head = false, deleting = false
      const query = {
        select: (_fields?: string, options?: { head?: boolean }) => { head = !!options?.head; return query },
        eq: (column: string, id: string) => { filters[column] = id; return query },
        delete: () => { deleting = true; return query },
        maybeSingle: async () => ({ data: profiles.get(filters.id) ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve().then(() => {
          const id = Object.values(filters)[0]
          if (deleting) {
            events.push(`delete-profile:${id}`)
            if ([...dependencies].some(([key, value]) => key.endsWith(':' + id) && value > 0)) return { data: null, error: { message: 'FK' } }
            const existed = profiles.delete(id); roles.delete(id)
            return { data: existed ? [{ id }] : [], error: null }
          }
          if (head) {
            const count = table === 'profiles' ? (id ? Number(profiles.has(id)) : 14 + profiles.size + globalProfileDelta)
              : table === 'wallet_transactions' && !id ? 1 : dependencies.get(`${table}:${id}`) ?? 0
            return { data: null, error: null, count }
          }
          return { data: roles.get(filters.profile_id) ?? [], error: null }
        }).then(resolve, reject),
      }
      return query
    },
    auth: { admin: {
      getUserById: vi.fn(async (id: string) => users.has(id) ? { data: { user: clone(users.get(id)) }, error: null }
        : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }),
      createUser: vi.fn(async (payload: Record<string, unknown>) => {
        events.push('create:' + payload.id); payloads.push(payload)
        const account = f.accounts.find(a => a.id === payload.id)!
        add(account); return { data: { user: clone(users.get(account.id)) }, error: null }
      }),
      signOut: vi.fn(async (token: string, scope: string) => {
        events.push(`revoke:${token}:${scope}`)
        return { data: null, error: failedRevoke ? { message: 'no' } : null }
      }),
      deleteUser: vi.fn(async (id: string, soft: boolean) => {
        events.push(`delete-auth:${id}:${soft}`); users.delete(id)
        return { data: { user: null }, error: null }
      }),
    } },
  }
  const createAuthClient = () => {
    let ownId: string | undefined
    return { auth: {
      signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        const account = f.accounts.find(a => a.email === email && a.password === password)!
        ownId = account.id; events.push(`login:${ownId}`)
        return { data: { user: clone(users.get(ownId)), session: { access_token: `own-${ownId}` } }, error: null }
      }),
      getUser: vi.fn(async (token: string) => {
        events.push(`verify:${token}`)
        return { data: { user: clone(users.get(wrongSession ? f.accounts[1].id : ownId!)) }, error: null }
      }),
      signOut: vi.fn(async (options: { scope: string }) => { events.push(`local:${ownId}:${options.scope}`); return { error: null } }),
    } }
  }
  return { service, users, profiles, roles, dependencies, events, payloads, createAuthClient,
    concurrentChange: () => { globalProfileDelta++ }, failRevoke: () => { failedRevoke = true }, wrongSession: () => { wrongSession = true } }
}
const config = { name: 'torneos-dev', supabaseProjectRef: 'jnoyjewsqbooqaiighcs', protectedSupabaseProjectRefs: ['baeylvoipmazcthnwxmz'] }
const environment = () => ({ TORNEOS_ENV: 'cloud-development', DEVELOPMENT_SUPABASE_PROJECT_REF: config.supabaseProjectRef,
  NEXT_PUBLIC_SUPABASE_URL: `https://${config.supabaseProjectRef}.supabase.co`, APP_URL: 'https://torneos-dev.vercel.app',
  NEXT_PUBLIC_SITE_URL: 'https://torneos-dev.vercel.app', FLOW_API_BASE: 'https://sandbox.flow.cl/api', FLOW_API_KEY: '', FLOW_API_SECRET: '',
  RESEND_API_KEY: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SECRET_KEY: 'test-server',
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CRON_SECRET: 'a'.repeat(64) })

describe('authenticated development QA safety', () => {
  it('accepts only the known development target, protected production and disabled external integrations', () => {
    expect(() => validateAuthenticatedDevelopment(environment(), config)).not.toThrow()
    for (const patch of [{ NEXT_PUBLIC_SUPABASE_URL: 'https://baeylvoipmazcthnwxmz.supabase.co' },
      { APP_URL: 'https://torneosplay.cl' }, { FLOW_API_KEY: 'key', FLOW_API_SECRET: 'secret' },
      { RESEND_API_KEY: 'key' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' },
      { PRODUCTION_SUPABASE_PROJECT_REF: config.supabaseProjectRef }]) {
      expect(() => validateAuthenticatedDevelopment({ ...environment(), ...patch }, config)).toThrow()
    }
    expect(() => validateAuthenticatedDevelopment(environment(), { ...config, protectedSupabaseProjectRefs: [] })).toThrow()
  })
  it('refuses fixture identity rebinding, arbitrary email, extra fields and malformed UUID', () => {
    expect(validateAuthenticatedFixture(fixture(), NOW)).toBeTruthy()
    for (const change of [(f: Fixture) => { f.accounts[1].id = f.accounts[0].id },
      (f: Fixture) => { f.accounts[0].email = 'operator@example.com' },
      (f: Fixture) => { f.runId = "x');DELETE" }, (f: Fixture) => { Object.assign(f, { tokens: [] }) }]) {
      const f = fixture(); change(f); expect(() => validateAuthenticatedFixture(f, NOW)).toThrow()
    }
  })
  it('requires trusted metadata and fresh confirmed nonanonymous ownership, never user claims', () => {
    const f = fixture(), a = f.accounts[0], original = user(f, a)
    expect(() => assertOwnedAuthenticatedUser(original, f, a, NOW)).not.toThrow()
    for (const patch of [{ app_metadata: {}, user_metadata: original.app_metadata }, { is_anonymous: true },
      { created_at: '2026-10-19T00:00:00Z' }, { email_confirmed_at: null },
      { app_metadata: { ...original.app_metadata, qa_2048_training_development: { runId: f.runId } } }]) {
      expect(() => assertOwnedAuthenticatedUser({ ...original, ...patch }, f, a, NOW)).toThrow()
    }
  })
  it('refuses accepted terms, administrator roles and profile claims before cleanup', () => {
    const a = fixture().accounts[0]
    expect(() => assertNormalAuthenticatedProfile(profile(a), [{ role: 'user' }], a)).not.toThrow()
    for (const patch of [{ terms_accepted_at: new Date(NOW).toISOString() }, { full_name: 'name' }, { is_admin: true }]) {
      expect(() => assertNormalAuthenticatedProfile({ ...profile(a), ...patch }, [{ role: 'user' }], a)).toThrow()
    }
    expect(() => assertNormalAuthenticatedProfile(profile(a), [{ role: 'admin' }], a)).toThrow()
  })
  it('blocks all non-development origins before fetching and disables redirects', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 })), fetch = createAuthenticatedRestrictedFetch(fetcher)
    for (const url of ['https://baeylvoipmazcthnwxmz.supabase.co/auth/v1/admin/users', 'https://example.com/', 'http://jnoyjewsqbooqaiighcs.supabase.co/', 'https://user@jnoyjewsqbooqaiighcs.supabase.co/']) {
      expect(() => fetch(url)).toThrow()
    }
    expect(fetcher).not.toHaveBeenCalled()
    await fetch(`https://${config.supabaseProjectRef}.supabase.co/auth/v1/user`, { redirect: 'follow' })
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }))
  })
  it('saves the private fixture before creating only the two confirmed owned users', async () => {
    const f = fixture(), fake = fakeService(f, false), save = vi.fn(async () => { fake.events.push('save-private') })
    let next = 0
    const result = await prepareAuthenticatedFixture(fake.service, save, { now: () => NOW, uuid: () => IDS[next++], password: () => f.accounts[0].password })
    expect(result).toEqual(f); expect(fake.events[0]).toBe('save-private')
    expect(fake.payloads).toHaveLength(2)
    fake.payloads.forEach((payload, index) => expect(payload).toEqual({ id: f.accounts[index].id, email: f.accounts[index].email,
      password: f.accounts[index].password, email_confirm: true, app_metadata: { [marker]: { runId: f.runId, label: f.accounts[index].label } } }))
    expect(fake.service.rpc).toHaveBeenCalledExactlyOnceWith('report_2048_player_retention', { p_from: '2026-10-20', p_to: '2026-10-20' })
    expect(fake.service.auth.admin.deleteUser).not.toHaveBeenCalled(); expect(fake.service.auth.admin.signOut).not.toHaveBeenCalled()
  })
  it('does not create anything when private fixture persistence fails', async () => {
    const fake = fakeService(fixture(), false); let next = 0
    await expect(prepareAuthenticatedFixture(fake.service, async () => { throw new Error('disk refused') },
      { now: () => NOW, uuid: () => IDS[next++] })).rejects.toThrow()
    expect(fake.service.auth.admin.createUser).not.toHaveBeenCalled()
  })
  it('preflights both identities before revoking or deleting either', async () => {
    const f = fixture(), fake = fakeService(f)
    fake.users.get(f.accounts[1].id)!.app_metadata[marker].label = 'not-owned'
    await expect(cleanupAuthenticatedFixture(fake.service, f, { now: () => NOW, createAuthClient: fake.createAuthClient })).rejects.toThrow()
    expect(fake.service.auth.admin.signOut).not.toHaveBeenCalled(); expect(fake.service.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(fake.profiles.size).toBe(2)
  })
  it.each(['wallet_transactions', 'registrations', 'games', 'tournaments', 'kyc_submissions', 'player_ratings'])('never deletes owned users having %s dependencies', async table => {
    const f = fixture(), fake = fakeService(f); fake.dependencies.set(`${table}:${f.accounts[1].id}`, 1)
    await expect(cleanupAuthenticatedFixture(fake.service, f, { now: () => NOW, createAuthClient: fake.createAuthClient })).rejects.toThrow()
    expect(fake.service.auth.admin.signOut).not.toHaveBeenCalled(); expect(fake.service.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('revokes each verified own JWT before profile/Auth deletion, without touching operator sessions', async () => {
    const f = fixture(), fake = fakeService(f)
    const result = await cleanupAuthenticatedFixture(fake.service, f, { now: () => NOW, createAuthClient: fake.createAuthClient })
    expect(result).toMatchObject({ deletedAccounts: 2, alreadyAbsentAccounts: 0, profiles: 14, walletTransactions: 1, baselineMatches: true })
    for (const a of f.accounts) {
      const verify = fake.events.indexOf(`verify:own-${a.id}`), revoke = fake.events.indexOf(`revoke:own-${a.id}:global`)
      const removeProfile = fake.events.indexOf(`delete-profile:${a.id}`), removeAuth = fake.events.indexOf(`delete-auth:${a.id}:false`)
      expect(verify).toBeLessThan(revoke); expect(revoke).toBeLessThan(removeProfile); expect(removeProfile).toBeLessThan(removeAuth)
      expect(fake.events).toContain(`local:${a.id}:local`)
    }
    expect(fake.service.auth.admin.signOut.mock.calls).toEqual(f.accounts.map(a => [`own-${a.id}`, 'global']))
    expect(fake.users.size).toBe(0); expect(fake.profiles.size).toBe(0)
  })
  it('does not strand own QA because unrelated global counts changed', async () => {
    const fake = fakeService(); fake.concurrentChange()
    const result = await cleanupAuthenticatedFixture(fake.service, fixture(), { now: () => NOW, createAuthClient: fake.createAuthClient })
    expect(result.deletedAccounts).toBe(2); expect(result.baselineMatches).toBe(false)
  })
  it('refuses a server session resolving to another identity before revocation', async () => {
    const fake = fakeService(); fake.wrongSession()
    await expect(cleanupAuthenticatedFixture(fake.service, fixture(), { now: () => NOW, createAuthClient: fake.createAuthClient })).rejects.toThrow()
    expect(fake.service.auth.admin.signOut).not.toHaveBeenCalled(); expect(fake.service.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('requires session revocation to succeed before deleting anything', async () => {
    const fake = fakeService(); fake.failRevoke()
    await expect(cleanupAuthenticatedFixture(fake.service, fixture(), { now: () => NOW, createAuthClient: fake.createAuthClient })).rejects.toThrow()
    expect(fake.service.auth.admin.deleteUser).not.toHaveBeenCalled(); expect(fake.profiles.size).toBe(2)
  })
  it('handles an attributable partial prepare and already absent users', async () => {
    const f = fixture(), fake = fakeService(f); fake.users.delete(f.accounts[1].id); fake.profiles.delete(f.accounts[1].id); fake.roles.delete(f.accounts[1].id)
    expect(await cleanupAuthenticatedFixture(fake.service, f, { now: () => NOW, createAuthClient: fake.createAuthClient }))
      .toMatchObject({ deletedAccounts: 1, alreadyAbsentAccounts: 1, baselineMatches: true })
  })
  it('refuses an orphaned profile when Auth ownership can no longer be proven', async () => {
    const f = fixture(), fake = fakeService(f); fake.users.delete(f.accounts[1].id)
    await expect(cleanupAuthenticatedFixture(fake.service, f, { now: () => NOW, createAuthClient: fake.createAuthClient })).rejects.toThrow()
    expect(fake.service.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('does not leak raw provider errors from invalid CLI execution', async () => {
    expect(await runAuthenticatedDevelopment('invalid', { developmentRoot: 'do-not-read' }))
      .toEqual({ status: 'FAIL', mode: 'invalid', phase: 'configuration', error: 'QA operation did not complete; private data and provider errors are withheld.' })
  })
})

function activitySnapshot() {
  return { version: 1, kind: AUTHENTICATED_2048_KIND, day: '2026-10-20', accounts: ['A', 'B'].map(label => ({ label,
    auth_users: 1, profiles: 1, sessions: 1, activity_rows: 0, activities: [] as { activity_day: string; practice: boolean; daily: boolean; first_seen_at: string; last_seen_at: string }[] })) }
}
const activity = () => ({ activity_day: '2026-10-20', practice: true, daily: false,
  first_seen_at: '2026-10-20T15:01:00Z', last_seen_at: '2026-10-20T15:01:00Z' })
describe('private read-only activity evidence', () => {
  it('generates only read-only facts by labels, never passwords/emails in SQL', () => {
    const f = fixture(), sql = fixtureReadOnlySql(f)
    expect(sql).toContain('AS snapshot'); expect(sql).toContain('auth.sessions'); expect(sql).toContain('private.player_2048_activity_days')
    for (const field of ['activity_day', 'practice', 'daily', 'first_seen_at', 'last_seen_at']) expect(sql).toContain(field)
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|record_2048_player_activity)\b/)
    for (const a of f.accounts) { expect(sql).not.toContain(a.email); expect(sql).not.toContain(a.password) }
  })
  it('does not mistake a same-row activity POST for unchanged evidence', () => {
    const before = activitySnapshot(); before.accounts[0].activities = [activity()]; before.accounts[0].activity_rows = 1
    const after = clone(before); after.accounts[0].activities[0].last_seen_at = '2026-10-20T15:02:00Z'
    expect(() => assertAuthenticatedActivityTransition(before, after, fixture(), 'unchanged')).toThrow()
    expect(assertAuthenticatedActivityTransition(before, after, fixture(), 'dedup')).toBe(true)
  })
  it('allows daily to set its flag on the existing practice row without inventing a new row', () => {
    const before = activitySnapshot(); before.accounts[0].activities = [activity()]; before.accounts[0].activity_rows = 1
    const after = clone(before); after.accounts[0].activities[0].daily = true; after.accounts[0].activities[0].last_seen_at = '2026-10-20T15:02:00Z'
    expect(assertAuthenticatedActivityTransition(before, after, fixture(), 'daily')).toBe(true)
    after.accounts[0].activities[0].practice = false
    expect(() => assertAuthenticatedActivityTransition(before, after, fixture(), 'daily')).toThrow()
  })
  it('requires the control account and original first seen timestamp to remain unchanged', () => {
    const before = activitySnapshot(), after = clone(before); after.accounts[0].activities = [activity()]; after.accounts[0].activity_rows = 1
    expect(assertAuthenticatedActivityTransition(before, after, fixture(), 'practice')).toBe(true)
    after.accounts[1].activities = [activity()]; after.accounts[1].activity_rows = 1
    expect(() => assertAuthenticatedActivityTransition(before, after, fixture(), 'practice')).toThrow()
  })
  it('rejects duplicate-day rows, PII additions, malformed times and out-of-run days', () => {
    for (const modify of [(v: ReturnType<typeof activitySnapshot>) => { Object.assign(v.accounts[0], { email: 'private' }) },
      (v: ReturnType<typeof activitySnapshot>) => { v.day = '2026-10-21' },
      (v: ReturnType<typeof activitySnapshot>) => { v.accounts[0].activities = [activity(), activity()]; v.accounts[0].activity_rows = 2 },
      (v: ReturnType<typeof activitySnapshot>) => { v.accounts[0].activities = [{ ...activity(), first_seen_at: 'invalid' }]; v.accounts[0].activity_rows = 1 }]) {
      const value = activitySnapshot(); modify(value); expect(() => assertAuthenticatedActivitySnapshot(value, fixture())).toThrow()
    }
  })
})
