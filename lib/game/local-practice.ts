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
  const game = new Game2048(state.board, state.score)
  const rng = new LocalPracticeRng(state.seed, state.moveNumber)
  const result = game.applyMove(direction, rng)
  const gameOver = !game.canMove()

  return {
    board: game.board,
    score: game.score,
    scoreGained: result.scoreGained,
    moved: result.moved,
    gameOver,
    spawnedTile: result.spawnedTile,
    moveNumber: result.moved ? state.moveNumber + 1 : state.moveNumber,
  }
}
