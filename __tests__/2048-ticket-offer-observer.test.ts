import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TicketOfferObservations, TICKET_OFFER_OBSERVATIONS_KEY } from '@/lib/games/2048/ticket-offer-observations'

const harness = vi.hoisted(() => ({ effects: [] as (() => void)[], ref: { current: false } }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useRef: () => harness.ref,
  useEffect: (effect: () => void) => { harness.effects.push(effect) },
}))
import { TicketOffer2048Observer } from '@/components/game/2048-ticket-offer-observer'

beforeEach(() => { harness.effects = []; harness.ref = { current: false } })
afterEach(() => { vi.unstubAllGlobals() })
function storageFixture() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, raw: string) => data.set(key, raw) }
  vi.stubGlobal('window', { localStorage: storage })
  return { data, storage }
}

it('does not access storage during render or send network and records one effect across Strict Mode replay', () => {
  const { data, storage } = storageFixture(), fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(TicketOffer2048Observer({ source: 'practice', category: 'observed_browser' })).toBeNull()
  expect(data.size).toBe(0)
  const effect = harness.effects[0]
  effect(); effect() // React Strict Mode replays setup with the same committed ref.
  TicketOffer2048Observer({ source: 'result', category: 'observed_browser' })
  harness.effects[1]() // Prop changes within the same mounted observer are not another page view.
  expect(new TicketOfferObservations({ getStorage: () => storage, category: 'observed_browser' }).snapshot().summary)
    .toEqual({ retainedViews: 1, bySource: { practice: 1, result: 0, direct: 0 } })
  expect(fetch).not.toHaveBeenCalled()
  harness.ref = { current: false } // A genuinely new mount is a new local visit.
  TicketOffer2048Observer({ source: 'result', category: 'observed_browser' }); harness.effects[2]()
  expect(new TicketOfferObservations({ getStorage: () => storage, category: 'observed_browser' }).snapshot().summary.retainedViews).toBe(2)
})

it('renders no invented commercial status and remains safe when storage is denied', () => {
  const denied = vi.fn(() => { throw new Error('denied') })
  vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', { get: denied }))
  expect(renderToStaticMarkup(createElement(TicketOffer2048Observer, { source: 'direct', category: 'synthetic' }))).toBe('')
  expect(denied).not.toHaveBeenCalled()
  expect(() => { harness.effects[0](); harness.effects[0]() }).not.toThrow()
  expect(denied).toHaveBeenCalledTimes(1)
})

it('keeps the trusted server category supplied to the observer, independent of URL or editable browser metadata', () => {
  const { data } = storageFixture()
  vi.stubGlobal('location', { search: '?synthetic=false&category=observed_browser' })
  TicketOffer2048Observer({ source: 'result', category: 'synthetic' }); harness.effects[0]()
  expect([...data.keys()]).toEqual([`${TICKET_OFFER_OBSERVATIONS_KEY}.synthetic`])
})
