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

it('explains only free 2048 and its controls without loading a game', () => {
  const html = render()
  expect(html).toContain('2048'); expect(html).toContain('flechas o WASD')
  expect(html).toContain('desliza sobre el tablero')
  for (const name of ['Ted Runner', 'Factory Empire', 'Snake Arena', 'RTS Duel']) expect(html).not.toContain(name)
  expect(html).not.toContain('<iframe'); expect(html).not.toContain('/games/')
})

it('preserves the selected tournament through the 2048 entry and public detail', () => {
  const html = render(tournament)
  const next = new URLSearchParams({ next: tournament }).toString()
  expect(html).toContain(`href="/play?${next}"`)
  expect(html).toContain(`href="${tournament}"`)
  expect(html).not.toContain('/game/start'); expect(html).not.toContain('/payment')
})

it.each(['https://attacker.test', '//attacker.test', '/admin', `${tournament}/play`, `${tournament}?paid=1`, [tournament, '/admin']])('rejects a non-detail or ambiguous destination %j', next => {
  const html = render(next)
  expect(html).toContain('href="/play"')
  expect(html).not.toContain('?next='); expect(html).not.toContain('Volver al torneo elegido')
})

it('retains the tournament through shared navigation and recomputes it after navigation', () => {
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

it.each(['cloud-development', 'production-free-2048'])('keeps the actual catalog within free scope under %s', async identity => {
  vi.stubEnv('TORNEOS_ENV', identity)
  try {
    const html = renderToStaticMarkup(await GameCatalogPage({ searchParams: Promise.resolve({ next: tournament }) }))
    expect(html).toContain('2048'); expect(html).toContain('ticket informativo')
    for (const name of ['Ted Runner', 'Factory Empire', 'Snake Arena', 'RTS Duel']) expect(html).not.toContain(name)
    expect(html).not.toContain('Aún no disponible en este ambiente.')
  } finally { vi.unstubAllEnvs() }
})
