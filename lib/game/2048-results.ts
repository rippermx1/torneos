import type { TournamentPresetKey } from '@/types/database'
import { isCommunityFreePresetKey } from '@/lib/tournament/community-free'

export interface Game2048Results {
  tournamentId: string
  presetKey?: TournamentPresetKey
  phase: 'provisional' | 'official'
  rows: { position: number; name: string; score: number; highestTile: number;
    prizeCents: number | null; isMe: boolean }[]
}

export function read2048Results(value: unknown): Game2048Results {
  const data = value as Game2048Results | null
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0
  if (!data || typeof data.tournamentId !== 'string'
    || data.presetKey !== undefined && !['community_free_v1', 'commercial_v1', 'freeroll_v1', 'internal_test_v1', 'legacy_v2'].includes(data.presetKey)
    || !['provisional', 'official'].includes(data.phase) || !Array.isArray(data.rows)
    || data.rows.length > 50 || data.rows.some((row, index) => !row
      || !integer(row.position) || row.position < 1 || (index > 0 && row.position <= data.rows[index - 1].position)
      || typeof row.name !== 'string' || !integer(row.score) || !integer(row.highestTile)
      || typeof row.isMe !== 'boolean'
      || isCommunityFreePresetKey(data.presetKey) && row.prizeCents !== (data.phase === 'official' ? 0 : null)
      || (data.phase === 'official' ? !integer(row.prizeCents) : row.prizeCents !== null))) {
    throw new Error('No se pudo confirmar la tabla de resultados.')
  }
  return data
}
