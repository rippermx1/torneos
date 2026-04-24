import { describe, it, expect } from 'vitest'
import { DeterministicRNG, generateGameSeed } from '@/lib/game/rng'

describe('generateGameSeed', () => {
  it('produce el mismo hash para el mismo input', () => {
    const a = generateGameSeed('tournament-1', 'user-1')
    const b = generateGameSeed('tournament-1', 'user-1')
    expect(a).toBe(b)
  })

  it('produce hashes distintos para distintos torneos', () => {
    const a = generateGameSeed('tournament-1', 'user-1')
    const b = generateGameSeed('tournament-2', 'user-1')
    expect(a).not.toBe(b)
  })

  it('produce hashes distintos para distintos usuarios', () => {
    const a = generateGameSeed('tournament-1', 'user-1')
    const b = generateGameSeed('tournament-1', 'user-2')
    expect(a).not.toBe(b)
  })

  it('retorna un string hex de 64 caracteres (SHA-256)', () => {
    const seed = generateGameSeed('t', 'u')
    expect(seed).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('DeterministicRNG', () => {
  it('es determinístico: mismo seed+moveNumber → mismo valor', () => {
    const a = new DeterministicRNG('seed123', 5)
    const b = new DeterministicRNG('seed123', 5)
    expect(a.next()).toBe(b.next())
  })

  it('produce valores distintos para distintos moveNumbers', () => {
    const a = new DeterministicRNG('seed', 0).next()
    const b = new DeterministicRNG('seed', 1).next()
    expect(a).not.toBe(b)
  })

  it('produce valores en [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const rng = new DeterministicRNG('test', i)
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('spawnValue retorna solo 2 o 4', () => {
    for (let i = 0; i < 100; i++) {
      const rng = new DeterministicRNG('test', i)
      const v = rng.spawnValue()
      expect([2, 4]).toContain(v)
    }
  })

  it('distribución de spawnValue: ~90% 2s y ~10% 4s', () => {
    let twos = 0
    const total = 1000
    for (let i = 0; i < total; i++) {
      const rng = new DeterministicRNG(`seed-${i}`, 0)
      if (rng.spawnValue() === 2) twos++
    }
    // Tolerancia ±5%
    expect(twos / total).toBeGreaterThan(0.85)
    expect(twos / total).toBeLessThan(0.95)
  })

  it('múltiples llamadas a next() en el mismo RNG producen valores distintos', () => {
    const rng = new DeterministicRNG('seed', 0)
    const values = [rng.next(), rng.next(), rng.next()]
    const unique = new Set(values)
    expect(unique.size).toBe(3)
  })
})
