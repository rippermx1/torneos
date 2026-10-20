import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Operations2048, Session2048Operations } from '@/lib/analytics/2048-trial-operations'

const fixture = vi.hoisted(() => ({ index: 0, states: [] as unknown[], generation: { current: 0 },
  cleanups: [] as (() => void)[], mfa: vi.fn(), connection: vi.fn(), order: [] as string[], summaryFails: false }))
vi.mock('server-only', () => ({}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/server', () => ({ connection: fixture.connection }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfa: fixture.mfa }))
vi.mock('@/lib/analytics/2048-trial-operations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/analytics/2048-trial-operations')>('@/lib/analytics/2048-trial-operations')
  return { ...actual, build2048TrialOperationsSummary: (...args: Parameters<typeof actual.build2048TrialOperationsSummary>) => {
    if (fixture.summaryFails) throw new Error('private internal failure')
    return actual.build2048TrialOperationsSummary(...args)
  } }
})
vi.mock('react', async () => ({ ...await vi.importActual('react'), useId: () => 'operations-file',
  useRef: () => fixture.generation,
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
  useState: (initial: unknown) => {
    const index = fixture.index++
    if (!(index in fixture.states)) fixture.states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [fixture.states[index], (value: unknown) => {
      fixture.states[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(fixture.states[index]) : value
    }]
  },
}))

import Page from '@/app/(admin)/admin/reports/2048-trial/operations/page'
import { Trial2048Operations } from '@/components/admin/2048-trial-operations'
import { create2048TrialOperations, parse2048TrialOperations, build2048TrialOperationsSummary } from '@/lib/analytics/2048-trial-operations'

const today = '2026-10-20', practiceUrl = 'https://torneos-dev.vercel.app/play'
type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child) ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function view() { fixture.index = 0; return Trial2048Operations({ asOfDay: today, practiceUrl }) }
function ops() { return fixture.states[0] as Operations2048 }
function button(tree: ReactNode, label: string) {
  const node = nodes(tree).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)
  expect(node).toBeDefined(); return node!
}
function click(label: string) { const node = button(view(), label); expect(node.props.disabled).not.toBe(true); (node.props.onClick as () => void)() }
function field(tree: ReactNode, label: string) {
  const node = nodes(tree).find(node => node.props.label === label)
  expect(node).toBeDefined(); return node!
}
function change(tree: ReactNode, label: string, value: unknown) { (field(tree, label).props.onChange as (value: unknown) => void)(value) }
function session(tree: ReactNode, code = 'S01') {
  const node = nodes(tree).find(node => (node.props.session as Session2048Operations | undefined)?.code === code)
  expect(node).toBeDefined(); return node!
}
function renderNode(node: Node) { return (node.type as (props: Record<string, unknown>) => ReactNode)(node.props) }
function patchSession(patch: Partial<Session2048Operations>, code = 'S01') {
  ;(session(view(), code).props.onChange as (patch: Partial<Session2048Operations>) => void)(patch)
}
function follow(title = 'Seguimiento D1 manual') {
  const tree = renderNode(session(view()))
  return renderNode(nodes(tree).find(node => node.props.title === title)!)
}
function selectFile(file: { size: number; text(): Promise<string> }) {
  const input = nodes(view()).find(node => node.type === 'input' && node.props.type === 'file')!
  const target = { files: [file], value: 'private-filename@example.test.json' }
  ;(input.props.onChange as (event: ChangeEvent<HTMLInputElement>) => void)({ currentTarget: target } as unknown as ChangeEvent<HTMLInputElement>)
  return target
}
async function flush() { for (let index = 0; index < 6; index++) await Promise.resolve() }
function file(value: Operations2048) { const text = JSON.stringify(value); return { size: text.length, text: async () => text } }
function observed(day = '2026-10-18') { const value = create2048TrialOperations(); value.sessions[0] = { ...value.sessions[0], sessionDay: day, firstMove: 'observed' }; return value }
function nativeInput(label: string) {
  const node = nodes(view()).find(node => node.type === 'label' && textOf(node.props.children as ReactNode).startsWith(label))!
  return nodes(node.props.children as ReactNode).find(child => child.type === 'input')!
}

beforeEach(() => {
  vi.clearAllMocks(); fixture.index = 0; fixture.states = []; fixture.generation = { current: 0 }; fixture.cleanups = []; fixture.order = []; fixture.summaryFails = false
  fixture.mfa.mockImplementation(async () => { fixture.order.push('mfa') })
  fixture.connection.mockImplementation(async () => { fixture.order.push('connection') })
  vi.useFakeTimers(); vi.setSystemTime('2026-10-20T15:00:00Z')
})
afterEach(() => { fixture.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); vi.useRealTimers() })

it('requires MFA before obtaining the request date or returning the operations editor', async () => {
  fixture.mfa.mockRejectedValueOnce(new Error('MFA required'))
  await expect(Page()).rejects.toThrow('MFA required')
  expect(fixture.connection).not.toHaveBeenCalled()
  const element = await Page()
  expect(fixture.order).toEqual(['mfa', 'connection'])
  expect(element.props).toEqual({ asOfDay: today, practiceUrl })
})

it('derives the server day in Chile and exposes no query-controlled clock or invitation origin', async () => {
  vi.setSystemTime('2026-10-20T01:00:00Z')
  const element = await Page()
  expect(element.props.asOfDay).toBe('2026-10-19')
  expect(element.props.practiceUrl).toBe(practiceUrl)
})

it('starts with eight unknown collapsed slots and no start date, people, activity or cost measurements', () => {
  const tree = view(), html = renderToStaticMarkup(tree)
  expect(ops().sessions).toHaveLength(8)
  expect(ops().sessions.map(value => value.code)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'])
  const summary = build2048TrialOperationsSummary(ops(), today)
  expect(summary.calendar).toMatchObject({ basis: 'unplanned', day1: null, day14: null })
  expect(summary.totals.firstMove).toEqual({ unknown: 8, observed: 0, not_observed: 0 })
  expect(summary.totals.work).toMatchObject({ knownMinutes: null, knownCostClp: null, entries: 0 })
  expect(html).toContain('No se guarda automáticamente')
  expect(html).toContain('0 primeros movimientos observados')
  expect(html).toContain('Minutos declarados conocidos: Desconocido')
  expect(html).not.toContain('<details open')
  const cards = nodes(tree).filter(node => node.props.session)
  expect(cards).toHaveLength(8)
  expect(cards.every(node => !nodes(renderNode(node)).find(child => child.type === 'details')!.props.open)).toBe(true)
})

it('editing marks the document dirty and a planned date remains a proposal until a first move is observed', () => {
  change(view(), 'Fecha propuesta de inicio (opcional)', '2026-10-25')
  expect(build2048TrialOperationsSummary(ops(), today).calendar).toMatchObject({ basis: 'proposed', actualStartDay: null, day14: '2026-11-07' })
  patchSession({ invitation: 'accepted', sessionDay: '2026-10-18' })
  expect(build2048TrialOperationsSummary(ops(), today).calendar.basis).toBe('proposed')
  patchSession({ firstMove: 'observed' })
  expect(build2048TrialOperationsSummary(ops(), today).calendar).toMatchObject({ basis: 'observed_session', day1: '2026-10-18', day14: '2026-10-31' })
  expect(renderToStaticMarkup(view())).toContain('Cambios sin descargar')
})

it('records a reminder separately while mature unknown follow-up remains unverified rather than absent', () => {
  fixture.states[0] = observed('2026-10-12')
  change(follow('Seguimiento D7 manual'), 'Recordatorio o ayuda', 'general_reminder')
  const summary = build2048TrialOperationsSummary(ops(), today)
  expect(summary.sessions[0].d7).toMatchObject({ maturity: 'mature', activity: 'unknown', prompt: 'general_reminder' })
  expect(summary.totals.d7.activity.observed).toBe(0)
  expect(summary.totals.d7.activity.not_observed).toBe(0)
  expect(ops().sessions[0].d7.checkedDay).toBeNull()
  const html = renderToStaticMarkup(view())
  expect(html).toContain('de las fichas maduras, 1 sin comprobación')
  expect(html).toContain('Un recordatorio no acredita regreso')
  expect(html).not.toContain('Ausencia comprobada')
})

it('keeps an activity reported on the open target day separate from a mature result and refreshes the date explicitly', () => {
  fixture.states[0] = observed('2026-10-19')
  change(follow(), 'Actividad en el día objetivo', 'participant_reported')
  expect(button(view(), 'Descargar registro JSON para reabrir').props.disabled).toBe(true)
  change(follow(), 'Fecha de comprobación', today)
  expect(build2048TrialOperationsSummary(ops(), today).sessions[0].d1).toMatchObject({ maturity: 'open', activity: 'participant_reported' })
  expect(build2048TrialOperationsSummary(ops(), today).totals.d1.maturity.mature).toBe(0)
  vi.setSystemTime('2026-10-21T15:00:00Z'); click('Actualizar fecha de seguimiento')
  expect(fixture.states[1]).toBe('2026-10-21')
  expect(build2048TrialOperationsSummary(ops(), fixture.states[1] as string).sessions[0].d1.maturity).toBe('mature')
  expect(ops().sessions[0].d1.checkedDay).toBe(today)
})

it('requires a separate empty document to change category and never copies synthetic observations into real declarations', () => {
  fixture.states[0] = observed()
  change(view(), 'Categoría del nuevo registro', 'synthetic')
  expect(ops().category).toBe('declared_real')
  expect(button(view(), 'Crear nuevo registro vacío').props.disabled).toBe(true)
  const accept = nodes(view()).find(node => node.type === 'input' && node.props.type === 'checkbox')!
  ;(accept.props.onChange as (event: unknown) => void)({ currentTarget: { checked: true } })
  click('Crear nuevo registro vacío')
  expect(ops()).toEqual(create2048TrialOperations('synthetic'))
  expect(renderToStaticMarkup(view())).toContain('QA sintética')
  change(view(), 'Categoría del nuevo registro', 'declared_real')
  expect(ops().category).toBe('synthetic')
})

it('imports a valid file as a replacement only in memory, preserving its category and hiding the filename', async () => {
  const fetch = vi.fn(), storage = { getItem: vi.fn(), setItem: vi.fn() }
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('localStorage', storage)
  fixture.states[0] = observed()
  const next = create2048TrialOperations('synthetic'); next.plan.channel = 'community'
  const target = selectFile(file(next)); await flush()
  expect(target.value).toBe(''); expect(ops()).toEqual(next); expect(fixture.states[2]).toBe(false)
  const html = renderToStaticMarkup(view())
  expect(html).toContain('no se mezcló con el anterior'); expect(html).not.toContain('private-filename')
  expect(fetch).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
})

it('preserves the current document and dirty state after invalid content without revealing raw details', async () => {
  patchSession({ invitation: 'invited' }); const previous = ops()
  selectFile({ size: 100, text: async () => '{"email":"private@example.test"}' }); await flush()
  expect(ops()).toBe(previous); expect(fixture.states[2]).toBe(true)
  const html = renderToStaticMarkup(view())
  expect(html).toContain('No se importó; registro actual conservado')
  expect(html).not.toContain('private@example.test')
})

it('bounds both advertised file size and actual UTF-8 content before replacing the current document', async () => {
  view(); const previous = ops(), text = vi.fn(async () => '{}')
  selectFile({ size: 250_001, text }); await flush()
  expect(text).not.toHaveBeenCalled(); expect(ops()).toBe(previous)
  selectFile({ size: 1, text: async () => 'é'.repeat(125_001) }); await flush()
  expect(ops()).toBe(previous)
})

it('ignores stale imports after a newer file, an edit or unmount', async () => {
  let resolve!: (text: string) => void
  selectFile({ size: 20, text: () => new Promise<string>(done => { resolve = done }) })
  const newer = create2048TrialOperations('synthetic')
  selectFile(file(newer)); await flush(); resolve(JSON.stringify(observed())); await flush()
  expect(ops()).toEqual(newer)
  selectFile({ size: 20, text: () => new Promise<string>(done => { resolve = done }) })
  change(view(), 'Canal principal', 'social'); const edited = ops()
  resolve(JSON.stringify(observed())); await flush(); expect(ops()).toBe(edited)
  selectFile({ size: 20, text: () => new Promise<string>(done => { resolve = done }) })
  fixture.cleanups.forEach(cleanup => cleanup()); resolve(JSON.stringify(observed())); await flush()
  expect(ops()).toBe(edited)
})

it('keeps incomplete work dates invalid and distinguishes unknown minutes or costs from explicitly declared zero', () => {
  click('Añadir trabajo')
  expect(ops().workLog[0]).toEqual({ day: '', kind: 'recruitment', minutes: null, costClp: null })
  expect(button(view(), 'Descargar registro JSON para reabrir').props.disabled).toBe(true)
  change(view(), 'Fecha de trabajo (Chile), obligatoria', today)
  let summary = build2048TrialOperationsSummary(ops(), today)
  expect(summary.totals.work).toMatchObject({ knownMinutes: null, minutesUnknownEntries: 1, knownCostClp: null, costUnknownEntries: 1 })
  const input = nativeInput('Minutos (vacío = desconocido)')
  ;(input.props.onChange as (event: unknown) => void)({ currentTarget: { value: '0' } })
  summary = build2048TrialOperationsSummary(ops(), today)
  expect(summary.totals.work).toMatchObject({ knownMinutes: 0, minutesUnknownEntries: 0, knownCostClp: null, costUnknownEntries: 1 })
  click('Quitar trabajo 1'); expect(ops().workLog).toHaveLength(0)
})

it.each([Infinity, NaN, -1, 0.5])('blocks invalid numeric drafts before JSON normalization could turn them into unknown: %s', value => {
  const current = create2048TrialOperations(); current.workLog = [{ day: today, kind: 'analysis', minutes: value, costClp: null }]
  fixture.states[0] = current
  expect(button(view(), 'Descargar registro JSON para reabrir').props.disabled).toBe(true)
  expect(renderToStaticMarkup(view())).toContain('El borrador contiene datos incompletos')
})

it('does not enable download when summary derivation fails after otherwise valid input', () => {
  fixture.summaryFails = true
  expect(button(view(), 'Descargar registro JSON para reabrir').props.disabled).toBe(true)
  const html = renderToStaticMarkup(view())
  expect(html).toContain('la descarga está bloqueada'); expect(html).not.toContain('private internal')
})

it('blocks future factual dates, incompatible observations and work entries above the bounded limit', () => {
  patchSession({ sessionDay: '2026-10-21', firstMove: 'observed' })
  expect(button(view(), 'Descargar registro JSON para reabrir').props.disabled).toBe(true)
  patchSession({ sessionDay: today, firstMove: 'unknown', twentyMoves: 'observed' })
  expect(button(view(), 'Descargar registro JSON para reabrir').props.disabled).toBe(true)
  const value = create2048TrialOperations(); value.workLog = Array.from({ length: 120 }, () => ({ day: today, kind: 'analysis' as const, minutes: null, costClp: null }))
  fixture.states[0] = value
  expect(button(view(), 'Añadir trabajo').props.disabled).toBe(true)
})

it('downloads a validated reopenable document or an honest invitation without sending it or creating events', async () => {
  const anchor = { href: '', download: '', click: vi.fn() }; let exported!: Blob
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:operations' }, revokeObjectURL: vi.fn() })
  vi.stubGlobal('document', { createElement: () => anchor })
  patchSession({ invitation: 'invited' }); const previous = ops()
  click('Descargar registro JSON para reabrir')
  expect(anchor.download).toBe('2048-registro-operativo.json')
  expect(parse2048TrialOperations(await exported.text(), today)).toEqual(previous)
  expect(fixture.states[2]).toBe(false)
  click('Descargar invitación TXT')
  const invitation = await exported.text()
  expect(anchor.download).toBe('2048-invitacion-prueba.txt')
  expect(invitation).toContain(practiceUrl); expect(invitation).toContain('voluntaria')
  expect(invitation).toContain('no muestra anuncios reales'); expect(invitation).toContain('no hay pagos ni promesas de ingresos')
  expect(invitation).toContain('Coordinaremos una fecha'); expect(invitation).not.toContain('2026-10-20')
})

it('warns before manual central-report navigation and keeps the file control constrained to its container', () => {
  const tree = view(), html = renderToStaticMarkup(tree)
  expect(html).toContain('Descarga este registro antes de consultar')
  expect(html).toContain('no vincula estas fichas S01–S08 a una cuenta')
  const form = nodes(tree).find(node => node.type === 'form')!
  expect(form.props).toMatchObject({ method: 'get', action: '/admin/reports/2048-trial' })
  expect(nodes(form.props.children as ReactNode).filter(node => node.type === 'input').every(node => !node.props.defaultValue)).toBe(true)
  const fileInput = nodes(tree).find(node => node.type === 'input' && node.props.type === 'file')!
  expect(fileInput.props.className).toContain('w-full min-w-0 max-w-full')
})
