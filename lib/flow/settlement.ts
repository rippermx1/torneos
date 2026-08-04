import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getFlowPaymentStatus, type FlowPaymentStatus } from '@/lib/flow/payments'
import { createFlowRefund } from '@/lib/flow/refunds'
import { getAppUrl } from '@/lib/env'
import { sendTournamentRegistrationEmail } from '@/lib/email/tournament-notifications'
import { computeRakebackCents, rakebackExpiryIso } from '@/lib/wallet/rakeback'
import { rewardsAreEnabled } from '@/lib/business/rules'

export interface FlowSettlement {
  status: FlowPaymentStatus
  credited: boolean
  intent?: 'tournament_registration' | 'wallet_deposit'
  registrationId?: string
}

// ───────────────────────────────────────────────────────────────
// Settlement de pagos Flow.
//
// Tras el webhook, consultamos getStatus a Flow y según el intent
// del flow_payment_attempts ramificamos:
//  - tournament_registration → settle_tournament_registration RPC.
//    El voucher Flow documenta la venta completa según la configuración SII.
//  - wallet_deposit (legado) → ya no soportado en Ruta 1; rechazamos.
// ───────────────────────────────────────────────────────────────
export async function settleFlowPayment(token: string): Promise<FlowSettlement> {
  const status = await getFlowPaymentStatus(token)
  const admin = createAdminClient()

  if (status.status !== 2) {
    if (status.status === 3 || status.status === 4) {
      await admin.rpc('wallet_mark_flow_attempt_failed', {
        p_commerce_order: status.commerceOrder,
        p_flow_token: token,
        p_flow_status_code: status.status,
        p_raw: status as unknown as Record<string, unknown>,
      })
    }
    return { status, credited: false }
  }

  const { data: attempt, error: attemptError } = await admin
    .from('flow_payment_attempts')
    .select('id, intent, tournament_id, net_amount_cents, user_id')
    .eq('commerce_order', status.commerceOrder)
    .single()

  if (attemptError || !attempt) {
    throw new Error(`Attempt no encontrado para commerce_order=${status.commerceOrder}`)
  }

  const amountCents = Math.round(status.amount * 100)

  if (attempt.intent === 'tournament_registration') {
    const { data: result, error } = await admin.rpc('settle_tournament_registration', {
      p_commerce_order: status.commerceOrder,
      p_flow_token: token,
      p_flow_order: status.flowOrder,
      p_amount_cents: amountCents,
      p_payment_method: status.paymentData?.media ?? null,
      p_payer_email: status.payer ?? null,
      p_raw: status as unknown as Record<string, unknown>,
    })

    if (error) {
      // Pago confirmado por Flow pero la inscripción no pudo asentarse porque el
      // torneo se llenó o la ventana de inscripción cerró mientras el usuario
      // pagaba. El dinero ya está cobrado: reembolsamos automáticamente en vez de
      // dejar el intento colgado (que terminaría 'expired' sin devolución).
      if (isTerminalRegistrationFailure(error.message)) {
        await refundUnsettleablePayment({
          attemptId: attempt.id,
          userId: attempt.user_id,
          tournamentId: attempt.tournament_id,
          commerceOrder: status.commerceOrder,
          flowOrder: status.flowOrder,
          amountCents,
          payerEmail: status.payer ?? null,
          reason: error.message,
        })
        return { status, credited: false, intent: 'tournament_registration' }
      }
      // Error transitorio (deadlock, red, etc.): propagar para que el webhook o el
      // cron de reconciliación reintente el settlement.
      throw new Error(error.message)
    }

    const settlement = result as { idempotent: boolean; registration_id: string; attempt_id: string }

    if (!settlement.idempotent) {
      // Rakeback: crédito de torneo (no retirable) por la inscripción, para subir
      // frecuencia y retención. No bloquea el settlement si falla.
      if (rewardsAreEnabled()) {
        try {
          const rakebackCents = computeRakebackCents(attempt.net_amount_cents)
          if (rakebackCents > 0) {
            const { error: rakebackError } = await admin.rpc('wallet_insert_transaction', {
              p_user_id: attempt.user_id,
              p_type: 'tournament_credit',
              p_amount_cents: rakebackCents,
              p_reference_type: 'rakeback',
              p_reference_id: attempt.tournament_id,
              p_metadata: {
                kind: 'rakeback_grant',
                entry_cents: attempt.net_amount_cents,
                expires_at: rakebackExpiryIso(),
              },
            })
            if (rakebackError) console.error('[settlement] Rakeback grant falló:', rakebackError.message)
          }
        } catch (e) {
          console.error('[settlement] Rakeback grant excepción:', e)
        }
      }

      // Email de confirmación de inscripción (no bloquea el webhook)
      void (async () => {
        try {
          const { data: tournament } = await admin
            .from('tournaments')
            .select('name, play_window_start, play_window_end, entry_fee_cents')
            .eq('id', attempt.tournament_id ?? '')
            .single()

          const { data: authUser } = await admin.auth.admin.getUserById(attempt.user_id ?? '')
          const email = authUser?.user?.email
          const username = authUser?.user?.user_metadata?.username ?? email

          if (email && tournament) {
            await sendTournamentRegistrationEmail({
              to: email,
              username,
              tournamentName: tournament.name,
              playWindowStart: tournament.play_window_start,
              playWindowEnd: tournament.play_window_end,
              entryFeeCents: tournament.entry_fee_cents,
            })
          }
        } catch (e) {
          console.error('[settlement] Error enviando email de inscripción:', e)
        }
      })()
    }

    return {
      status,
      credited: true,
      intent: 'tournament_registration',
      registrationId: settlement.registration_id,
    }
  }

  // wallet_deposit: ruta legada. En Ruta 1 ya no se aceptan depositos.
  // Marcamos el attempt como rechazado y dejamos rastro para auditoria.
  console.error(
    `Webhook Flow recibió intent=wallet_deposit (legado) para commerce_order=${status.commerceOrder}. Rechazando.`
  )
  await admin
    .from('flow_payment_attempts')
    .update({ status: 'rejected', settled_at: new Date().toISOString() })
    .eq('id', attempt.id)

  return { status, credited: false, intent: 'wallet_deposit' }
}

// Fallas de negocio de register_for_tournament que son TERMINALES: el pago no
// podrá asentar inscripción por más que se reintente, así que corresponde
// reembolsar. Se distinguen de errores transitorios (que deben reintentarse).
// Los mensajes provienen de las RAISE EXCEPTION de register_for_tournament.
export const TERMINAL_REGISTRATION_FAILURES = ['Torneo lleno', 'Inscripciones cerradas', 'Cuota inconsistente']

export function isTerminalRegistrationFailure(message: string): boolean {
  return TERMINAL_REGISTRATION_FAILURES.some((m) => message.includes(m))
}

// Reembolsa un pago Flow confirmado (status=2) cuya inscripción no pudo asentarse.
// Idempotente: solo el proceso que gana la transición atómica pending→cancelled
// emite la reversa; cualquier reintento posterior encuentra el intento ya no-pending
// (o una reversa existente) y no duplica.
async function refundUnsettleablePayment(input: {
  attemptId: string
  userId: string
  tournamentId: string | null
  commerceOrder: string
  flowOrder: number
  amountCents: number
  payerEmail: string | null
  reason: string
}): Promise<void> {
  const admin = createAdminClient()

  if (!input.tournamentId) {
    console.error(
      `[settlement] Intento ${input.commerceOrder} sin tournament_id; requiere reversa manual. Razón: ${input.reason}`
    )
    return
  }

  // 1. Claim atómico: solo un proceso pasa el intento de pending→cancelled.
  // flow_status_code=2 preserva que Flow confirmó el cobro (para auditoría).
  const { data: claimed } = await admin
    .from('flow_payment_attempts')
    .update({ status: 'cancelled', flow_status_code: 2, settled_at: new Date().toISOString() })
    .eq('id', input.attemptId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (!claimed) return // otro proceso (webhook o reconcile) ya lo tomó

  // 2. Idempotencia adicional: no duplicar si ya existe una reversa para este pago.
  const { count } = await admin
    .from('flow_refund_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('flow_payment_attempt_id', input.attemptId)
  if ((count ?? 0) > 0) return

  if (!input.payerEmail) {
    console.error(
      `[settlement] Pago ${input.commerceOrder} no asentable y sin email de pagador; requiere reversa manual. Razón: ${input.reason}`
    )
    return
  }

  const appUrl = getAppUrl() ?? 'https://www.torneosplay.cl'
  const refundCommerceOrder = `ref-${randomUUID()}`
  const amountPesos = Math.ceil(input.amountCents / 100)

  try {
    const flowResponse = await createFlowRefund({
      refundCommerceOrder,
      receiverEmail: input.payerEmail,
      amountPesos,
      urlCallBack: `${appUrl}/api/webhooks/flow/refund`,
      flowTrxId: input.flowOrder,
    })

    await admin.from('flow_refund_attempts').insert({
      tournament_id: input.tournamentId,
      user_id: input.userId,
      flow_payment_attempt_id: input.attemptId,
      refund_commerce_order: refundCommerceOrder,
      flow_refund_token: flowResponse.token,
      flow_refund_order: flowResponse.flowRefundOrder,
      amount_cents: input.amountCents,
      amount_pesos: amountPesos,
      receiver_email: input.payerEmail,
      status: 'pending',
    })
    console.warn(
      `[settlement] Reversa emitida por inscripción no asentable (${input.reason}) commerce_order=${input.commerceOrder}`
    )
  } catch (err) {
    // Registrar como rechazada para que autoRetryRejectedRefunds la reintente.
    const message = err instanceof Error ? err.message : String(err)
    const { error: insertErr } = await admin.from('flow_refund_attempts').insert({
      tournament_id: input.tournamentId,
      user_id: input.userId,
      flow_payment_attempt_id: input.attemptId,
      refund_commerce_order: refundCommerceOrder,
      amount_cents: input.amountCents,
      amount_pesos: amountPesos,
      receiver_email: input.payerEmail,
      status: 'rejected',
      error_message: message,
    })
    if (insertErr) {
      console.error('[settlement] No se pudo registrar reversa rechazada:', insertErr)
    }
    console.error(`[settlement] Falló reversa de inscripción no asentable ${input.commerceOrder}:`, message)
  }
}

// Lee body con tope estricto de bytes; aborta si se excede.
async function readBoundedText(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          // no-op
        }
        return null
      }
      chunks.push(value)
    }
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8').decode(buf)
}

export async function readFlowToken(req: Request, maxBytes = 4096): Promise<string | null> {
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) return queryToken

  const text = await readBoundedText(req, maxBytes)
  if (text == null) return null
  if (!text) return null

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()

  if (contentType.includes('application/json')) {
    try {
      const body = JSON.parse(text) as { token?: string }
      return body.token ?? null
    } catch {
      return null
    }
  }

  // x-www-form-urlencoded, text/plain o sin header: parseamos como URLSearchParams.
  return new URLSearchParams(text).get('token')
}
