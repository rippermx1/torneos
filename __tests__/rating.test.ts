import { describe, it, expect } from 'vitest'
import {
  tierForRating,
  updateRating,
  canRegisterForTier,
  TIER_THRESHOLDS,
} from '@/lib/tournament/rating'

describe('tierForRating', () => {
  it('mapea rating a división por umbrales', () => {
    expect(tierForRating(0)).toBe('novato')
    expect(tierForRating(TIER_THRESHOLDS.intermedio - 1)).toBe('novato')
    expect(tierForRating(TIER_THRESHOLDS.intermedio)).toBe('intermedio')
    expect(tierForRating(TIER_THRESHOLDS.pro - 1)).toBe('intermedio')
    expect(tierForRating(TIER_THRESHOLDS.pro)).toBe('pro')
    expect(tierForRating(120000)).toBe('pro')
  })
})

describe('updateRating', () => {
  it('el primer juego fija el rating en el propio score', () => {
    const r = updateRating(0, 0, 10000)
    expect(r.rating).toBe(10000)
    expect(r.gamesRated).toBe(1)
    expect(r.tier).toBe('intermedio')
  })

  it('aplica EMA a partir del segundo juego', () => {
    // prev 10000, score 20000, alpha 0.3 -> 0.3*20000 + 0.7*10000 = 13000
    const r = updateRating(10000, 1, 20000, 0.3)
    expect(r.rating).toBe(13000)
    expect(r.gamesRated).toBe(2)
  })

  it('converge hacia scores altos y promueve de división', () => {
    let s = updateRating(0, 0, 40000) // pro de entrada
    expect(s.tier).toBe('pro')
    // varios juegos flojos lo bajan gradualmente
    for (let i = 0; i < 10; i++) s = updateRating(s.rating, s.gamesRated, 2000)
    expect(s.rating).toBeLessThan(TIER_THRESHOLDS.intermedio)
    expect(s.tier).toBe('novato')
  })
})

describe('canRegisterForTier', () => {
  it('torneo abierto (null) admite a cualquiera', () => {
    expect(canRegisterForTier('novato', null)).toBe(true)
    expect(canRegisterForTier('pro', null)).toBe(true)
  })

  it('torneo con división admite solo a esa división', () => {
    expect(canRegisterForTier('novato', 'novato')).toBe(true)
    expect(canRegisterForTier('pro', 'novato')).toBe(false)
    expect(canRegisterForTier('intermedio', 'pro')).toBe(false)
  })
})
