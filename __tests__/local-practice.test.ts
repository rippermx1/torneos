import { describe, expect, it } from 'vitest'
import { applyLocalPracticeMove, createLocalPracticeGame } from '@/lib/game/local-practice'

describe('local practice game', () => {
  it('inicia con dos tiles y moveNumber listo para el primer movimiento', () => {
    const game = createLocalPracticeGame('practice:local:test-seed')
    const nonZeroTiles = game.board.flat().filter((value) => value !== 0)

    expect(nonZeroTiles).toHaveLength(2)
    expect(game.score).toBe(0)
    expect(game.moveNumber).toBe(2)
  })

  it('aplica un movimiento válido sin roundtrip y avanza moveNumber', () => {
    const result = applyLocalPracticeMove(
      {
        board: [
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        score: 0,
        seed: 'practice:local:test-seed',
        moveNumber: 2,
      },
      'left'
    )

    expect(result.moved).toBe(true)
    expect(result.score).toBe(4)
    expect(result.moveNumber).toBe(3)
    expect(result.board.flat().filter((value) => value !== 0)).toHaveLength(2)
  })

  it('mantiene moveNumber cuando el movimiento no cambia el tablero', () => {
    const result = applyLocalPracticeMove(
      {
        board: [
          [2, 4, 8, 16],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        score: 0,
        seed: 'practice:local:test-seed',
        moveNumber: 2,
      },
      'left'
    )

    expect(result.moved).toBe(false)
    expect(result.score).toBe(0)
    expect(result.moveNumber).toBe(2)
  })
})
