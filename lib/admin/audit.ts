import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type AdminActionName =
  | 'payout.approve'
  | 'payout.reject'
  | 'kyc.approve'
  | 'kyc.reject'
  | 'user.ban'
  | 'user.unban'
  | 'dispute.resolved'
  | 'dispute.rejected'
  | 'tournament.finalize'
  | 'tournament.cancel'
  | 'flow.reverify'
  | 'refund.retry'

export type AdminActionTargetType =
  | 'withdrawal_request'
  | 'profile'
  | 'dispute'
  | 'tournament'
  | 'flow_payment_attempt'
  | 'flow_refund_attempt'

export interface RecordAdminActionParams {
  adminId: string
  action: AdminActionName
  targetType: AdminActionTargetType
  targetId: string | null
  summary?: string | null
  payload?: Record<string, unknown> | null
}

/**
 * Registra una acción administrativa en la bitácora `admin_actions`.
 *
 * Es best-effort: si el INSERT falla, se loguea por consola pero NO
 * lanza excepción. La traza nunca debe bloquear la acción legítima del
 * admin; un fallo de logging es un problema operacional, no un motivo
 * para revertir una aprobación de retiro.
 */
export async function recordAdminAction(
  supabase: SupabaseClient<Database>,
  { adminId, action, targetType, targetId, summary, payload }: RecordAdminActionParams,
): Promise<void> {
  const { error } = await supabase.rpc('record_admin_action', {
    p_admin_id: adminId,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_summary: summary ?? null,
    p_payload: (payload ?? {}) as Record<string, unknown>,
  })

  if (error) {
    console.error('[admin/audit] record_admin_action failed', {
      action,
      targetType,
      targetId,
      error: error.message,
    })
  }
}
