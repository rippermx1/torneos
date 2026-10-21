import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ next: [] as string[], user: vi.fn(), catalog: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ getAll: () => fixture.next }) }))
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return { default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) =>
    createElement('a', { href, className }, children) }
})
vi.mock('@/lib/supabase/auth', () => ({ getUser: fixture.user }))
vi.mock('@/lib/tournament/public-catalog', () => ({ getPublicTournaments: fixture.catalog }))
vi.mock('@/components/game/unity-2048', () => ({ Unity2048: () => null }))

import PracticePage from '@/app/(public)/play/page'
import CatalogPage, { metadata } from '@/app/(public)/play/catalog/page'
import { PublicGameCatalog } from '@/components/game/public-game-catalog'
import { PracticeNavigation } from '@/components/game/practice-navigation'

const tournament = '/tournaments/12345678-1234-1234-1234-123456789abc'
const render = (value: ReactNode) => renderToStaticMarkup(value)
const hrefs = (value: string) => [...value.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
const outsideCatalog = /Factory Empire|factory-empire|Snake\s?Arena|snake-arena|Ted Runner|ted-runner|alien-run/i

beforeEach(() => {
  fixture.next = []
  fixture.user.mockReset().mockResolvedValue(null)
  fixture.catalog.mockReset().mockResolvedValue({ tournaments: [], error: false, asOf: Date.parse('2026-10-21T15:00:00Z') })
})
afterEach(() => vi.unstubAllEnvs())

describe.each(['cloud-development', 'production-free-2048', 'production', undefined])('fixed catalogue with environment %s', environment => {
  beforeEach(() => vi.stubEnv('TORNEOS_ENV', environment))

  it('renders only the accepted game and its real practice/ticket destinations', async () => {
    const value = render(await CatalogPage({ searchParams: Promise.resolve({}) }))
    expect(value).toContain('data-release-profile="2048-free-v1"')
    expect(value).toContain('Desafío diario')
    expect(value).toContain('todavía no se puede comprar')
    expect(value.match(/<article\b/g)).toHaveLength(1)
    expect(hrefs(value)).toEqual(['/play', '/play/2048/ticket'])
    expect(value).not.toMatch(outsideCatalog)
    expect(value).not.toMatch(/\/checkout|<form\b/)
    expect(fixture.user).not.toHaveBeenCalled()
    expect(fixture.catalog).not.toHaveBeenCalled()
  })

  it('does not reveal legacy game links on the actual practice entry', async () => {
    const value = render(await PracticePage({ searchParams: Promise.resolve({}) }))
    expect(value).toContain('2048 · juega gratis')
    expect(value).toContain('data-release-profile="2048-free-v1"')
    expect(value).not.toMatch(outsideCatalog)
    expect(hrefs(value)).toContain('/play/2048/ticket?from=practice')
    expect(fixture.user).toHaveBeenCalledTimes(1)
    expect(fixture.catalog).toHaveBeenCalledTimes(1)
  })
})

it('describes only the accepted catalogue in public metadata', () => {
  expect(metadata.title).toContain('2048')
  expect(metadata.description).toContain('desafío diario')
  expect(JSON.stringify(metadata)).not.toMatch(outsideCatalog)
})

it('preserves a safe selected-tournament return without changing the game offer', () => {
  const value = render(PublicGameCatalog({ next: tournament })), links = hrefs(value)
  expect(new URL(links[0], 'https://local.test').searchParams.get('next')).toBe(tournament)
  expect(links.slice(1)).toEqual(['/play/2048/ticket', tournament])
  expect(value).not.toMatch(outsideCatalog)
})

it.each(['https://foreign.test', '//foreign.test', ['/tournaments/other'], `${tournament}/play`])(
  'drops an unsafe or ambiguous return rather than adding a new public destination: %s', next => {
    expect(hrefs(render(PublicGameCatalog({ next })))).toEqual(['/play', '/play/2048/ticket'])
  },
)

it('keeps practice navigation specific to 2048 and preserves its safe return', () => {
  fixture.next = [tournament]
  const value = render(PracticeNavigation()), links = hrefs(value)
  expect(value).toContain('Navegación de 2048')
  expect(value).toContain('Guía de 2048')
  expect(value).not.toContain('Explorar juegos')
  expect(new URL(links[0], 'https://local.test').pathname).toBe('/play/catalog')
  expect(new URL(links[0], 'https://local.test').searchParams.get('next')).toBe(tournament)
  expect(links[1]).toBe(tournament)
})

it('drops duplicate navigation return parameters', () => {
  fixture.next = [tournament, tournament]
  expect(hrefs(render(PracticeNavigation()))).toEqual(['/play/catalog'])
})
