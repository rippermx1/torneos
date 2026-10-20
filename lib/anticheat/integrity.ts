import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AdminClient = SupabaseClient<Database>
export interface IntegrityReview {
  gameId: string
  code: 'regular_pace' | 'identity_collision' | 'settled_sanction'
  evidence: Record<string, unknown>
  decision: 'pending' | 'cleared' | 'sanctioned'
  reason: string | null
  reviewedAt: string | null
}

export async function inspectIntegrity(admin: AdminClient, tournamentId: string): Promise<IntegrityReview[]> {
  // Candidate RPC types stay local until the operating schema is upgraded.
  // @ts-expect-error candidate migration is deliberately not applied to the operating DB
  const { data, error } = await admin.rpc('inspect_2048_integrity', { p_tournament_id: tournamentId })
  if (error || !Array.isArray(data)) throw new Error('INTEGRITY_STATE_UNCONFIRMED')
  const reviews = data as unknown as IntegrityReview[]
  if (reviews.some(r => !r || typeof r.gameId !== 'string'
    || !['regular_pace', 'identity_collision', 'settled_sanction'].includes(r.code)
    || !['pending', 'cleared', 'sanctioned'].includes(r.decision))) {
    throw new Error('INTEGRITY_STATE_UNCONFIRMED')
  }
  return reviews
}

export async function requireIntegrityClearance(admin: AdminClient, tournamentId: string): Promise<void> {
  const reviews = await inspectIntegrity(admin, tournamentId)
  if (reviews.some(r => r.decision === 'pending')) throw new Error('INTEGRITY_REVIEW_REQUIRED')
}

export async function setAccountSanction(admin: AdminClient, params: {
  userId: string; banned: boolean; reason: string; actorId?: string
}): Promise<{ ok: true; banned: boolean; invalidatedGames: number; settledGames: number }> {
  // @ts-expect-error candidate migration is deliberately not applied to the operating DB
  const { data, error } = await admin.rpc('set_2048_account_sanction', {
    p_user_id: params.userId, p_banned: params.banned, p_reason: params.reason,
    p_actor_id: params.actorId ?? null,
  })
  const result = data as unknown as { ok?: boolean; banned?: boolean; invalidatedGames?: number; settledGames?: number } | null
  if (error || result?.ok !== true || result.banned !== params.banned
    || !Number.isSafeInteger(result.invalidatedGames) || result.invalidatedGames! < 0
    || !Number.isSafeInteger(result.settledGames) || result.settledGames! < 0) {
    throw new Error('SANCTION_STATE_UNCONFIRMED')
  }
  return result as { ok: true; banned: boolean; invalidatedGames: number; settledGames: number }
}

export async function clearIntegrityReview(admin: AdminClient, params: {
  gameId: string; code: IntegrityReview['code']; actorId: string; reason: string
}): Promise<void> {
  // @ts-expect-error candidate migration is deliberately not applied to the operating DB
  const { data, error } = await admin.rpc('resolve_2048_integrity', {
    p_game_id: params.gameId, p_code: params.code, p_actor_id: params.actorId, p_reason: params.reason,
  })
  if (error || (data as unknown as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(error?.message ?? 'REVIEW_STATE_UNCONFIRMED')
  }
}
