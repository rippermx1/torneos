import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Trial2048LocalMetrics } from '@/lib/analytics/2048-trial-local'
import type { Trial2048ServerSnapshot } from '@/lib/analytics/2048-trial-server'
import { buildPlayer2048RetentionReport } from '@/lib/game/player-2048-retention'
import { COMMUNITY_REPORT_LIMITATIONS } from '@/lib/analytics/2048-community'

const fixture = vi.hoisted(() => ({ index: 0, states: [] as unknown[], generation: { current: 0 },
  cleanups: [] as (() => void)[], mfa: vi.fn(), createClient: vi.fn(), read: vi.fn(), parse: vi.fn(), connection: vi.fn(), order: [] as string[] }))
vi.mock('server-only', () => ({}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/server', () => ({ connection: fixture.connection }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfa: fixture.mfa }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: fixture.createClient }))
vi.mock('@/lib/analytics/2048-trial-server', () => ({ get2048TrialServerSnapshot: fixture.read }))
vi.mock('@/lib/analytics/2048-trial-local', () => ({ MAX_2048_TRIAL_LOCAL_BYTES: 2_500_000, parse2048TrialLocalExport: fixture.parse }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useId: () => 'trial-file',
  useRef: () => fixture.generation,
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
  useState: (initial: unknown) => {
    const index = fixture.index++
    if (!(index in fixture.states)) fixture.states[index] = initial
    return [fixture.states[index], (value: unknown) => { fixture.states[index] = value }]
  },
}))

import Page from '@/app/(admin)/admin/reports/2048-trial/page'
import { Trial2048Report, build2048TrialAggregate } from '@/components/admin/2048-trial-report'

const from = '2026-10-01', to = '2026-10-02'
const quality = { coverage: 'local_best_effort', storageStatus: 'ready', truncated: false, observationGap: false } as const
function server(): Trial2048ServerSnapshot {
  return { version: 1, loadedAt: '2026-10-09T12:00:00Z', timezone: 'America/Santiago', range: { from, to, days: 2 },
    scopes: { retention: 'first_known_activity_cohorts_in_range', community: 'latest_30_community_events_without_date_filter' }, limitations: ['Actividad declarada; QA debe identificarse y limpiarse por separado.'],
    retention: { status: 'ready', report: buildPlayer2048RetentionReport([
      { userId: 'private-account-A', activityDay: from, practice: true, daily: false },
      { userId: 'private-account-A', activityDay: '2026-10-08', practice: true, daily: false },
      { userId: 'private-account-B', activityDay: to, practice: false, daily: true },
    ], from, to, '2026-10-09') },
    community: { status: 'ready', report: { version: 1, source: 'server_tournament_games', unit: 'account_participations', maxEvents: 30, limitations: COMMUNITY_REPORT_LIMITATIONS, events: [
      { tournamentId: 'public-tournament-A', nextTournamentId: 'public-tournament-B', name: 'private event title', status: 'completed',
        startsAt: '2026-09-10T12:00:00Z', closesAt: '2026-09-11T12:00:00Z', registrations: 12, starts: 10, firstMoves: 9, completed: 8,
        returnToNext: { eligibleAccounts: 9, returnedAccounts: 3, rate: 1 / 3 } },
      { tournamentId: 'public-tournament-B', nextTournamentId: null, name: 'another private title', status: 'open',
        startsAt: '2026-10-21T12:00:00Z', closesAt: '2026-10-22T12:00:00Z', registrations: 4, starts: 0, firstMoves: 0, completed: 0, returnToNext: null },
    ] } },
  }
}
function local(views = 3): Trial2048LocalMetrics {
  return { version: 1, scope: 'One safe local export', practice: [
    { category: 'observed_browser', sessions: 1, started: 2, firstValidMove: 2, twentyValidMoves: 1, ended: 1, interrupted: 1, observedSecondPracticeWithin24h: true, quality },
    { category: 'synthetic', sessions: 1, started: 1, firstValidMove: 1, twentyValidMoves: 1, ended: 1, interrupted: 0, observedSecondPracticeWithin24h: null, quality: { ...quality, truncated: true, coverage: 'incomplete' } },
  ], localReturn: { category: 'observed_browser', daysPlayed: 2, d1: { status: 'returned', matured: true, returnObserved: true },
    d7: { status: 'pending', matured: false, returnObserved: false }, quality },
  training: { category: 'synthetic', offered: 2, started: 1, withValidMove: 1, validMoves: 40, ended: 1, interrupted: 0, quality },
  rewardedDemo: { category: 'demonstration', requests: 3, applied: 1, cancelled: 1, timeouts: 1, errors: 0, noFill: 0, ignoredDuplicate: 0, ignoredLate: 0, quality },
  ticketOffer: { category: 'observed_browser', views, bySource: { practice: views - 2, result: 1, direct: 1 }, quality } }
}
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child) ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function button(tree: ReactNode, label: string) {
  const node = nodes(tree).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)
  expect(node).toBeDefined(); return node!
}
function view(snapshot: Trial2048ServerSnapshot | null = server()) {
  fixture.index = 0
  return Trial2048Report({ snapshot, from, to })
}
function input(tree: ReactNode) { return nodes(tree).find(node => node.type === 'input' && node.props.type === 'file')! }
function select(tree: ReactNode, file: { size: number; text(): Promise<string> }) {
  const target = { files: [file], value: 'not-for-rendering.json' }
  ;(input(tree).props.onChange as (event: ChangeEvent<HTMLInputElement>) => void)({ currentTarget: target } as unknown as ChangeEvent<HTMLInputElement>)
  return target
}
async function flush() { for (let index = 0; index < 5; index++) await Promise.resolve() }

beforeEach(() => {
  vi.clearAllMocks(); fixture.index = 0; fixture.states = []; fixture.generation = { current: 0 }; fixture.cleanups = []; fixture.order = []
  fixture.mfa.mockImplementation(async () => { fixture.order.push('mfa') })
  fixture.connection.mockResolvedValue(undefined)
  fixture.createClient.mockImplementation(() => { fixture.order.push('client'); return { safe: 'fixture' } })
  fixture.read.mockImplementation(async () => { fixture.order.push('read'); return server() })
  fixture.parse.mockReturnValue(local())
  vi.useFakeTimers(); vi.setSystemTime('2026-10-19T01:00:00Z')
})
afterEach(() => { fixture.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); vi.useRealTimers() })

it('requires MFA before any privileged client or source read', async () => {
  fixture.mfa.mockRejectedValueOnce(new Error('MFA required'))
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('MFA required')
  expect(fixture.createClient).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled()
  await Page({ searchParams: Promise.resolve({ from, to }) })
  expect(fixture.order).toEqual(['mfa', 'client', 'read'])
})

it('defaults to 30 calendar days using today in Chile and passes only the selected range', async () => {
  await Page({ searchParams: Promise.resolve({}) })
  expect(fixture.read).toHaveBeenCalledWith({ safe: 'fixture' }, { from: '2026-09-19', to: '2026-10-18', days: 30 })
})

it.each([
  { from }, { from: ['2026-10-01', '2026-10-02'], to }, { from: '2026-02-30', to: '2026-03-01' },
  { from: to, to: from }, { from: '2026-01-01', to: '2026-04-01' }, { from, to, asOf: '2030-01-01' },
])('rejects an invalid or ambiguous GET range before creating the client: %j', async query => {
  const tree = await Page({ searchParams: Promise.resolve(query) })
  expect(fixture.mfa).toHaveBeenCalledTimes(1)
  expect(fixture.createClient).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled()
  const html = renderToStaticMarkup(tree)
  expect(html).toContain('No se consultaron datos')
  expect(html).toContain('Desconocido: no se pudo confirmar el retorno')
})

it('keeps failed central sources unknown without echoing private errors', async () => {
  fixture.read.mockRejectedValueOnce(new Error('secret-private-token-and-email@example.test'))
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ from, to }) }))
  expect(html).toContain('Desconocido: no se pudo confirmar el retorno')
  expect(html).toContain('Desconocido: no se pudo confirmar la participación')
  expect(html).not.toContain('secret-private')
})

it('distinguishes mature denominators from pending accounts and keeps community on its separate event window', () => {
  const html = renderToStaticMarkup(view())
  expect(html).toContain('D7: 1 / 1 · 100% · pendientes: 1')
  expect(html).toContain('corte de maduración 2026-10-09')
  expect(html).toContain('últimos 30 retos, sin filtro de fechas')
  expect(html).toContain('3 / 9 · 33,3%')
  expect(html).toContain('Pendiente: requiere dos resultados oficiales')
  expect(html).toContain('no es D1/D7')
  expect(html).toContain('No se unen identidades ni denominadores')
})

it('keeps a confirmed empty denominator distinct from an unavailable source', () => {
  const snapshot = server()
  snapshot.retention = { status: 'ready', report: buildPlayer2048RetentionReport([], from, to, '2026-10-09') }
  snapshot.community = { status: 'unavailable', report: null }
  const html = renderToStaticMarkup(view(snapshot))
  expect(html).toContain('D7: 0 / 0 · Sin denominador maduro')
  expect(html).toContain('Desconocido: no se pudo confirmar la participación')
  expect(html).not.toContain('D7: 0%')
})

it('renders local QA and observed categories separately and never substitutes missing older sections with zero', () => {
  fixture.states = [local(), '', false]
  let html = renderToStaticMarkup(view())
  expect(html).toContain('QA sintética'); expect(html).toContain('Observado en navegador')
  expect(html).toContain('Demostración local'); expect(html).toContain('registro truncado')
  expect(html).toContain('Día objetivo pendiente de terminar')
  fixture.states[0] = { version: 1, scope: 'legacy export', practice: null, localReturn: null, training: null, rewardedDemo: null, ticketOffer: null }
  html = renderToStaticMarkup(view())
  expect(html).toContain('Desconocido: este archivo no aporta consultas de ticket')
  expect(html).not.toContain('vistas retenidas: 0')
})

it('imports one selected file only in memory, clears its filename and replaces rather than appends the previous summary', async () => {
  vi.stubGlobal('fetch', vi.fn()); const storage = { getItem: vi.fn(), setItem: vi.fn() }; vi.stubGlobal('localStorage', storage)
  const first = select(view(), { size: 30, text: async () => '{"raw":"first-private-json"}' }); await flush()
  expect(first.value).toBe('')
  expect(fixture.states[0]).toEqual(local())
  fixture.parse.mockReturnValueOnce(local(7))
  select(view(), { size: 30, text: async () => '{"raw":"second-private-json"}' }); await flush()
  expect((fixture.states[0] as Trial2048LocalMetrics).ticketOffer?.views).toBe(7)
  expect(fetch).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
  const html = renderToStaticMarkup(view())
  expect(html).not.toContain('private-json'); expect(html).not.toContain('not-for-rendering.json')
})

it('rejects oversized content before parsing and shows a fixed safe message rather than the parser exception', async () => {
  const text = vi.fn(async () => '{}')
  select(view(), { size: 2_500_001, text }); await flush()
  expect(text).not.toHaveBeenCalled(); expect(fixture.parse).not.toHaveBeenCalled()
  fixture.parse.mockImplementationOnce(() => { throw new Error('raw-private-email@example.test') })
  select(view(), { size: 2, text: async () => '{}' }); await flush()
  const html = renderToStaticMarkup(view())
  expect(html).toContain('No pudimos leer este registro')
  expect(html).not.toContain('raw-private-email')
  expect(fixture.states[0]).toBeNull()
})

it('checks actual UTF-8 byte size even if a test file advertises a smaller size', async () => {
  select(view(), { size: 1, text: async () => 'é'.repeat(1_250_001) }); await flush()
  expect(fixture.parse).not.toHaveBeenCalled(); expect(fixture.states[0]).toBeNull()
})

it('ignores an older asynchronous file after a newer selection or removal', async () => {
  let resolve!: (value: string) => void
  select(view(), { size: 2, text: () => new Promise<string>(done => { resolve = done }) })
  fixture.parse.mockReturnValueOnce(local(9))
  select(view(), { size: 2, text: async () => '{}' }); await flush()
  resolve('{}'); await flush()
  expect((fixture.states[0] as Trial2048LocalMetrics).ticketOffer?.views).toBe(9)
  select(view(), { size: 2, text: () => new Promise<string>(done => { resolve = done }) })
  ;(button(view(), 'Quitar resumen local').props.onClick as () => void)()
  resolve('{}'); await flush()
  expect(fixture.states[0]).toBeNull()
})

it('downloads independent whitelisted aggregates without event identities, raw content or made-up revenue', async () => {
  const snapshot = server(), selected = local()
  const aggregate = build2048TrialAggregate(snapshot, selected), serialized = JSON.stringify(aggregate)
  expect(serialized).not.toMatch(/public-tournament|private event|private-account|nextTournamentId|tournamentId|filename|rawJSON/)
  expect(aggregate.sources.local).toMatchObject({ status: 'selected', scope: 'one_local_browser_export_without_account_join', summary: selected })
  expect(aggregate.sources.accountRetention).toMatchObject({ source: 'self_reported_first_valid_move', cohortBasis: 'first_known_activity_day' })
  expect(aggregate.serverLoadedAt).toBe(snapshot.loadedAt)
  expect(aggregate.limitations).toContain(snapshot.limitations[0])
  expect(build2048TrialAggregate(null, null).sources.local).toMatchObject({ status: 'unselected', summary: null })
  expect(build2048TrialAggregate(null, null).sources.accountRetention).toMatchObject({ status: 'unavailable', report: null })
  expect(serialized).not.toMatch(/"(revenue|sales|conversion|marketFit)":/)
  let exported!: Blob
  const anchor = { href: '', download: '', click: vi.fn() }
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:aggregate' }, revokeObjectURL: vi.fn() })
  vi.stubGlobal('document', { createElement: () => anchor })
  fixture.states = [selected, '', false]
  ;(button(view(snapshot), 'Descargar informe agregado JSON').props.onClick as () => void)()
  expect(anchor.click).toHaveBeenCalledTimes(1)
  expect(anchor.download).toBe('2048-informe-ensayo-agregado.json')
  expect(JSON.parse(await exported.text())).toEqual(aggregate)
})

it('shows unmeasured operational and human evidence instead of an automatic commercial verdict', () => {
  const html = renderToStaticMarkup(view())
  expect(html).toContain('Rewarded en demostración')
  expect(html).toContain('Ticket informativo, todavía no disponible')
  expect(html).toContain('Alcance de las fuentes')
  expect(html).toContain('QA debe identificarse y limpiarse por separado')
  expect(html).toContain('Segunda partida orgánica frente a reinicio con recordatorio')
  expect(html).toContain('Horas de convocatoria y operación, costos, soporte y reclamos')
  expect(html).toContain('Personas únicas, interés declarado en ticket y avisos consentidos')
  expect(html).toContain('ni producen una decisión automática')
  const form = nodes(view()).find(node => node.type === 'form')!
  expect(form.props).toMatchObject({ method: 'get', action: '/admin/reports/2048-trial' })
})
