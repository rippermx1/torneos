import { createHash, randomBytes } from 'crypto'
import type { GameRandomSource } from './random-source'

// Genera un seed criptograficamente aleatorio (256 bits) para una partida.
// No derivable de identificadores publicos: imposible precalcular spawns offline
// conociendo solo (tournamentId, userId). El seed se persiste en games.seed
// y nunca se expone al cliente.
export function generateGameSeed(): string {
  return randomBytes(32).toString('hex')
}

// RNG determinístico basado en seed + número de movimiento.
// Garantiza reproducibilidad total: dado (seed, moveNumber) siempre produce el mismo valor.
export class DeterministicRNG implements GameRandomSource {
  private state: number

  constructor(seed: string, moveNumber: number) {
    const hash = createHash('sha256')
      .update(`${seed}:${moveNumber}`)
      .digest()
    this.state = hash.readUInt32BE(0)
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
