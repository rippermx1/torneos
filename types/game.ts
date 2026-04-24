import type { Direction, SpawnedTile } from '@/lib/game/engine'

export type { Direction }

export interface PracticeStartResponse {
  board: number[][]
  score: number
  seed: string
  moveNumber: number
}

export interface PracticeMoveRequest {
  board: number[][]
  score: number
  direction: Direction
  moveNumber: number
  seed: string
}

export interface PracticeMoveResponse {
  board: number[][]
  score: number
  scoreGained: number
  moved: boolean
  gameOver: boolean
  spawnedTile: SpawnedTile | null
  moveNumber: number
}

export type ApiError = { error: string }
