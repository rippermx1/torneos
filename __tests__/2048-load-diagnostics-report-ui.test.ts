import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse2048TrialLocalExport, type Trial2048LocalMetrics } from '@/lib/analytics/2048-trial-local'
import type { Load2048Attempt, Load2048DiagnosticsSnapshot } from '@/lib/game/2048-load-diagnostics'
import { Sessions2048 } from '@/lib/game/sessions-2048'

const fixture = vi.hoisted(() => ({ index: 0, states: [] as unknown[], generation: { current: 0 }, cleanups: [] as (() => void)[] }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useId: () => 'load-report-file', useRef: () => fixture.generation,
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
  useState: (initial: unknown) => {
    const index = fixture.index++
    if (!(index in fixture.states)) fixture.states[index] = initial
    return [fixture.states[index], (value: unknown) => { fixture.states[index] = value }]
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
import { build2048TrialAggregate, Trial2048Report } from '@/components/admin/2048-trial-report'

const base = Date.parse('2026-10-20T15:00:00Z'), build = 'unity-2048-007'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function attempt(patch: Partial<Load2048Attempt> = {}): Load2048Attempt {
  return { id: id(101), build, startedAt: base, result: 'ready', durationMs: 500,
    practiceId: null, entry: null, mode: null, entryAt: null, retryOf: null, ...patch }
}
function diagnostics(entries = [attempt()], patch: Partial<Load2048DiagnosticsSnapshot> = {}): Load2048DiagnosticsSnapshot {
  return { format: 'torneos.2048.load-diagnostics', version: 1, category: 'observed_browser', entries, capturedAt: base + 10000,
    truncated: false, observationGap: false, storageStatus: 'ready', ...patch }
}
function linkedMetrics() {
  let now = base + 500, serial = 0
  const tracker = new Sessions2048({ getStorage: () => null, build, rulesVersion: '2048-practice-v1', mode: 'practice', category: 'observed_browser',
    now: () => now, uuid: () => id(++serial) })
  tracker.ready(); now = base + 600; tracker.start(id(900)); now = base + 700; tracker.validMove(id(900), 1); now = base + 10000
  return parse2048TrialLocalExport(JSON.stringify({ format: 'torneos.2048.free-observations', version: 1,
    observations: { format: 'torneos.2048.local-observations', version: 1, ledger: tracker.snapshot() },
    loadDiagnostics: diagnostics([attempt({ practiceId: id(900), entry: 'new', mode: 'practice', entryAt: base + 600 })]) }))
}
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child) ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function view() { fixture.index = 0; return Trial2048Report({ snapshot: null, from: '2026-10-01', to: '2026-10-20' }) }
function html(local: Trial2048LocalMetrics) { fixture.states[0] = local; return renderToStaticMarkup(view()) }
function button(tree: ReactNode, label: string) { return nodes(tree).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)! }
function select(file: { size: number; text(): Promise<string> }) {
  const input = nodes(view()).find(node => node.type === 'input' && node.props.type === 'file')!
  const target = { files: [file], value: 'private-filename@example.test.json' }
  ;(input.props.onChange as (event: ChangeEvent<HTMLInputElement>) => void)({ currentTarget: target } as unknown as ChangeEvent<HTMLInputElement>)
  return target
}
async function flush() { for (let index = 0; index < 6; index++) await Promise.resolve() }

beforeEach(() => { fixture.index = 0; fixture.states = []; fixture.generation = { current: 0 }; fixture.cleanups = []; vi.useFakeTimers() })
afterEach(() => { fixture.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); vi.useRealTimers() })

it('accepts the pre-ready diagnostic through the existing picker without upload, storage or gameplay activity', async () => {
  const fetch = vi.fn(), storage = { getItem: vi.fn(), setItem: vi.fn() }
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('localStorage', storage)
  const raw = JSON.stringify(diagnostics([attempt({ result: 'error', durationMs: 300 })]))
  const selected = select({ size: raw.length, text: async () => raw }); await flush()
  const rendered = renderToStaticMarkup(view())
  expect(selected.value).toBe('')
  expect(rendered).toContain('Intentos retenidos: 1 · listos: 0 · errores: 1')
  expect(rendered).toContain('Hitos desconocidos: el diagnóstico autónomo')
  expect(rendered).toContain('Desconocido: este archivo no aporta observaciones de práctica')
  expect(rendered).toContain('una descarga de «Mi progreso» o un diagnóstico de carga')
  expect(rendered).not.toContain('private-filename')
  expect(fetch).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
})

it('renders all outcomes with unknown timing samples instead of equating inconclusive or ongoing loads with abandonment', () => {
  const metrics = parse2048TrialLocalExport(JSON.stringify(diagnostics([
    attempt({ result: 'timeout', durationMs: 900 }), attempt({ id: id(102), startedAt: base + 1000, result: 'inconclusive', durationMs: null }),
    attempt({ id: id(103), startedAt: base + 2000, result: 'loading', durationMs: null }),
  ])))
  const rendered = html(metrics)
  expect(rendered).toContain('timeout: 1 · inconclusos: 1 · en curso: 1')
  expect(rendered).toContain('desconocido; sin muestras temporales válidas · muestras: 0')
  expect(rendered).toContain('Inconcluso no significa abandono')
  expect(rendered).toContain('Cargar o descargar no acredita juego ni retorno')
  expect(rendered).toContain('Rewarded en demostración'); expect(rendered).toContain('Ticket informativo, todavía no disponible')
})

it('shows linked milestone denominators and latency sample counts separately from ordinary practice totals', () => {
  const rendered = html(linkedMetrics())
  expect(rendered).toContain('Prácticas compatibles distintas: 1')
  expect(rendered).toContain('Primer movimiento observado después de entrar: 1 / 1 prácticas enlazadas')
  expect(rendered).toContain('Primer movimiento desde carga: media 700 ms')
  expect(rendered).toContain('Primer movimiento desde listo: media 200 ms')
  expect(rendered).toContain('Veinte movimientos desde carga: desconocido; sin muestras temporales válidas')
  expect(rendered).toContain('no se suman a sus conteos')
  expect(rendered).toContain('primer movimiento válido: 1 · veinte movimientos válidos: 0')
})

it('keeps older files without diagnostics readable and explains missing data rather than adding zeros', () => {
  const metrics = linkedMetrics(); delete metrics.loadDiagnostics
  const rendered = html(metrics)
  expect(rendered).toContain('Desconocido: este archivo no aporta diagnóstico de carga')
  expect(rendered).not.toContain('Intentos retenidos: 0')
  const aggregate = build2048TrialAggregate(null, metrics)
  expect(Object.hasOwn(aggregate.sources.local.summary!, 'loadDiagnostics')).toBe(false)
})

it('marks QA and conflict coverage explicitly and leaves nonmatching milestones unknown', () => {
  const diagnosticsOnly = parse2048TrialLocalExport(JSON.stringify(diagnostics([], { category: 'synthetic', storageStatus: 'conflict', observationGap: true })))
  const rendered = html(diagnosticsOnly)
  expect(rendered).toContain('QA sintética'); expect(rendered).toContain('Cobertura: desconocida')
  expect(rendered).toContain('Almacenamiento: no disponible')
  expect(rendered).toContain('Hitos desconocidos')
})

it('replaces a previous local selection and rejects malformed sources without exposing raw errors or merging attempts', async () => {
  fixture.states[0] = linkedMetrics()
  const raw = JSON.stringify(diagnostics([attempt({ result: 'error', durationMs: 200 })]))
  select({ size: raw.length, text: async () => raw }); await flush()
  expect((fixture.states[0] as Trial2048LocalMetrics).practice).toBeNull()
  select({ size: 100, text: async () => '{"format":"torneos.2048.load-diagnostics","email":"private@example.test"}' }); await flush()
  expect(fixture.states[0]).toBeNull()
  const rendered = renderToStaticMarkup(view())
  expect(rendered).toContain('No pudimos leer este registro')
  expect(rendered).not.toContain('private@example.test')
})

it('downloads only the projected diagnostic aggregate without source IDs, attempt rows or raw fields', async () => {
  const local = linkedMetrics()
  Object.assign(local.loadDiagnostics!, { entries: [{ id: 'private-attempt-id' }], filename: 'private-source-file', rawJSON: 'private-raw-json' })
  Object.assign(local.loadDiagnostics!.quality, { privateAccountId: 'private-account-id' })
  const aggregate = build2048TrialAggregate(null, local), serialized = JSON.stringify(aggregate)
  expect(serialized).not.toMatch(/private-|"(?:practiceId|retryOf|startedAt|entryAt|capturedAt|entries|rawJSON|filename)"/)
  expect(serialized).not.toContain(id(900)); expect(serialized).not.toContain(build)
  expect(aggregate.sources.local.summary?.loadDiagnostics?.milestones?.firstValidMove.practices).toBe(1)
  let exported!: Blob
  const anchor = { href: '', download: '', click: vi.fn() }
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:load-report' }, revokeObjectURL: vi.fn() })
  vi.stubGlobal('document', { createElement: () => anchor })
  fixture.states[0] = local
  ;(button(view(), 'Descargar informe agregado JSON').props.onClick as () => void)()
  expect(anchor.download).toBe('2048-informe-ensayo-agregado.json')
  const downloaded = JSON.parse(await exported.text())
  expect(downloaded.sources.local.summary.loadDiagnostics).toEqual(aggregate.sources.local.summary?.loadDiagnostics)
  expect(JSON.stringify(downloaded)).not.toContain('private-')
  expect(downloaded.sources.accountRetention.status).toBe('unavailable')
})
