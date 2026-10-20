/** Informational page views only. No account, game, payment or network authority. */
export const TICKET_OFFER_OBSERVATIONS_KEY = 'torneos.2048.ticket-offer-observations.v1'
export const MAX_TICKET_OFFER_VIEWS = 200
export const TICKET_OFFER_OBSERVATIONS_SCOPE = 'Visitas locales retenidas a información sobre tickets. No son personas únicas, demanda validada, inscripciones, compras, elegibilidad, ingresos ni retención comercial.'
export type TicketOfferSource = 'practice' | 'result' | 'direct'
export type TicketOfferCategory = 'observed_browser' | 'synthetic'

type View = { id: string; source: TicketOfferSource; at: number }
type StorageStatus = 'ready' | 'unavailable' | 'corrupt'
type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>
interface Data {
  version: 1
  category: TicketOfferCategory
  capturedAt: number
  views: View[]
  truncated: boolean
  observationGap: boolean
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const time = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)
const category = (value: unknown): value is TicketOfferCategory => value === 'observed_browser' || value === 'synthetic'
const source = (value: unknown): value is TicketOfferSource => value === 'practice' || value === 'result' || value === 'direct'

/** Only explicit, recognized attribution is retained; never store a raw query. */
export function normalizeTicketOfferSource(value: unknown): TicketOfferSource {
  return value === 'practice' || value === 'result' ? value : 'direct'
}

/** A malformed ledger is rejected in full, without rewriting its original bytes. */
export function readTicketOfferObservations(raw: string | null): Data | null {
  if (raw === null || raw.length > 65_536) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || !exact(value, ['version', 'category', 'capturedAt', 'views', 'truncated', 'observationGap'])
      || value.version !== 1 || !category(value.category) || !time(value.capturedAt) || !Array.isArray(value.views)
      || value.views.length > MAX_TICKET_OFFER_VIEWS || typeof value.truncated !== 'boolean' || typeof value.observationGap !== 'boolean') return null
    const seen = new Set<string>(), views: View[] = []
    for (const view of value.views) {
      if (!record(view) || !exact(view, ['id', 'source', 'at']) || !uuid(view.id) || !source(view.source)
        || !time(view.at) || view.at > value.capturedAt || seen.has(view.id.toLowerCase())) return null
      seen.add(view.id.toLowerCase())
      views.push({ id: view.id.toLowerCase(), source: view.source, at: view.at })
    }
    return { version: 1, category: value.category, capturedAt: value.capturedAt, views,
      truncated: value.truncated, observationGap: value.observationGap }
  } catch { return null }
}

export class TicketOfferObservations {
  private data: Data
  private storageStatus: StorageStatus = 'ready'
  private key: string
  constructor(private options: {
    getStorage: () => LocalStorage | null
    category: TicketOfferCategory
    now?: () => number
    uuid?: () => string
  }) {
    this.key = `${TICKET_OFFER_OBSERVATIONS_KEY}${options.category === 'synthetic' ? '.synthetic' : ''}`
    this.data = { version: 1, category: options.category, capturedAt: 0, views: [], truncated: false, observationGap: false }
    if (!category(options.category)) this.storageStatus = 'corrupt'
    this.refresh()
  }
  private refresh() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      const raw = storage.getItem(this.key)
      if (raw === null) { if (this.data.views.length) this.data.observationGap = true; return }
      const stored = readTicketOfferObservations(raw)
      if (!stored || stored.category !== this.data.category) { this.storageStatus = 'corrupt'; return }
      const views = new Map(stored.views.map(view => [view.id, view]))
      for (const view of this.data.views) {
        const previous = views.get(view.id)
        if (previous && (previous.source !== view.source || previous.at !== view.at)) { this.storageStatus = 'corrupt'; return }
      }
      // Successful observations are already persisted. Read the latest ledger;
      // merging stale bounded snapshots could resurrect views pruned by another tab.
      this.data = { ...stored,
        truncated: this.data.truncated || stored.truncated,
        observationGap: this.data.observationGap || stored.observationGap }
    } catch { this.storageStatus = 'unavailable' }
  }
  recordView(from: unknown): boolean {
    this.refresh()
    if (this.storageStatus !== 'ready') return false
    try {
      const at = (this.options.now ?? Date.now)(), id = (this.options.uuid ?? (() => globalThis.crypto.randomUUID()))()
      if (!time(at) || !uuid(id)) { this.data.observationGap = true; return false }
      if (this.data.views.some(view => view.id === id.toLowerCase())) return false
      const next: Data = { ...this.data, capturedAt: Math.max(this.data.capturedAt, at),
        views: [...this.data.views, { id: id.toLowerCase(), source: normalizeTicketOfferSource(from), at }].slice(-MAX_TICKET_OFFER_VIEWS),
        truncated: this.data.truncated || this.data.views.length >= MAX_TICKET_OFFER_VIEWS,
        observationGap: this.data.observationGap || at < this.data.capturedAt }
      const storage = this.options.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return false }
      const raw = JSON.stringify(next)
      storage.setItem(this.key, raw)
      if (storage.getItem(this.key) !== raw) { this.storageStatus = 'unavailable'; return false }
      this.data = next
      return true
    } catch { this.storageStatus = 'unavailable'; return false }
  }
  snapshot() {
    this.refresh()
    const views = this.data.views.map(view => ({ ...view }))
    const bySource = { practice: 0, result: 0, direct: 0 }
    for (const view of views) bySource[view.source]++
    return { ...this.data, views, scope: TICKET_OFFER_OBSERVATIONS_SCOPE,
      quality: { storageStatus: this.storageStatus, truncated: this.data.truncated, observationGap: this.data.observationGap,
        coverage: this.storageStatus === 'ready' && !this.data.truncated && !this.data.observationGap ? 'local_best_effort' : 'unknown' },
      summary: { retainedViews: views.length, bySource } }
  }
}
