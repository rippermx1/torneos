import { describe, expect, it, vi } from 'vitest'
import { assertCommunityTournament, assertOwnedCommunityUser, validateCommunityDevelopment,
  validateCommunityFixture, validateCommunityRoute } from '../scripts/verify-2048-community-development.mjs'

const runId = '11111111-1111-4111-8111-111111111111'
const fixture = () => ({ version: 1, kind: '2048-community-development', runId, createdAt: '2026-10-16T15:00:00Z',
  projectRef: 'jnoyjewsqbooqaiighcs', appUrl: 'https://torneos-dev.vercel.app', syntheticQaOnly: true, profileClaimsAreFixtures: true,
  stage: 'REGISTERED', tournamentId: '33333333-3333-4333-8333-333333333333', operatorId: '44444444-4444-4444-8444-444444444444',
  accounts: ['A', 'B'].map((label, index) => ({ label, id: `${index + 1}2222222-2222-4222-8222-222222222222`,
    email: `qa2048community_${runId.replaceAll('-', '')}_${label.toLowerCase()}@example.com`, password: 'x'.repeat(40) })) })
const tournament = () => ({ id: fixture().tournamentId, created_by: fixture().operatorId, name: `2048 comunidad QA ${runId}`,
  description: `Prueba técnica sintética ${runId}; perfiles adultos y términos son fixtures, no consentimiento humano.`,
  preset_key: 'community_free_v1', business_rule_version: 4, tournament_type: 'freeroll', game_type: '2048_score',
  prize_model: 'fixed', is_test: false, entry_fee_cents: 0, prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0,
  prize_fund_bps: 5500, platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
  min_players: 2, max_players: 15, max_game_duration_seconds: 300, skill_tier: null,
  registration_opens_at: '2026-10-16T14:59:00Z', play_window_start: '2026-10-16T15:00:00Z', play_window_end: '2026-10-17T15:00:00Z' })

describe('development verifier guards stay pure and bounded', () => {
  it('imports and validates without contacting services', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect(validateCommunityFixture(fixture())).toEqual(fixture())
    expect(assertCommunityTournament(tournament(), fixture())).toEqual(tournament())
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore()
  })
  it.each([{ is_test: true }, { prize_1st_cents: 100 }, { entry_fee_cents: 1 }, { game_type: 'snake_arena' },
    { created_by: 'someone-else' }, { business_rule_version: 3 }, { skill_tier: 'novato' },
    { play_window_end: '2026-10-16T15:06:00Z' }])('refuses a substitute fixture or accelerated window: %j', patch => {
    expect(() => assertCommunityTournament({ ...tournament(), ...patch }, fixture())).toThrow()
  })
  it('does not treat an arbitrary existing Auth account as owned QA', () => {
    const current = fixture(), account = current.accounts[0]
    const user = { id: account.id, email: account.email, created_at: current.createdAt, is_anonymous: false,
      app_metadata: { qa_2048_community_development: { runId, label: account.label } } }
    expect(() => assertOwnedCommunityUser(user, current, account)).not.toThrow()
    expect(() => assertOwnedCommunityUser({ ...user, app_metadata: {} }, current, account)).toThrow()
    expect(() => assertOwnedCommunityUser({ ...user, created_at: '2020-01-01T00:00:00Z' }, current, account)).toThrow()
  })
  it.each(['/api/wallet/deposit/create', '/api/tournaments/33333333-3333-4333-8333-333333333333/checkout/flow/create',
    '/api/2048/activity', '/api/admin/users/ban', 'https://example.com/api/admin/tournaments'])('does not allow unrelated route %s', route => {
    expect(() => validateCommunityRoute(route)).toThrow()
  })
  it('restricts the environment to the exact development Supabase/domain and disables external money/email', () => {
    const env = { TORNEOS_ENV: 'cloud-development', DEVELOPMENT_SUPABASE_PROJECT_REF: 'jnoyjewsqbooqaiighcs',
      NEXT_PUBLIC_SUPABASE_URL: 'https://jnoyjewsqbooqaiighcs.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test',
      SUPABASE_SECRET_KEY: 'server-test', APP_URL: 'https://torneos-dev.vercel.app', NEXT_PUBLIC_SITE_URL: 'https://torneos-dev.vercel.app',
      FLOW_API_BASE: 'https://sandbox.flow.cl/api', NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CRON_SECRET: 'a'.repeat(64) }
    const config = { name: 'torneos-dev', supabaseProjectRef: 'jnoyjewsqbooqaiighcs', protectedSupabaseProjectRefs: ['baeylvoipmazcthnwxmz'] }
    expect(() => validateCommunityDevelopment(env, config)).not.toThrow()
    for (const patch of [{ FLOW_API_KEY: 'key', FLOW_API_SECRET: 'secret' }, { RESEND_API_KEY: 'key' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://baeylvoipmazcthnwxmz.supabase.co' }, { APP_URL: 'https://torneosplay.cl' }]) {
      expect(() => validateCommunityDevelopment({ ...env, ...patch }, config)).toThrow()
    }
  })
})
