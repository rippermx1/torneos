import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const f = vi.hoisted(() => ({ authorized: true, calls: [] as { name: string; args: unknown }[],
  reviews: [] as unknown[], error: false, sanctionResult: {} as Record<string, unknown>, resolveResult: { ok: true } as unknown,
  rows: {} as Record<string, unknown>, profile: { id: 'target', username: 'player', is_admin: false } }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({
  rpc: async (name: string, args: unknown) => { f.calls.push({ name, args }); return {
    data: name === 'inspect_2048_integrity' ? f.reviews : name === 'set_2048_account_sanction' ? f.sanctionResult : f.resolveResult,
    error: f.error ? { message: 'synthetic_private_error' } : null,
  } },
  from: (table: string) => { const q = { select: () => q, eq: () => q,
    single: async () => ({ data: table === 'profiles' ? f.profile : f.rows, error: null }) }; return q },
}) }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: async () => f.authorized
  ? { ok: true, access: { userId: 'admin' } } : { ok: false, response: new Response('', { status: 403 }) } }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/admin/audit', () => ({ recordAdminAction: vi.fn() }))
vi.mock('@/lib/email/account-notifications', () => ({ sendAccountBannedEmail: vi.fn() }))
vi.mock('@/lib/email/tournament-notifications', () => ({ sendTournamentPrizeEmail: vi.fn() }))
vi.mock('@/lib/email/ops-notifications', () => ({ sendOpsAlertEmail: vi.fn() }))
vi.mock('@/lib/tournament/refunds', () => ({ issueFlowRefunds: vi.fn() }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'http://fixture.invalid' }))

import { inspectIntegrity, requireIntegrityClearance, setAccountSanction } from '@/lib/anticheat/integrity'
import { computeIntervalStats, reviewWinnerStats } from '@/lib/anticheat/winner-review'
import { forceFinalizeTournament } from '@/lib/tournament/lifecycle'
import { GET, POST } from '@/app/api/admin/tournaments/[id]/integrity/route'
import { POST as ban } from '@/app/api/admin/users/[id]/ban/route'
import { POST as finalize } from '@/app/api/admin/tournaments/[id]/finalize/route'
import { createAdminClient } from '@/lib/supabase/server'
import { IntegrityReviews } from '@/components/tournament/integrity-reviews'

const id = '10000000-0000-0000-0000-000000000001'
const gameId = '20000000-0000-0000-0000-000000000002'
const params = { params: Promise.resolve({ id }) }
const review = { gameId, code: 'regular_pace', evidence: { intervals: 30, min_ms: 500, max_ms: 500 }, decision: 'pending', reason: null, reviewedAt: null } as const
const request = (body: unknown) => new Request('http://fixture.invalid', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { f.authorized = true; f.calls = []; f.reviews = []; f.error = false
  f.sanctionResult = { ok: true, banned: true, invalidatedGames: 1, settledGames: 0 }; f.resolveResult = { ok: true }
  f.rows = { id, status: 'finalizing', name: 'fixture', game_type: '2048_score' }
})

describe('persisted integrity and atomic sanction client', () => {
  it('blocks pending review and allows only confirmed empty or resolved states', async () => {
    f.reviews = [review]; await expect(requireIntegrityClearance(createAdminClient(), id)).rejects.toThrow('INTEGRITY_REVIEW_REQUIRED')
    f.reviews = [{ ...review, decision: 'cleared' }]; await requireIntegrityClearance(createAdminClient(), id)
    f.reviews = []; await requireIntegrityClearance(createAdminClient(), id)
  })
  it.each([null, {}, [{ ...review, decision: 'unknown' }], [null]])('fails closed on malformed state %j', async value => {
    f.reviews = value as unknown[]; await expect(inspectIntegrity(createAdminClient(), id)).rejects.toThrow('INTEGRITY_STATE_UNCONFIRMED')
  })
  it('fails closed when schema/RPC is unavailable', async () => {
    f.error = true; await expect(requireIntegrityClearance(createAdminClient(), id)).rejects.toThrow('INTEGRITY_STATE_UNCONFIRMED')
  })
  it('lifecycle stops before the financial RPC when review is pending', async () => {
    f.reviews = [review]; await expect(forceFinalizeTournament(id)).rejects.toThrow('INTEGRITY_REVIEW_REQUIRED')
    expect(f.calls.map(c => c.name)).toEqual(['inspect_2048_integrity'])
  })
  it('lifecycle stops before the financial RPC on a failed integrity read', async () => {
    f.error = true; await expect(forceFinalizeTournament(id)).rejects.toThrow('INTEGRITY_STATE_UNCONFIRMED')
    expect(f.calls.map(c => c.name)).toEqual(['inspect_2048_integrity'])
  })
  it('sanction uses one RPC with actor and reason', async () => {
    expect(await setAccountSanction(createAdminClient(), { userId: 'target', banned: true, reason: 'confirmed incident', actorId: 'admin' }))
      .toMatchObject({ ok: true, invalidatedGames: 1 })
    expect(f.calls).toEqual([{ name: 'set_2048_account_sanction', args: { p_user_id: 'target', p_banned: true, p_reason: 'confirmed incident', p_actor_id: 'admin' } }])
  })
  it.each([{}, { ok: true, banned: false }, { ok: true, banned: true, invalidatedGames: -1, settledGames: 0 }])('never confirms partial/invalid sanction %j', async result => {
    f.sanctionResult = result; await expect(setAccountSanction(createAdminClient(), { userId: 'target', banned: true, reason: 'reason' })).rejects.toThrow('SANCTION_STATE_UNCONFIRMED')
  })
})

describe('admin review and sanction routes', () => {
  it('returns an actionable conflict for pending review without a financial write', async () => {
    f.reviews = [review]
    const response = await finalize(request(null), params)
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'INTEGRITY_REVIEW_REQUIRED' })
    expect(f.calls.map(c => c.name)).toEqual(['inspect_2048_integrity'])
  })
  it('returns unavailability when integrity cannot be confirmed', async () => {
    f.error = true; expect((await finalize(request(null), params)).status).toBe(503)
  })
  it('requires admin MFA for read, clearance and ban', async () => {
    f.authorized = false
    for (const response of [await GET(request(null), params), await POST(request({}), params), await ban(request({ ban: true }), params)]) expect(response.status).toBe(403)
    expect(f.calls).toEqual([])
  })
  it('returns persisted review evidence to the authorized operator', async () => {
    f.reviews = [review]; expect(await (await GET(request(null), params)).json()).toEqual({ reviews: [review] })
  })
  it('rejects non-UUID tournament and game IDs before RPC calls', async () => {
    expect((await GET(request(null), { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(400)
    expect((await POST(request({ gameId: 'invalid', code: 'regular_pace', reason: 'valid long reason' }), params)).status).toBe(400)
    expect(f.calls).toEqual([])
  })
  it.each([null, {}, { gameId, code: 'regular_pace', reason: 'short' }, { gameId, code: ['regular_pace'], reason: 'long reason review' }, { gameId, code: 'settled_sanction', reason: 'long reason review' }])('rejects invalid clearance %j', async body => {
    expect((await POST(request(body), params)).status).toBe(400); expect(f.calls).toEqual([])
  })
  it('cannot clear another tournament or an already resolved review', async () => {
    expect((await POST(request({ gameId, code: 'regular_pace', reason: 'verified normal play' }), params)).status).toBe(409)
    expect(f.calls.map(c => c.name)).toEqual(['inspect_2048_integrity'])
  })
  it('records a clearance only for an owned pending signal', async () => {
    f.reviews = [review]; expect((await POST(request({ gameId, code: 'regular_pace', reason: 'verified accessibility input' }), params)).status).toBe(200)
    expect(f.calls[1]).toMatchObject({ name: 'resolve_2048_integrity', args: { p_actor_id: 'admin', p_reason: 'verified accessibility input' } })
  })
  it('does not acknowledge a failed clearance or expose DB errors', async () => {
    f.reviews = [review]; f.resolveResult = null
    const response = await POST(request({ gameId, code: 'regular_pace', reason: 'verified normal play' }), params)
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('synthetic_private_error')
  })
  it('ban reports complete atomic counts and fails closed if the RPC fails', async () => {
    const response = await ban(request({ ban: true, reason: 'confirmed incident' }), params)
    expect(await response.json()).toMatchObject({ ok: true, banned: true, invalidatedGames: 1, settledGames: 0 })
    f.error = true; expect((await ban(request({ ban: true }), params)).status).toBe(503)
  })
  it.each([null, [], { ban: true, reason: 12 }])('rejects malformed ban body %j', async body => {
    expect((await ban(request(body), params)).status).toBe(400); expect(f.calls).toEqual([])
  })
})

describe('regular pacing evidence and residual evasion', () => {
  const times = (intervals: number[]) => intervals.reduce((ts, ms) => [...ts, ts[ts.length - 1]! + ms], [0])
  it.each([80,500,1000,2000])('flags 30 consistent server intervals of %i ms for review', ms => {
    const stats = computeIntervalStats(times(Array(30).fill(ms))); expect(stats.regularPace).toBe(true)
    expect(reviewWinnerStats({ ...stats, moveCount: 31, finalScore: 124 })).toContainEqual(expect.objectContaining({ code: 'regular_pace' }))
  })
  it('uses sliding windows even after a thinking pause, and tolerates 10 ms bounded jitter', () => {
    expect(computeIntervalStats(times([5000,...Array.from({ length: 30 }, (_, i) => i % 2 ? 510 : 500)])).regularPace).toBe(true)
  })
  it.each([Array(29).fill(500), Array.from({ length: 30 },(_,i) => i % 2 ? 520 : 500), [...Array(29).fill(500),NaN], [...Array(29).fill(500),0], Array(30).fill(2001)].map(values => [values]))('does not infer regular pace from insufficient/variable/invalid data', values => {
    expect(computeIntervalStats(times(values)).regularPace).toBe(false)
  })
  it('documents jittered automation as a residual counterexample, not human proof', () => {
    const stats = computeIntervalStats(times(Array.from({ length: 40 },(_,i) => 500+(i%5)*40)))
    expect(reviewWinnerStats({ ...stats, moveCount: 41, finalScore: 1312 })).toEqual([])
  })
})

describe('operator panel actual markup', () => {
  it('shows replay/account actions, reason and pending state without asserting a bot', () => {
    const html = renderToStaticMarkup(createElement(IntegrityReviews, {tournamentId:id, reviews:[review], finalizing:true, users:{ [gameId]: {id:'player',name:'Player'} }}))
    expect(html).toContain('Cadencia regular'); expect(html).toContain('Motivo de la decisión'); expect(html).toContain('disabled=""')
    expect(html).toContain(`/admin/tournaments/${id}/games/${gameId}`); expect(html).toContain('no demuestra automatización')
  })
  it('renders unavailable verification and immutable settlement instructions explicitly', () => {
    expect(renderToStaticMarkup(createElement(IntegrityReviews, {tournamentId:id, reviews:null, finalizing:true, users:{}}))).toContain('No se pudo comprobar')
    const html = renderToStaticMarkup(createElement(IntegrityReviews, {tournamentId:id, reviews:[{...review,code:'settled_sanction'}], finalizing:false, users:{}}))
    expect(html).toContain('La liquidación permanece registrada'); expect(html).not.toContain('<textarea')
  })
})
