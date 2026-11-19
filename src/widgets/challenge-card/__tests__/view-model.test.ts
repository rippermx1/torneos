import { describe, expect, it } from 'vitest'
import { getContent } from '@shared/content'
import { formatDateTime } from '@shared/lib/format'
import { AVAILABILITY_KINDS, type Challenge } from '@entities/challenge'
import { AVAILABILITY_TONE, toAvailabilityBadgeViewModel, toChallengeCardViewModel } from '../index'
import { challenge, opens, start } from './fixtures'

const content = getContent('challenge-card')
const vm = (c: Partial<Challenge>, now = opens) => toChallengeCardViewModel({ challenge: { ...challenge, ...c }, now, content, href: '/tournaments/x' })

describe('challenge card view model', () => {
  it('shows free entry and total prize from content', () => {
    expect(vm({ entryFeeCents: 0 }).facts).toEqual([
      { id: 'entry-fee', label: 'Inscripción · precio final', value: 'Gratis' },
      { id: 'total-prize', label: 'Premio total fijo', value: '$33.000' },
    ])
    expect(vm({}).facts[0].value).toBe('$5.000')
  })
  it('renders every capacity template', () => {
    expect(vm({ registeredCount: null }).capacity).toBe('Cupos por confirmar')
    expect(vm({ registeredCount: 12 }).capacity).toBe('3 cupos libres · 12 / 15 inscritos')
    expect(vm({ registeredCount: 12 }, start).capacity).toBe('12 / 15 inscritos')
  })
  it('renders schedule, minimum and duration', () => {
    expect(vm({}).schedule).toEqual([
      `Inscripciones desde: ${formatDateTime(challenge.registrationOpensAt)}`,
      `Inscripción hasta: ${formatDateTime(challenge.playWindowStart)}`,
      `Partidas: ${formatDateTime(challenge.playWindowStart)} — ${formatDateTime(challenge.playWindowEnd)}`,
      'Una partida · hasta 10 min',
    ])
    expect(vm({}).minimum).toBe('Mínimo para jugar: 12 participantes')
  })
  it('picks the call to action by availability', () => {
    expect(vm({}, start).cta).toBe('Ver torneo y ranking →')
    expect(vm({ status: 'finalizing' }).cta).toBe('Ver torneo y ranking →')
    expect(vm({}).cta).toBe('Ver reglas y premios →')
  })
  it('labels finalizing apart from closed', () => {
    expect(toAvailabilityBadgeViewModel({ ...challenge, status: 'finalizing' }, opens, content))
      .toEqual({ tone: 'neutral', label: 'Finalizando resultados' })
    expect(toAvailabilityBadgeViewModel(challenge, start, content)).toEqual({ tone: 'warning', label: 'En curso · inscripción cerrada' })
    expect(toAvailabilityBadgeViewModel(challenge, opens, content)).toEqual({ tone: 'success', label: 'Inscripciones abiertas' })
  })
  it('has a label and a tone for every availability kind', () => {
    for (const kind of AVAILABILITY_KINDS) {
      expect(content.availability[kind]).toBeTruthy()
      expect(AVAILABILITY_TONE[kind]).toBeTruthy()
    }
  })
})
