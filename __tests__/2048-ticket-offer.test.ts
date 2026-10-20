import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TournamentPreset } from '@/lib/tournament/finance'

const state = vi.hoisted(() => ({ override: undefined as TournamentPreset | null | undefined }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/tournament/finance', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/tournament/finance')>()
  return { ...actual, getTournamentPreset: vi.fn((key: string) => state.override === undefined ? actual.getTournamentPreset(key) : state.override) }
})

import { getTournamentPreset } from '@/lib/tournament/finance'
import { get2048TicketOffer } from '@/lib/tournament/ticket-offer'
import { formatCLP } from '@/lib/utils'

beforeEach(() => { state.override = undefined; vi.clearAllMocks() })

describe('server-owned informational 2048 ticket offer', () => {
  it('projects the actual commercial preset with matching cents, pesos and existing CLP labels', () => {
    const offer = get2048TicketOffer('practice')
    expect(getTournamentPreset).toHaveBeenCalledWith('commercial_v1')
    expect(offer).toMatchObject({ version: 1, kind: 'informational', status: 'unavailable', presetKey: 'commercial_v1',
      source: 'practice', currency: 'CLP', entryFee: { cents: 500_000, pesos: 5000, label: '$5.000' },
      prizes: { first: { cents: 2_475_000, pesos: 24750, label: '$24.750' }, second: { cents: 825_000, pesos: 8250, label: '$8.250' },
        third: { cents: 0, pesos: 0, label: '$0' }, total: { cents: 3_300_000, pesos: 33000, label: '$33.000' } },
      minPlayers: 12, maxPlayers: 15, durationMinutes: 10, windowHours: 24 })
    for (const amount of [offer.entryFee, ...Object.values(offer.prizes)]) {
      expect(amount.cents).toBe(amount.pesos * 100)
      expect(amount.label).toBe(formatCLP(amount.cents))
    }
    expect(offer.prizes.total.cents).toBe(offer.prizes.first.cents + offer.prizes.second.cents + offer.prizes.third.cents)
  })

  it('reads the governed preset on every call instead of duplicating commercial values', () => {
    const actual = getTournamentPreset('commercial_v1')!
    state.override = { ...actual, entryFeePesos: 7311, prize1Pesos: 9101, prize2Pesos: 3177, prize3Pesos: 200,
      minPlayers: 5, maxPlayers: 6, durationMinutes: 7, windowHours: 18 }
    const offer = get2048TicketOffer('result')
    expect(offer).toMatchObject({ entryFee: { cents: 731_100, pesos: 7311, label: '$7.311' },
      prizes: { first: { pesos: 9101 }, second: { pesos: 3177 }, third: { pesos: 200 }, total: { cents: 1_247_800, pesos: 12478 } },
      minPlayers: 5, maxPlayers: 6, durationMinutes: 7, windowHours: 18, status: 'unavailable' })
    state.override = { ...state.override, entryFeePesos: 8000 }
    expect(get2048TicketOffer().entryFee.pesos).toBe(8000)
  })

  it.each(['practice', 'result'] as const)('preserves the exact %s informational route through login and signup', source => {
    const offer = get2048TicketOffer(source)
    expect(offer.paths.self).toBe(`/play/2048/ticket?from=${source}`)
    for (const auth of ['login', 'signup'] as const) {
      const url = new URL(offer.paths[auth], 'https://torneos.local')
      expect(url.pathname).toBe(auth === 'login' ? '/sign-in' : '/sign-up')
      expect(url.searchParams.get('next')).toBe(offer.paths.self)
      expect([...url.searchParams.keys()]).toEqual(['next'])
    }
  })

  it.each([undefined, null, '', 'direct', 'PRACTICE', ' result ', ['result'], '//evil.test', '/checkout',
    'result&next=https://evil.test', { source: 'result' }])('normalizes unknown or hostile origins to the direct public route: %j', input => {
    const offer = get2048TicketOffer(input)
    expect(offer.source).toBe('direct')
    expect(offer.paths.self).toBe('/play/2048/ticket')
    expect(new URL(offer.paths.login, 'https://local.test').searchParams.get('next')).toBe('/play/2048/ticket')
    expect(offer.paths.practice).toBe('/play')
  })

  it('does not accept rewards, auth, catalog or enable-money claims as availability authority', () => {
    const inputs = [
      { source: 'practice', reward: { granted: true }, grant: true, status: 'available' },
      { user: { confirmed: true, role: 'admin' }, authenticated: true, isEligible: true },
      { catalog: [{ preset_key: 'commercial_v1', status: 'open' }], checkoutUrl: '/api/tournaments/id/checkout/flow/create' },
      { enableMoney: true, REAL_MONEY_ENABLED: true, mode: 'provider', approved: true },
    ]
    for (const input of inputs) {
      const offer = get2048TicketOffer(input)
      expect(offer.status).toBe('unavailable')
      expect(offer.kind).toBe('informational')
      expect(Object.keys(offer).sort()).toEqual(['currency', 'durationMinutes', 'entryFee', 'kind', 'maxPlayers', 'minPlayers',
        'paths', 'presetKey', 'prizes', 'source', 'status', 'version', 'windowHours'])
      expect(offer).not.toHaveProperty('checkoutUrl')
      expect(offer).not.toHaveProperty('tournamentId')
      expect(offer).not.toHaveProperty('available')
    }
  })

  it('serializes only its safe projection and creates independent return values', () => {
    const first = get2048TicketOffer('result')
    const serialized = JSON.stringify(first)
    expect(JSON.parse(serialized)).toEqual(first)
    expect(serialized).not.toMatch(/access_token|userId|email|seed|board|wallet|checkout|provider|grant/)
    const clientCopy = JSON.parse(serialized)
    clientCopy.status = 'available'; clientCopy.entryFee.cents = 0; clientCopy.prizes.first.pesos = 999999
    expect(get2048TicketOffer('result')).toEqual(first)
  })

  it.each([null, { key: 'freeroll_v1' }, { tournamentType: 'freeroll' }, { isTest: true },
    { entryFeePesos: 0 }, { prize1Pesos: -1 }, { prize2Pesos: Number.NaN }, { minPlayers: 1 },
    { maxPlayers: 3 }, { durationMinutes: 0 }, { windowHours: 1.5 }, { prize1Pesos: Number.MAX_SAFE_INTEGER }])('fails without publishing invented or malformed preset values: %j', override => {
    const actual = getTournamentPreset('commercial_v1')!
    state.override = override === null ? null : { ...actual, ...override } as TournamentPreset
    expect(() => get2048TicketOffer()).toThrow(/formato comercial informativo/)
  })
})
