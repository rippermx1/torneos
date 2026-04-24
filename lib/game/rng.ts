import { createHash } from 'crypto'

// Genera un seed único por (torneo, usuario). Determinístico: mismo input → mismo seed.
export function generateGameSeed(tournamentId: string, userId: string): string {
  return createHash('sha256')
    .update(`${tournamentId}:${userId}`)
    .digest('hex')
}

// RNG determinístico basado en seed + número de movimiento.
// Garantiza reproducibilidad total: dado (seed, moveNumber) siempre produce el mismo valor.
export class DeterministicRNG {
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
