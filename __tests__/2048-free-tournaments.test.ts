import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  createClient: vi.fn(), createAdminClient: vi.fn(), user: vi.fn(), catalog: vi.fn(), notFound: vi.fn(), snake: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: fixture.createClient, createAdminClient: fixture.createAdminClient }))
vi.mock('@/components/tournament/snake-catalog', () => ({ SnakeCatalog: fixture.snake }))
vi.mock('@/components/tournament/register-button', () => ({ RegisterButton: () => null }))
vi.mock('next/navigation', () => ({ notFound: fixture.notFound }))
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return { default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) =>
    createElement('a', { href, className }, children) }
})

import TournamentsPage, { metadata } from '@/app/(public)/tournaments/page'
import TournamentDetailPage, { generateMetadata } from '@/app/(public)/tournaments/[id]/page'
import { COMMUNITY_FREE_CONFIG } from '@/lib/tournament/community-free'

const id = '10000000-0000-0000-0000-000000000001'
const params = () => ({ params: Promise.resolve({ id }) })
const community = () => ({ ...COMMUNITY_FREE_CONFIG, id, name: 'Reto gratuito', description: null, status: 'open',
  registration_opens_at: '2026-10-20T10:00:00Z', play_window_start: '2026-10-22T10:00:00Z', play_window_end: '2026-10-23T10:00:00Z' })

beforeEach(() => {
  vi.clearAllMocks()
  fixture.row = community()
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), single: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockResolvedValue({ data: [], error: null })
  query.single.mockImplementation(async () => ({ data: fixture.row, error: null }))
  fixture.user.mockResolvedValue({ data: { user: null } })
  fixture.createClient.mockResolvedValue({ from: () => query, auth: { getUser: fixture.user } })
  fixture.createAdminClient.mockImplementation(() => { throw new Error('No count service in this fixture') })
  fixture.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  fixture.snake.mockImplementation(() => { throw new Error('Outside-catalog component must never render') })
})
afterEach(() => vi.unstubAllEnvs())

describe.each(['cloud-development', 'production-free-2048', 'production', undefined])('public tournament scope: %s', environment => {
  beforeEach(() => vi.stubEnv('TORNEOS_ENV', environment))

  it('renders only free 2048 without invoking a legacy game catalogue', async () => {
    const html = renderToStaticMarkup(await TournamentsPage())
    expect(html).toContain('Retos gratuitos de 2048')
    expect(html).toContain('No hay premios ni cobros')
    expect(html).toContain('href="/play"')
    expect(html).not.toMatch(/Snake|snake-arena|Factory Empire|Explorar juegos|demás formatos/i)
    expect(fixture.snake).not.toHaveBeenCalled()
    expect(fixture.createAdminClient).not.toHaveBeenCalled()
    expect(JSON.stringify(metadata)).not.toMatch(/Snake|snake-arena|premios reales/i)
  })
})

it.each([
  { preset_key: 'paid_v1' }, { business_rule_version: 3 }, { entry_fee_cents: 5000 },
  { prize_1st_cents: 100 }, { prize_2nd_cents: 100 }, { prize_3rd_cents: 100 },
  { game_type: 'snake_arena' }, { max_players: 100 }, { is_test: true },
])('direct detail rejects out-of-release events before account or privileged reads: %j', async patch => {
  fixture.row = { ...community(), ...patch }
  await expect(TournamentDetailPage(params())).rejects.toThrow('NEXT_NOT_FOUND')
  expect(fixture.user).not.toHaveBeenCalled()
  expect(fixture.createAdminClient).not.toHaveBeenCalled()
})

it('preserves valid free community detail without payment or identity intake links', async () => {
  const html = renderToStaticMarkup(await TournamentDetailPage(params()))
  expect(html).toContain('reto comunitario gratuito')
  expect(html).toContain('Clasificación sin premios')
  expect(html).toContain('No se requiere verificación financiera ni datos bancarios')
  expect(html).not.toMatch(/href="[^"]*(?:checkout|profile\/kyc|wallet|legal\/reembolso)/)
  expect(html).not.toContain('Premio total fijo')
  expect(fixture.notFound).not.toHaveBeenCalled()
})

it.each([{ preset_key: 'paid_v1' }, { business_rule_version: 3 }, { entry_fee_cents: 5000 }, { prize_1st_cents: 100 }])(
  'does not publish legacy paid event metadata: %j', async patch => {
    fixture.row = { ...community(), name: 'Old paid event', description: 'Old monetary claim', ...patch }
    const result = await generateMetadata(params())
    expect(result.title).toBe('Reto no encontrado — TorneosPlay')
    expect(result.robots).toEqual({ index: false, follow: false })
    expect(JSON.stringify(result)).not.toMatch(/Old paid|Old monetary|premios reales/)
  },
)

it('describes an eligible free event without real-money claims', async () => {
  const result = await generateMetadata(params())
  expect(result.title).toBe('Reto gratuito — TorneosPlay')
  expect(result.description).toContain('sin premios')
  expect(JSON.stringify(result)).not.toContain('premios reales')
})
