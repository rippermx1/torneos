import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const query = vi.hoisted(() => ({ value: new URLSearchParams() }))
vi.mock('next/link', () => ({ default: (props: Record<string, unknown>) => {
  const anchor = { ...props }; delete anchor.prefetch
  return createElement('a', anchor)
} }))
vi.mock('next/navigation', () => ({ useSearchParams: () => query.value }))
import { PublicGameCatalog } from '@/components/game/public-game-catalog'
import { PracticeNavigation } from '@/components/game/practice-navigation'
import GameCatalogPage from '@/app/(public)/play/catalog/page'

const tournament = '/tournaments/12345678-1234-1234-1234-123456789abc'
const render = (next?: unknown) => renderToStaticMarkup(createElement(PublicGameCatalog, { next }))
beforeEach(() => { query.value = new URLSearchParams() })

it('offers only 2048 with its controls without loading a game', () => {
  const html = render()
  expect(html).toContain('Practicar 2048')
  expect(html).toContain('flechas o WASD')
  expect(html).toContain('La práctica no requiere cuenta ni entrega premios.')
  expect(html.match(/<article /g)).toHaveLength(1)
  expect(html).not.toMatch(/Ted Runner|Factory Empire|Snake Arena|FRONTERA RTS/)
  expect(html).not.toContain('<iframe'); expect(html).not.toContain('/games/')
})

it('preserves a chosen tournament on the practice entry and offers its public detail', () => {
  const html = render(tournament)
  const next = new URLSearchParams({ next: tournament }).toString()
  expect(html).toContain(`href="/play?${next}"`)
  expect(html).toContain(`href="${tournament}"`)
  expect(html).not.toContain('/game/start'); expect(html).not.toContain('/payment')
})

it.each(['https://attacker.test', '//attacker.test', '/admin', `${tournament}/play`, `${tournament}?paid=1`, [tournament, '/admin']])('rejects a non-detail or ambiguous destination %j', next => {
  const html = render(next)
  expect(html).toContain('href="/play"'); expect(html).toContain('href="/tournaments"')
  expect(html).not.toContain('?next='); expect(html).not.toContain('Volver al torneo elegido')
})

it('retains the tournament through the shared navigation and recomputes it after navigation', () => {
  query.value = new URLSearchParams({ next: tournament })
  const html = renderToStaticMarkup(createElement(PracticeNavigation))
  expect(html).toContain(`href="/play/catalog?${query.value}"`)
  expect(html).toContain(`href="${tournament}"`)
  query.value = new URLSearchParams('next=%2Fadmin')
  const after = renderToStaticMarkup(createElement(PracticeNavigation))
  expect(after).toContain('href="/play/catalog"'); expect(after).not.toContain('Torneo seleccionado')
})

it('rejects duplicate next parameters in shared navigation', () => {
  query.value = new URLSearchParams([['next', tournament], ['next', '/admin']])
  expect(renderToStaticMarkup(createElement(PracticeNavigation))).not.toContain('?next=')
})

it.each(['cloud-development', 'production'])('offers only 2048 on the actual page in %s', async environment => {
  vi.stubEnv('TORNEOS_ENV', environment)
  try {
    const html = renderToStaticMarkup(await GameCatalogPage({ searchParams: Promise.resolve({ next: tournament }) }))
    expect(html).toContain('Practicar 2048')
    expect(html).toContain(`href="${tournament}"`)
    expect(html.match(/<article /g)).toHaveLength(1)
    expect(html).not.toMatch(/Ted Runner|Factory Empire|Snake Arena|FRONTERA RTS/)
  } finally { vi.unstubAllEnvs() }
})
