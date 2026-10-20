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
const render = (next?: unknown, tedAvailable = true) => renderToStaticMarkup(createElement(PublicGameCatalog, { next, tedAvailable }))
beforeEach(() => { query.value = new URLSearchParams() })

it('explains controls and separates competitive 2048 from free Ted practice without loading a game', () => {
  const html = render()
  expect(html).toContain('Practicar 2048'); expect(html).toContain('Practicar Ted Runner')
  expect(html).toContain('flechas o WASD'); expect(html).toContain('Espacio para saltar')
  const ted = html.slice(html.indexOf('aria-labelledby="catalog-ted"'))
  expect(ted).toContain('Práctica sin inscripción, torneos ni premios.')
  expect(ted).not.toContain('href="/tournaments')
  expect(html).not.toContain('<iframe'); expect(html).not.toContain('/games/')
})

it('preserves a chosen tournament on both practice entries and offers its public detail', () => {
  const html = render(tournament)
  const next = new URLSearchParams({ next: tournament }).toString()
  expect(html).toContain(`href="/play?${next}"`)
  expect(html).toContain(`href="/play/alien-run?${next}"`)
  expect(html).toContain(`href="${tournament}"`)
  expect(html).not.toContain('/game/start'); expect(html).not.toContain('/payment')
})

it.each(['https://attacker.test', '//attacker.test', '/admin', `${tournament}/play`, `${tournament}?paid=1`, [tournament, '/admin']])('rejects a non-detail or ambiguous destination %j', next => {
  const html = render(next)
  expect(html).toContain('href="/play"'); expect(html).toContain('href="/tournaments"')
  expect(html).not.toContain('?next='); expect(html).not.toContain('Volver al torneo elegido')
})

it('keeps unavailable Ted discoverable without advertising a broken practice link', () => {
  const html = render(tournament, false)
  expect(html).toContain('Ted Runner'); expect(html).toContain('Aún no disponible en este ambiente.')
  expect(html).not.toContain('href="/play/alien-run'); expect(html).toContain('Practicar 2048')
})

it('offers the colony, community and normalized challenge without mounting Unity in the catalog', () => {
  const html = render()
  expect(html).toContain('Factory Empire 3D')
  expect(html).toContain('href="/play/factory-empire"')
  expect(html).toContain('href="/play/factory-empire/community"')
  expect(html).toContain('href="/play/factory-empire/challenge"')
  expect(html).toContain('Jugar Snake Arena')
  expect(html).not.toContain('<iframe')
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

it('applies the existing cloud availability constraint in the actual page', async () => {
  vi.stubEnv('TORNEOS_ENV', 'cloud-development')
  try {
    const html = renderToStaticMarkup(await GameCatalogPage({ searchParams: Promise.resolve({ next: tournament }) }))
    expect(html).toContain('Aún no disponible en este ambiente.')
    expect(html).not.toContain('Practicar Ted Runner')
    expect(html).toContain('Snake Arena')
    expect(html).toContain('Las salas multijugador aún no están disponibles')
    expect(html).not.toContain('href="/play/snake-arena')
    expect(html).toContain('Jugar Factory Empire')
  } finally { vi.unstubAllEnvs() }
})
