import { createAdminClient } from '@/lib/supabase/server'
import { getFlowPaymentStatus, getFlowPaymentStatusByCommerceOrder, type FlowPaymentStatus } from '@/lib/flow/payments'
import { sendTournamentRegistrationEmail } from '@/lib/email/tournament-notifications'

export interface FlowSettlement {
  status: FlowPaymentStatus; credited: boolean; intent?: string; registrationId?: string; refundId?: string
}

export async function settleFlowPayment(token: string): Promise<FlowSettlement> {
  return settleVerifiedPayment(await getFlowPaymentStatus(token), token)
}

export async function reconcileFlowPayment(commerceOrder: string): Promise<FlowSettlement> {
  const status = await getFlowPaymentStatusByCommerceOrder(commerceOrder)
  if (status.commerceOrder !== commerceOrder) throw new Error('Orden comercial Flow inconsistente')
  return settleVerifiedPayment(status, null)
}

async function settleVerifiedPayment(status: FlowPaymentStatus, token: string | null): Promise<FlowSettlement> {
  const admin = createAdminClient()
  const { data: attempt, error } = await admin.from('flow_payment_attempts')
    .select('id, intent, tournament_id, charged_amount_cents, user_id, flow_token, flow_order')
    .eq('commerce_order', status.commerceOrder).single()
  if (error || !attempt) throw new Error('No se encontró el intento de pago')
  const amount = Number(status.amount)
  if (status.currency !== 'CLP' || !Number.isSafeInteger(amount) || amount <= 0 ||
    amount * 100 !== attempt.charged_amount_cents || !Number.isSafeInteger(status.flowOrder) || status.flowOrder <= 0 ||
    (attempt.flow_order !== null && attempt.flow_order !== status.flowOrder) ||
    (attempt.flow_token && token && attempt.flow_token !== token)) throw new Error('Identidad o monto Flow inconsistente')
  if (![1, 2, 3, 4].includes(status.status)) throw new Error('Estado de pago Flow desconocido')
  if (status.status !== 2) {
    if (status.status === 3 || status.status === 4) {
      const failed = await admin.rpc('wallet_mark_flow_attempt_failed', {
        p_commerce_order: status.commerceOrder, p_flow_token: token, p_flow_status_code: status.status,
        p_raw: status as unknown as Record<string, unknown>,
      })
      if (failed.error) throw new Error(failed.error.message)
    }
    return { status, credited: false, intent: attempt.intent }
  }
  if (attempt.intent !== 'tournament_registration') {
    const refund = await admin.rpc('queue_unsupported_flow_payment_refund', {
      p_commerce_order: status.commerceOrder, p_flow_token: token, p_flow_order: status.flowOrder,
      p_amount_cents: amount * 100, p_payer_email: status.payer ?? null,
      p_raw: status as unknown as Record<string, unknown>,
    })
    if (refund.error || !refund.data) throw new Error(refund.error?.message ?? 'No se registró la devolución')
    return { status, credited: false, intent: attempt.intent, refundId: refund.data }
  }
  const settled = await admin.rpc('settle_tournament_registration', {
    p_commerce_order: status.commerceOrder, p_flow_token: token, p_flow_order: status.flowOrder,
    p_amount_cents: amount * 100, p_payment_method: status.paymentData?.media ?? null,
    p_payer_email: status.payer ?? null, p_raw: status as unknown as Record<string, unknown>,
  })
  if (settled.error) throw new Error(settled.error.message)
  const result = settled.data as { idempotent: boolean; registration_id?: string; refund_id?: string }
  if (!result || (!result.registration_id && !result.refund_id)) throw new Error('Settlement no dejó inscripción ni devolución')
  if (result.refund_id) return { status, credited: false, intent: attempt.intent, refundId: result.refund_id }
  if (!result.idempotent && attempt.tournament_id) {
    void (async () => {
      const [{ data: tournament }, { data: authUser }] = await Promise.all([
        admin.from('tournaments').select('name, play_window_start, play_window_end, entry_fee_cents').eq('id', attempt.tournament_id!).single(),
        admin.auth.admin.getUserById(attempt.user_id),
      ])
      const user = authUser?.user
      if (user?.email && tournament) await sendTournamentRegistrationEmail({
        to: user.email, username: user.user_metadata?.username ?? user.email,
        tournamentName: tournament.name, playWindowStart: tournament.play_window_start,
        playWindowEnd: tournament.play_window_end, entryFeeCents: tournament.entry_fee_cents,
      })
    })().catch(e => console.error('[settlement] Email inscripción:', e))
  }
  return { status, credited: true, intent: attempt.intent, registrationId: result.registration_id }
}

// Retained for callers classifying business failures; SQL now records the refund atomically.
export function isTerminalRegistrationFailure(message: string): boolean {
  return ['Torneo lleno', 'Inscripciones cerradas', 'Cuota inconsistente', 'ENTRY_'].some(s => message.includes(s))
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
