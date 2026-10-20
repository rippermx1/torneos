import { describe, expect, it } from 'vitest'
import { assertOwnedCommunityProfile, cleanupOwnedCommunityDevelopment } from '../scripts/verify-2048-community-development.mjs'

const fixture = () => {
  const runId = '11111111-1111-4111-8111-111111111111'
  return { version: 1, kind: '2048-community-development', runId, createdAt: '2026-10-16T15:00:00Z',
    projectRef: 'jnoyjewsqbooqaiighcs', appUrl: 'https://torneos-dev.vercel.app', syntheticQaOnly: true,
    profileClaimsAreFixtures: true, stage: 'PREPARING', tournamentId: null as string | null,
    operatorId: '44444444-4444-4444-8444-444444444444', creationRequest: null as Record<string, unknown> | null,
    accounts: ['A', 'B'].map((label, index) => ({ label, id: `${index + 1}2222222-2222-4222-8222-222222222222`,
      email: `qa2048community_${runId.replaceAll('-', '')}_${label.toLowerCase()}@example.com`, password: 'x'.repeat(40) })) }
}
const ownedUser = (current: ReturnType<typeof fixture>, account: ReturnType<typeof fixture>['accounts'][number]) => ({
  id: account.id, email: account.email, created_at: current.createdAt, is_anonymous: false,
  app_metadata: { qa_2048_community_development: { runId: current.runId, label: account.label } },
})
const profile = (current: ReturnType<typeof fixture>, account: ReturnType<typeof fixture>['accounts'][number], seeded = false) => ({
  id: account.id, created_at: current.createdAt, username: seeded ? `qa2048c_${current.runId.slice(0, 8)}_${account.label.toLowerCase()}` : `user_${account.id.replaceAll('-', '').slice(0, 8)}`,
  full_name: seeded ? 'QA synthetic community fixture' : null, birth_date: seeded ? '1994-01-01' : null,
  terms_version: seeded ? '1.3' : null, terms_accepted_at: seeded ? current.createdAt : null,
  is_admin: false, is_banned: false, kyc_status: 'pending', rut: null, phone: null, city: null, kyc_verified_at: null,
})
function tournament(current: ReturnType<typeof fixture>) {
  const start = '2026-10-16T15:01:30Z', end = '2026-10-17T15:01:30Z', registration = '2026-10-16T14:59:00Z'
  const name = `2048 comunidad QA ${current.runId}`
  const description = `Prueba técnica sintética ${current.runId}; perfiles adultos y términos son fixtures, no consentimiento humano.`
  current.creationRequest = { name, description, registrationOpensAt: registration, playWindowStart: start, playWindowEnd: end }
  return { id: '33333333-3333-4333-8333-333333333333', name, description, created_by: current.operatorId, created_at: current.createdAt,
    preset_key: 'community_free_v1', business_rule_version: 4, tournament_type: 'freeroll', game_type: '2048_score',
    prize_model: 'fixed', is_test: false, entry_fee_cents: 0, prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0,
    prize_fund_bps: 5500, platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
    min_players: 2, max_players: 15, max_game_duration_seconds: 300, skill_tier: null, status: 'scheduled',
    registration_opens_at: registration, play_window_start: start, play_window_end: end }
}
function service(current: ReturnType<typeof fixture>, labels = ['A']) {
  const users = current.accounts.filter(account => labels.includes(account.label)).map(account => ownedUser(current, account))
  const tables: Record<string, Array<Record<string, unknown>>> = {
    profiles: current.accounts.filter(account => labels.includes(account.label)).map(account => profile(current, account)),
    profile_roles: users.map(user => ({ profile_id: user.id, role: 'user' })),
  }
  const writes: Array<{ table: string; ids: unknown[] }> = []
  const client = {
    auth: { admin: {
      async getUserById(id: string) {
        const user = users.find(user => user.id === id)
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { status: 404 } }
      },
      async deleteUser(id: string) { writes.push({ table: 'auth.users', ids: [id] }); users.splice(users.findIndex(user => user.id === id), 1); return { data: {}, error: null } },
    } },
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      let deleting = false, single = false, limit = Infinity
      const query = {
        select() { return query }, delete() { deleting = true; return query },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query },
        limit(value: number) { limit = value; return query },
        maybeSingle() { single = true; return Promise.resolve(result()) },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) },
      }
      function result() {
        const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)))
        if (deleting) {
          writes.push({ table, ids: rows.map(row => row.id) })
          tables[table] = (tables[table] ?? []).filter(row => !rows.includes(row))
          if (table === 'profiles') tables.profile_roles = tables.profile_roles.filter(role => !rows.some(row => row.id === role.profile_id))
        }
        return { data: single ? rows[0] ?? null : rows.slice(0, limit), error: null, count: rows.length }
      }
      return query
    },
  }
  return { client, tables, users, writes }
}

describe('explicit partial owned cleanup', () => {
  it('cleans a committed Auth/default profile after preparation failed before seeding the second account', async () => {
    const current = fixture(), db = service(current)
    const before = structuredClone(current)
    expect(await cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).toMatchObject({ accountsRemoved: 1, profilesRemoved: 1, tournamentId: null, partialOwned: true })
    expect(db.writes.map(write => write.table)).toEqual(['profiles', 'auth.users'])
    expect(current).toEqual(before)
  })
  it('requires the explicit partial flag for an unfinished run', async () => {
    const current = fixture(), db = service(current)
    await expect(cleanupOwnedCommunityDevelopment(db.client, current)).rejects.toThrow()
    expect(db.writes).toEqual([])
  })
  it('recovers only the exact persisted creation intent after a lost API response', async () => {
    const current = fixture(), db = service(current, ['A', 'B']), row = tournament(current)
    db.tables.tournaments = [row]
    const result = await cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })
    expect(result).toMatchObject({ tournamentId: row.id, accountsRemoved: 2, partialOwned: true })
    expect(db.tables.tournaments).toEqual([])
    expect(db.writes.findIndex(write => write.table === 'tournaments')).toBeLessThan(db.writes.findIndex(write => write.table === 'profiles'))
  })
  it.each(['description', 'created_at', 'play_window_start'])('does not adopt a different event matching only the name: %s', async key => {
    const current = fixture(), db = service(current), row = tournament(current)
    db.tables.tournaments = [{ ...row, [key]: key === 'description' ? 'Someone else' : '2020-01-01T00:00:00Z' }]
    await expect(cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).rejects.toThrow()
    expect(db.writes).toEqual([])
  })
  it('refuses an ambiguous creation outcome rather than deleting two matching events', async () => {
    const current = fixture(), db = service(current), row = tournament(current)
    db.tables.tournaments = [row, { ...row, id: '55555555-5555-4555-8555-555555555555' }]
    await expect(cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).rejects.toThrow()
    expect(db.writes).toEqual([])
  })
  it('checks the second account marker before deleting any first-account row', async () => {
    const current = fixture(), db = service(current, ['A', 'B'])
    db.users[1].app_metadata.qa_2048_community_development.runId = 'another-run'
    await expect(cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).rejects.toThrow()
    expect(db.writes).toEqual([])
  })
  it('refuses a profile that contains a real identity or operator role', async () => {
    const current = fixture(), db = service(current)
    db.tables.profiles[0].rut = 'not-a-fixture'
    await expect(cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).rejects.toThrow()
    expect(db.writes).toEqual([])
    expect(() => assertOwnedCommunityProfile({ ...profile(current, current.accounts[0]), is_admin: true }, db.users[0], current, current.accounts[0])).toThrow()
  })
  it('stops before deleting gameplay if any owned monetary row exists', async () => {
    const current = fixture(), db = service(current), row = tournament(current)
    current.tournamentId = row.id; current.stage = 'REGISTERED'; db.tables.tournaments = [row]
    db.tables.wallet_transactions = [{ id: 'cash-row', reference_id: row.id, user_id: current.accounts[0].id }]
    await expect(cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).rejects.toThrow()
    expect(db.writes).toEqual([])
  })
  it('accepts NULL legacy free-registration splits while the entry remains exactly zero', async () => {
    const current = fixture(), db = service(current), row = tournament(current)
    current.tournamentId = row.id; current.stage = 'REGISTERED'; db.tables.tournaments = [row]
    db.tables.registrations = [{ id: 'registration', tournament_id: row.id, user_id: current.accounts[0].id, entry_fee_cents: 0,
      prize_fund_contribution_cents: null, platform_fee_gross_cents: null, platform_fee_net_cents: null, platform_fee_iva_cents: null }]
    expect(await cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).toMatchObject({ registrationsRemoved: 1 })
  })
  it('rejects any positive legacy split or a missing/positive entry before any delete, with safe diagnostics', async () => {
    for (const patch of [{ prize_fund_contribution_cents: 1 }, { platform_fee_gross_cents: 1 }, { platform_fee_net_cents: 1 },
      { platform_fee_iva_cents: 1 }, { entry_fee_cents: 1 }, { entry_fee_cents: null }]) {
      const current = fixture(), db = service(current), row = tournament(current)
      current.tournamentId = row.id; current.stage = 'REGISTERED'; db.tables.tournaments = [row]
      db.tables.registrations = [{ id: 'private-secret-row', tournament_id: row.id, user_id: current.accounts[0].id, entry_fee_cents: 0,
        prize_fund_contribution_cents: null, platform_fee_gross_cents: null, platform_fee_net_cents: null, platform_fee_iva_cents: null, ...patch }]
      let diagnostic: unknown
      try { await cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true }) }
      catch (error) { diagnostic = (error as { diagnostic?: unknown }).diagnostic }
      expect(diagnostic).toMatchObject({ phase: 'preflight', table: 'registrations', operation: 'assert', code: 'ASSERTION_FAILED' })
      expect(JSON.stringify(diagnostic)).not.toContain('private-secret-row'); expect(JSON.stringify(diagnostic)).not.toContain(current.accounts[0].id)
      expect(db.writes).toEqual([])
    }
  })
  it('does not remove a QA account with participation outside its own event', async () => {
    const current = fixture(), db = service(current)
    db.tables.registrations = [{ user_id: current.accounts[0].id, tournament_id: 'another-event' }]
    await expect(cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).rejects.toThrow()
    expect(db.writes).toEqual([])
  })
  it('cleans an unfinished browser-registration run with trusted synthetic markers and only B registered', async () => {
    const current = fixture(), db = service(current, ['A', 'B']), row = tournament(current)
    current.tournamentId = row.id
    for (const user of db.users) Object.assign(user.app_metadata, { qa_2048_training_development: { runId: current.runId } })
    db.tables.profiles = current.accounts.map(account => profile(current, account, true))
    db.tables.tournaments = [row]
    db.tables.registrations = [{ id: 'owned-B-registration', tournament_id: row.id, user_id: current.accounts[1].id,
      entry_fee_cents: 0, prize_fund_contribution_cents: null, platform_fee_gross_cents: null,
      platform_fee_net_cents: null, platform_fee_iva_cents: null }]
    db.tables.admin_actions = [{ id: 'preserved-operator-audit', target_id: row.id }]
    expect(current.stage).toBe('PREPARING')
    await expect(cleanupOwnedCommunityDevelopment(db.client, current)).rejects.toThrow()
    expect(db.writes).toEqual([])
    expect(await cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).toMatchObject({
      accountsRemoved: 2, profilesRemoved: 2, registrationsRemoved: 1, gamesRemoved: 0, partialOwned: true,
    })
    expect(db.tables.registrations).toEqual([])
    expect(db.tables.tournaments).toEqual([])
    expect(db.tables.admin_actions).toEqual([{ id: 'preserved-operator-audit', target_id: row.id }])
    expect(db.writes.filter(write => write.table === 'auth.users').flatMap(write => write.ids)).toEqual(current.accounts.map(account => account.id))
  })
  it('removes only its registered/playing zero-value tuples in dependency order', async () => {
    const current = fixture(), db = service(current, ['A', 'B']), row = tournament(current), account = current.accounts[0]
    current.stage = 'PLAYING'; current.tournamentId = row.id; row.status = 'live'; db.tables.tournaments = [row]
    db.tables.profiles = current.accounts.map(account => profile(current, account, true))
    db.tables.registrations = [{ id: 'registration', tournament_id: row.id, user_id: account.id,
      entry_fee_cents: 0, prize_fund_contribution_cents: 0, platform_fee_gross_cents: 0, platform_fee_net_cents: 0, platform_fee_iva_cents: 0 }]
    db.tables.games = [{ id: '66666666-6666-4666-8666-666666666666', tournament_id: row.id, user_id: account.id, status: 'active' }]
    db.tables.game_moves = [{ id: 'move', game_id: db.tables.games[0].id }]
    db.tables.admin_actions = [{ id: 'operator-audit', target_id: row.id }]
    expect(await cleanupOwnedCommunityDevelopment(db.client, current, { allowPartialOwned: true })).toMatchObject({ gamesRemoved: 1, registrationsRemoved: 1 })
    expect(db.writes.map(write => write.table).slice(0, 5)).toEqual(['game_moves', 'tournament_results', 'games', 'registrations', 'tournaments'])
    expect(db.tables.admin_actions).toHaveLength(1)
  })
})
