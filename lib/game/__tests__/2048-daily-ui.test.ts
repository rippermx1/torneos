import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { Daily2048View, Daily2048ResultProgress, Return2048View } from '@/components/game/2048-daily-progress'
import { Daily2048Progress, getDaily2048Challenge, DAILY_2048_PROGRESS_KEY } from '../daily-2048'
import { Free2048Experience } from '../free-2048-experience'
import { GET } from '@/app/api/2048/daily/route'

const now = Date.parse('2026-10-15T15:00:00Z')
function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } as Storage
  const game = new Free2048Experience({ getStorage: () => storage, category: 'synthetic', now: () => now })
  const challenge = getDaily2048Challenge(now)
  game.selectNext('daily', challenge); game.observe({ type: 'start', score: 0, highestTile: 2, moves: 0 })
  return { game, challenge }
}
it('announces the goal only after it was achieved and does not carry an old goal into today', () => {
  const { game, challenge } = fixture()
  const render = (definition = challenge) => renderToStaticMarkup(createElement(Daily2048View, { challenge: definition, free: game.snapshot(), error: '', onRefresh: () => {} }))
  expect(render()).toContain('Meta de hoy pendiente')
  game.observe({ type: 'move', score: 512, highestTile: 128, moves: 1 })
  expect(render()).toContain('¡Meta de hoy cumplida!')
  const tomorrow = getDaily2048Challenge(challenge.closesAt)
  expect(render(tomorrow)).not.toContain('¡Meta de hoy cumplida!')
  expect(render(tomorrow)).toContain('desafío anterior')
  expect(render()).not.toContain('Nueva marca personal')
})
it('keeps lack of storage and account reporting visible rather than promising persistence', () => {
  const { game } = fixture()
  const free = game.snapshot()
  const end = renderToStaticMarkup(createElement(Daily2048ResultProgress, { daily: { ...free.daily, storageStatus: 'unavailable' } }))
  expect(end).toContain('No se pudo guardar')
  const activity = renderToStaticMarkup(createElement(Return2048View, { free: { ...free, accountStatus: 'unavailable' }, measureAccountActivity: true }))
  expect(activity).toContain('No pudimos registrar')
  expect(activity).not.toContain('Actividad de hoy registrada')
})
it('preserves a future saved day if a local clock moves backwards', () => {
  const data = new Map<string, string>(), challenge = getDaily2048Challenge(now)
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }
  const first = new Daily2048Progress({ getStorage: () => storage, now: () => now })
  first.begin(challenge, 'saved'); first.observe({ type: 'move', score: 512, highestTile: 128, moves: 1 })
  const before = data.get(DAILY_2048_PROGRESS_KEY)
  const reloaded = new Daily2048Progress({ getStorage: () => storage, now: () => now - 86400000 })
  expect(reloaded.snapshot().entries[0].goalReached).toBe(true)
  expect(data.get(DAILY_2048_PROGRESS_KEY)).toBe(before)
})
it('returns the server daily definition without caching across Chile midnight', async () => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  try {
    const first = GET()
    const challenge = await first.json()
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    vi.setSystemTime(challenge.closesAt)
    const next = await GET().json()
    expect(next.day).toBe('2026-10-16')
    expect(next.seed).not.toBe(challenge.seed)
  } finally { vi.useRealTimers() }
})
