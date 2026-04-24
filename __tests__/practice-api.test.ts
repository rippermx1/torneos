// Tests de la lógica de las API routes de práctica (sin HTTP, directo a las funciones)
import { describe, it, expect } from 'vitest'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'

// Simula lo que hace la route POST /api/game/practice/start
function simulateStart(userId: string, uuid: string) {
  const seed = `practice:${userId}:${uuid}`
  const game = new Game2048()
  game.spawnTile(new DeterministicRNG(seed, 0))
  game.spawnTile(new DeterministicRNG(seed, 1))
  return { board: game.board, score: 0, seed, moveNumber: 2 }
}

// Simula lo que hace la route POST /api/game/practice/move
function simulateMove(
  board: number[][],
  score: number,
  direction: 'up' | 'down' | 'left' | 'right',
  moveNumber: number,
  seed: string
) {
  const game = new Game2048(board, score)
  const rng = new DeterministicRNG(seed, moveNumber)
  const result = game.applyMove(direction, rng)
  const gameOver = !game.canMove()

  return {
    board: game.board,
    score: game.score,
    scoreGained: result.scoreGained,
    moved: result.moved,
    gameOver,
    spawnedTile: result.spawnedTile,
    moveNumber: result.moved ? moveNumber + 1 : moveNumber,
  }
}

describe('Practice API logic', () => {
  const userId = 'user-test-123'
  const uuid = 'aaaabbbb-cccc-dddd-eeee-ffffgggghhhh'

  it('start: genera un tablero con exactamente 2 tiles iniciales', () => {
    const { board } = simulateStart(userId, uuid)
    const nonZero = board.flat().filter((v) => v !== 0)
    expect(nonZero).toHaveLength(2)
  })

  it('start: los tiles iniciales son 2 o 4', () => {
    const { board } = simulateStart(userId, uuid)
    const nonZero = board.flat().filter((v) => v !== 0)
    nonZero.forEach((v) => expect([2, 4]).toContain(v))
  })

  it('start: moveNumber inicial es 2', () => {
    const { moveNumber } = simulateStart(userId, uuid)
    expect(moveNumber).toBe(2)
  })

  it('start: mismo seed produce el mismo tablero (determinístico)', () => {
    const a = simulateStart(userId, uuid)
    const b = simulateStart(userId, uuid)
    expect(a.board).toEqual(b.board)
    expect(a.seed).toBe(b.seed)
  })

  it('move: incrementa moveNumber si el move fue efectivo', () => {
    const { board, seed, moveNumber } = simulateStart(userId, uuid)
    // Probamos todas las direcciones hasta encontrar una que mueva
    for (const dir of ['left', 'right', 'up', 'down'] as const) {
      const result = simulateMove(board, 0, dir, moveNumber, seed)
      if (result.moved) {
        expect(result.moveNumber).toBe(moveNumber + 1)
        return
      }
    }
  })

  it('move: no cambia moveNumber si el move no tuvo efecto', () => {
    // Tablero con todos los tiles distintos ya a la izquierda → no-op hacia left
    const board = [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    const seed = `practice:${userId}:test`
    const result = simulateMove(board, 0, 'left', 5, seed)
    expect(result.moved).toBe(false)
    expect(result.moveNumber).toBe(5)
    expect(result.scoreGained).toBe(0)
  })

  it('move: spawnea un tile después de un move válido', () => {
    const board = [
      [0, 0, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    const seed = `practice:${userId}:test`
    const result = simulateMove(board, 0, 'left', 5, seed)
    expect(result.moved).toBe(true)
    expect(result.spawnedTile).not.toBeNull()
    expect([2, 4]).toContain(result.spawnedTile!.value)
  })

  it('move: no spawnea tile en no-op', () => {
    const board = [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    const seed = `practice:${userId}:test`
    const result = simulateMove(board, 0, 'left', 5, seed)
    expect(result.spawnedTile).toBeNull()
  })

  it('move: detecta game over correctamente', () => {
    // Tablero lleno sin merges posibles
    const board = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    const seed = `practice:${userId}:test`
    // Cualquier dirección no moverá pero el tablero ya está en game over
    const result = simulateMove(board, 0, 'left', 5, seed)
    expect(result.gameOver).toBe(true)
  })

  it('move: secuencia de moves acumula score correctamente', () => {
    const { board, seed, moveNumber } = simulateStart(userId, 'fixed-uuid')
    let currentBoard = board
    let currentScore = 0
    let currentMove = moveNumber

    // Hacemos múltiples moves y verificamos que el score solo crece
    for (const dir of ['left', 'right', 'up', 'down', 'left'] as const) {
      const result = simulateMove(currentBoard, currentScore, dir, currentMove, seed)
      if (result.moved) {
        expect(result.score).toBeGreaterThanOrEqual(currentScore)
        currentBoard = result.board
        currentScore = result.score
        currentMove = result.moveNumber
      }
    }
  })
})
