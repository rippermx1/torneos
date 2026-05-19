import { Game2048, type Board, type Direction, type SpawnedTile } from './engine'
import type { GameRandomSource } from './random-source'

export interface LocalPracticeState {
  board: Board
  score: number
  seed: string
  moveNumber: number
}

export interface LocalPracticeMoveResult {
  board: Board
  score: number
  scoreGained: number
  moved: boolean
  gameOver: boolean
  spawnedTile: SpawnedTile | null
  moveNumber: number
}

class LocalPracticeRng implements GameRandomSource {
  private state: number

  constructor(seed: string, moveNumber: number) {
    this.state = hashString(`${seed}:${moveNumber}`)
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  spawnValue(): 2 | 4 {
    return this.next() < 0.9 ? 2 : 4
  }
}

// RNG inicializado con un estado uint32 pre-computado por el servidor.
// El algoritmo de avance (next) es idéntico al de DeterministicRNG/LocalPracticeRng,
// por lo que con el mismo estado inicial producen exactamente la misma secuencia.
export class StateRng implements GameRandomSource {
  private state: number

  constructor(initialState: number) {
    this.state = initialState >>> 0
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  spawnValue(): 2 | 4 {
    return this.next() < 0.9 ? 2 : 4
  }
}

function hashString(input: string) {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function createLocalPracticeSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `practice:local:${crypto.randomUUID()}`
  }

  return `practice:local:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

export function createLocalPracticeGame(seed = createLocalPracticeSeed()): LocalPracticeState {
  const game = new Game2048()
  game.spawnTile(new LocalPracticeRng(seed, 0))
  game.spawnTile(new LocalPracticeRng(seed, 1))

  return {
    board: game.board,
    score: 0,
    seed,
    moveNumber: 2,
  }
}

export function applyLocalPracticeMove(
  state: LocalPracticeState,
  direction: Direction
): LocalPracticeMoveResult {
  const rng = new LocalPracticeRng(state.seed, state.moveNumber)
  return applyMoveWithRng(state.board, state.score, state.moveNumber, direction, rng)
}

// Aplica un movimiento usando un estado RNG pre-computado (modo torneo).
// El estado proviene del servidor → cliente y servidor calculan el mismo spawn.
export function applyTournamentMove(
  state: { board: Board; score: number; moveNumber: number },
  direction: Direction,
  rngState: number
): LocalPracticeMoveResult {
  const rng = new StateRng(rngState)
  return applyMoveWithRng(state.board, state.score, state.moveNumber, direction, rng)
}

function applyMoveWithRng(
  board: Board,
  score: number,
  moveNumber: number,
  direction: Direction,
  rng: GameRandomSource
): LocalPracticeMoveResult {
  const game = new Game2048(board, score)
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
