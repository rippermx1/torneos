import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { createFlowRefund, getFlowRefundStatus } from '@/lib/flow/refunds'
import { getAppUrl } from '@/lib/env'
import { sendTournamentCancelledEmail } from '@/lib/email/refund-notifications'
import type { FlowPaymentAttempt, FlowRefundAttempt } from '@/types/database'

// ───────────────────────────────────────────────────────────────
// Lógica de reembolsos Flow para torneos cancelados.
//
// Cada inscrito con pago acreditado recibe una reversa Flow al
// email con el que se registró. La reversa va a su cuenta Flow
// o banco registrado — nunca al saldo interno de premios.
//
// Si una reversa falla queda registrada con status='rejected'
// en flow_refund_attempts para reintento manual por el admin.
// ───────────────────────────────────────────────────────────────

export interface RefundResult {
  userId: string
  email: string
  amountCents: number
  refundCommerceOrder: string
  flowRefundToken?: string
  error?: string
}

/**
 * Emite reembolsos Flow para todos los inscritos con pago acreditado
 * en un torneo cancelado. Retorna el resultado por cada usuario.
 */
export async function issueFlowRefunds(
  tournamentId: string,
  entryFeeCents: number,
  requestOrigin: string,
  tournamentName?: string
): Promise<RefundResult[]> {
  const supabase = createAdminClient()
  const appUrl = getAppUrl(requestOrigin) ?? requestOrigin
  const callbackUrl = `${appUrl}/api/webhooks/flow/refund`
  const results: RefundResult[] = []

  // Buscar todos los pagos acreditados del torneo
  type AttemptRow = Pick<FlowPaymentAttempt, 'id' | 'user_id' | 'commerce_order' | 'flow_order'>
  const { data: rawAttempts } = await supabase
    .from('flow_payment_attempts')
    .select('id, user_id, commerce_order, flow_order')
    .eq('tournament_id', tournamentId)
    .eq('intent', 'tournament_registration')
    .eq('status', 'credited')
  const attempts = rawAttempts as AttemptRow[] | null

  if (!attempts?.length) return results

  for (const attempt of attempts) {
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(attempt.user_id)

    if (userErr || !user?.email) {
      results.push({
        userId: attempt.user_id,
        email: '',
        amountCents: entryFeeCents,
        refundCommerceOrder: '',
        error: `email no encontrado: ${userErr?.message ?? 'sin email'}`,
      })
      continue
    }

    const refundCommerceOrder = `ref-${randomUUID()}`
    const amountPesos = Math.ceil(entryFeeCents / 100)

    try {
      const flowResponse = await createFlowRefund({
        refundCommerceOrder,
        receiverEmail: user.email,
        amountPesos,
        urlCallBack: callbackUrl,
        flowTrxId: attempt.flow_order ?? undefined,
      })

      await supabase.from('flow_refund_attempts').insert({
        tournament_id: tournamentId,
        user_id: attempt.user_id,
        flow_payment_attempt_id: attempt.id,
        refund_commerce_order: refundCommerceOrder,
        flow_refund_token: flowResponse.token,
        flow_refund_order: flowResponse.flowRefundOrder,
        amount_cents: entryFeeCents,
        amount_pesos: amountPesos,
        receiver_email: user.email,
        status: 'pending',
      })

      // Notificar al usuario que el reembolso fue iniciado.
      // Fail-safe: el email no bloquea el flujo si falla.
      void sendTournamentCancelledEmail({
        to: user.email,
        username: user.user_metadata?.username ?? user.email,
        tournamentName: tournamentName ?? 'torneo',
        amountPesos,
      }).catch((e) => console.error('[refunds] Error enviando email cancelación:', e))

      results.push({
        userId: attempt.user_id,
        email: user.email,
        amountCents: entryFeeCents,
        refundCommerceOrder,
        flowRefundToken: flowResponse.token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[refunds] Error reembolsando usuario ${attempt.user_id}:`, message)

      // Registrar intento fallido para reintento manual
      try {
        await supabase.from('flow_refund_attempts').insert({
          tournament_id: tournamentId,
          user_id: attempt.user_id,
          flow_payment_attempt_id: attempt.id,
          refund_commerce_order: refundCommerceOrder,
          amount_cents: entryFeeCents,
          amount_pesos: amountPesos,
          receiver_email: user.email,
          status: 'rejected',
          error_message: message,
        })
      } catch (insertErr) {
        console.error('[refunds] Failed to record rejected refund:', insertErr)
      }

      results.push({
        userId: attempt.user_id,
        email: user.email,
        amountCents: entryFeeCents,
        refundCommerceOrder,
        error: message,
      })
    }
  }

  return results
}

/**
 * Reconcilia reembolsos en estado 'pending' consultando a Flow.
 * Se llama desde el cron de reconciliación para detectar webhooks perdidos.
 * Solo revisa intentos con más de `minAgeMinutes` (evita condiciones de carrera).
 */
export async function reconcileStaleRefunds(minAgeMinutes = 10): Promise<{
  checked: number
  updated: number
  errors: number
}> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString()

  const { data: stale } = await supabase
    .from('flow_refund_attempts')
    .select('id, flow_refund_token, receiver_email, amount_pesos, tournament_id')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .not('flow_refund_token', 'is', null)

  const rows = (stale ?? []) as Pick<
    FlowRefundAttempt,
    'id' | 'flow_refund_token' | 'receiver_email' | 'amount_pesos' | 'tournament_id'
  >[]

  let updated = 0
  let errors = 0

  for (const row of rows) {
    if (!row.flow_refund_token) continue
    try {
      const status = await getFlowRefundStatus(row.flow_refund_token)

      // Solo actualizamos si Flow dice que ya terminó (no si sigue pendiente)
      if (!['completed', 'rejected', 'cancelled'].includes(status.status)) continue

      const flowStatus = status.status as 'completed' | 'rejected' | 'cancelled'
      await supabase
        .from('flow_refund_attempts')
        .update({ status: flowStatus, settled_at: new Date().toISOString() })
        .eq('id', row.id)

      updated++
    } catch (err) {
      console.error('[reconcile] Error consultando Flow para refund', row.id, err)
      errors++
    }
  }

  return { checked: rows.length, updated, errors }
}
