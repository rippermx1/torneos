import { createHash, randomBytes } from 'crypto'
import type { GameRandomSource } from './random-source'

// Genera un seed criptograficamente aleatorio (256 bits) para una partida.
// No derivable de identificadores publicos: imposible precalcular spawns offline
// conociendo solo (tournamentId, userId). El seed se persiste en games.seed
// y nunca se expone al cliente.
export function generateGameSeed(): string {
  return randomBytes(32).toString('hex')
}

// Computa el estado inicial uint32 del RNG para un (seed, moveNumber) específico.
// Es el mismo cálculo que el constructor de DeterministicRNG, expuesto para enviar
// al cliente y permitir que prediga spawns sin conocer el seed. Solo se envían los
// próximos N estados (no toda la partida), limitando el riesgo de cheating.
export function computeRngState(seed: string, moveNumber: number): number {
  const hash = createHash('sha256')
    .update(`${seed}:${moveNumber}`)
    .digest()
  return hash.readUInt32BE(0)
}

export function computeRngStates(seed: string, startMoveNumber: number, count: number): number[] {
  const states: number[] = []
  for (let i = 0; i < count; i++) {
    states.push(computeRngState(seed, startMoveNumber + i))
  }
  return states
}

// Tamaño del buffer de estados pre-computados que se envía al cliente.
// 3 permite ráfagas cortas sin bloqueo. Más estados expondrían más spawns futuros.
export const RNG_PREVIEW_SIZE = 3

// RNG determinístico basado en seed + número de movimiento.
// Garantiza reproducibilidad total: dado (seed, moveNumber) siempre produce el mismo valor.
export class DeterministicRNG implements GameRandomSource {
  private state: number

  constructor(seed: string, moveNumber: number) {
    this.state = computeRngState(seed, moveNumber)
  }

  // Genera un número en [0, 1) usando el algoritmo MurmurHash3 finalizer (fmix32).
  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // 90% probabilidad de 2, 10% de 4 (igual que el 2048 original).
  spawnValue(): 2 | 4 {
    return this.next() < 0.9 ? 2 : 4
  }
}
