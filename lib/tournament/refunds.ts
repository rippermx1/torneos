import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { createFlowRefund } from '@/lib/flow/refunds'
import { getAppUrl } from '@/lib/env'
import type { FlowPaymentAttempt } from '@/types/database'

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
  requestOrigin: string
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
