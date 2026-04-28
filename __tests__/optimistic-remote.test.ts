import { describe, expect, it } from 'vitest'
import { Game2048 } from '@/lib/game/engine'
import { predictRemoteMove } from '@/lib/game/optimistic-remote'
import { DeterministicRNG } from '@/lib/game/rng'

describe('predictRemoteMove', () => {
  it('predice exactamente el mismo resultado que el motor del servidor', async () => {
    const state = {
      board: [
        [2, 2, 4, 0],
        [0, 4, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      score: 12,
      seed: 'remote:test-seed',
      moveNumber: 8,
    }

    const predicted = await predictRemoteMove(state, 'left')

    const game = new Game2048(state.board, state.score)
    const result = game.applyMove('left', new DeterministicRNG(state.seed, state.moveNumber))

    expect(predicted.moved).toBe(result.moved)
    expect(predicted.score).toBe(game.score)
    expect(predicted.gameOver).toBe(!game.canMove())
    expect(predicted.moveNumber).toBe(result.moved ? state.moveNumber + 1 : state.moveNumber)
    expect(predicted.spawnedTile).toEqual(result.spawnedTile)
    expect(predicted.board).toEqual(game.board)
  })

  it('mantiene moveNumber cuando el movimiento no cambia el tablero', async () => {
    const state = {
      board: [
        [2, 4, 8, 16],
        [32, 64, 128, 256],
        [2, 4, 8, 16],
        [32, 64, 128, 256],
      ],
      score: 0,
      seed: 'remote:test-seed',
      moveNumber: 5,
    }

    const predicted = await predictRemoteMove(state, 'left')

    expect(predicted.moved).toBe(false)
    expect(predicted.moveNumber).toBe(state.moveNumber)
    expect(predicted.board).toEqual(state.board)
  })
})
