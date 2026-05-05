import { describe, expect, it } from 'vitest'
import { calculateGameDeadline, isPastGameDeadline } from '@/lib/tournament/game-deadline'

describe('game deadline', () => {
  it('uses the configured max duration when it ends before the play window', () => {
    expect(calculateGameDeadline(
      '2026-05-05T12:00:00.000Z',
      '2026-05-05T13:00:00.000Z',
      600
    )).toBe('2026-05-05T12:10:00.000Z')
  })

  it('caps the game deadline at the tournament play window end', () => {
    expect(calculateGameDeadline(
      '2026-05-05T12:55:00.000Z',
      '2026-05-05T13:00:00.000Z',
      600
    )).toBe('2026-05-05T13:00:00.000Z')
  })

  it('detects when the deadline has passed', () => {
    expect(isPastGameDeadline(
      '2026-05-05T12:00:00.000Z',
      '2026-05-05T13:00:00.000Z',
      600,
      Date.parse('2026-05-05T12:10:00.000Z')
    )).toBe(true)
  })

  it('rejects invalid max durations', () => {
    expect(() => calculateGameDeadline(
      '2026-05-05T12:00:00.000Z',
      '2026-05-05T13:00:00.000Z',
      0
    )).toThrow('Fechas de partida invalidas')
  })
})
