import type { Direction } from './engine'
import { applyLocalPracticeMove, type LocalPracticeState } from './local-practice'

export interface Training2048State {
  phase: 'offered' | 'active' | 'ended'
  sourceId: string
  continuationId: string | null
  originalScore: number
  originalHighestTile: number
  originalMoves: number
  originalDirection: Direction
  alternativeDirections: Direction[]
  awaitingAlternative: boolean
  demonstration: true
}

export interface Training2048Event {
  stage: 'offered' | 'started' | 'move' | 'ended' | 'interrupted'
  sourceId: string
  continuationId: string | null
  validMoves: number
}

export function copyTraining2048State(state: Training2048State): Training2048State {
  return { ...state, alternativeDirections: [...state.alternativeDirections] }
}

export function copyLocal2048Practice(state: LocalPracticeState): LocalPracticeState {
  return { board: state.board.map(row => [...row]), score: state.score, seed: state.seed, moveNumber: state.moveNumber }
}

/** Simulations use the same seed/move index and never mutate the saved state. */
export function usefulTraining2048Directions(before: LocalPracticeState, original: Direction): Direction[] {
  return (['up', 'down', 'left', 'right'] as const).filter(direction => {
    if (direction === original) return false
    const result = applyLocalPracticeMove(before, direction)
    return result.moved && !result.gameOver
  })
}

/** Observation identity only; the fallback also works in local HTTP previews. */
export function create2048PracticeId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = bytes[6] & 0x0f | 0x40
  bytes[8] = bytes[8] & 0x3f | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
