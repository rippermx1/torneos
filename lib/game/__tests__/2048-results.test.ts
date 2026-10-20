import { expect, it } from 'vitest'
import { read2048Results } from '../2048-results'

const ranking = { tournamentId: 't1', phase: 'provisional', rows: [
  { position: 1, name: 'Jugador', score: 2048, highestTile: 256, prizeCents: null, isMe: true },
] }
it('accepts official results and provisional rankings without inventing prizes', () => {
  expect(read2048Results(ranking)).toEqual(ranking)
  expect(read2048Results({ ...ranking, phase: 'official', rows: [{ ...ranking.rows[0], prizeCents: 0 }] }).phase).toBe('official')
})
it.each([
  null, { ...ranking, phase: 'closed' }, { ...ranking, rows: [{ ...ranking.rows[0], score: -1 }] },
  { ...ranking, rows: [{ ...ranking.rows[0], prizeCents: 100 }] },
  { ...ranking, phase: 'official' }, { ...ranking, rows: [ranking.rows[0], ranking.rows[0]] },
])('rejects invalid or ambiguous result tables: %j', value => {
  expect(() => read2048Results(value)).toThrow('confirmar la tabla')
})
