import { Game2048, type Board, type Direction, type SpawnedTile } from './engine'
import type { GameRandomSource } from './random-source'

export interface RemotePredictableState {
  board: Board
  score: number
  seed: string
  moveNumber: number
}

export interface PredictedRemoteMove {
  board: Board
  score: number
  scoreGained: number
  moved: boolean
  gameOver: boolean
  spawnedTile: SpawnedTile | null
  moveNumber: number
}

class AsyncDeterministicRng implements GameRandomSource {
  private state: number

  constructor(initialState: number) {
    this.state = initialState
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

const encoder = new TextEncoder()

async function getInitialState(seed: string, moveNumber: number) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${seed}:${moveNumber}`)
  )
  return new DataView(digest).getUint32(0, false)
}

export async function predictRemoteMove(
  state: RemotePredictableState,
  direction: Direction
): Promise<PredictedRemoteMove> {
  const game = new Game2048(state.board, state.score)
  const rng = new AsyncDeterministicRng(await getInitialState(state.seed, state.moveNumber))
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
