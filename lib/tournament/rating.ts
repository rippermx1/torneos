import type { SkillTier } from '@/types/database'

// ── Rating y divisiones por habilidad ────────────────────────────────
// El rating es una media móvil exponencial (EMA) del score final del jugador.
// Los umbrales se basan en las notas empíricas del anti-cheat (llegar a 2048 ≈
// 20.000 pts; a 4096 ≈ 100.000 pts) y deben CALIBRARSE con datos reales.
// Ver docs/roadmap-retencion-rentabilidad.md.

export const RATING_ALPHA = 0.3

/** Umbrales de rating para subir de división (piso inclusivo de cada tramo). */
export const TIER_THRESHOLDS = {
  intermedio: 8000,
  pro: 30000,
} as const

export const DEFAULT_SKILL_TIER: SkillTier = 'novato'

export function tierForRating(rating: number): SkillTier {
  if (rating >= TIER_THRESHOLDS.pro) return 'pro'
  if (rating >= TIER_THRESHOLDS.intermedio) return 'intermedio'
  return 'novato'
}

export interface RatingState {
  rating: number
  gamesRated: number
  tier: SkillTier
}

/**
 * Actualiza el rating de un jugador tras un torneo con su score final.
 * El primer juego fija el rating en el propio score (evita el sesgo del 0
 * inicial); luego es EMA con factor `alpha`.
 */
export function updateRating(
  prevRating: number,
  prevGames: number,
  finalScore: number,
  alpha: number = RATING_ALPHA
): RatingState {
  const gamesRated = prevGames + 1
  const rating = prevGames <= 0 ? finalScore : alpha * finalScore + (1 - alpha) * prevRating
  return { rating, gamesRated, tier: tierForRating(rating) }
}

/**
 * Un jugador puede inscribirse si el torneo es abierto (skill_tier NULL) o si su
 * división coincide con la del torneo. Protege a los novatos de los expertos y
 * da a cada nivel su espacio competitivo.
 */
export function canRegisterForTier(
  playerTier: SkillTier,
  tournamentSkillTier: SkillTier | null | undefined
): boolean {
  return tournamentSkillTier == null || tournamentSkillTier === playerTier
}

export const SKILL_TIER_LABELS: Record<SkillTier, string> = {
  novato: 'Novato',
  intermedio: 'Intermedio',
  pro: 'Pro',
}
