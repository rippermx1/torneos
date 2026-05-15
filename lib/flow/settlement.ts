import { createAdminClient } from '@/lib/supabase/server'
import { getFlowPaymentStatus, type FlowPaymentStatus } from '@/lib/flow/payments'
import { calculateIvaIncludedBreakdown, splitEntryFee } from '@/lib/tournament/finance'
import { isModeloB } from '@/lib/tax/regime'
import { sendTournamentRegistrationEmail } from '@/lib/email/tournament-notifications'

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
//  - tournament_registration → settle_tournament_registration RPC
//    + crear dte_documents pendiente para emisión async vía LibreDTE.
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
    .select('id, intent, tournament_id, net_amount_cents')
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

    if (error) throw new Error(error.message)

    const settlement = result as { idempotent: boolean; registration_id: string; attempt_id: string }

    if (!settlement.idempotent) {
      // Encolar boleta DTE solo en Modelo B.
      if (isModeloB()) {
        await enqueueRegistrationBoleta({
          registrationId: settlement.registration_id,
          flowAttemptId: settlement.attempt_id,
        })
      }

      // Email de confirmación de inscripción (no bloquea el webhook)
      void (async () => {
        try {
          const { data: tournament } = await admin
            .from('tournaments')
            .select('name, play_window_start, play_window_end, entry_fee_cents')
            .eq('id', attempt.tournament_id)
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

// ───────────────────────────────────────────────────────────────
// Crea el registro pendiente en dte_documents para que el cron
// de emisión LibreDTE lo procese de forma asíncrona.
// El monto del DTE es el platform_fee_gross_cents (servicio
// con IVA incluido). El resto del cobro Flow es custodia.
// ───────────────────────────────────────────────────────────────
async function enqueueRegistrationBoleta(input: {
  registrationId: string
  flowAttemptId: string
}): Promise<void> {
  const admin = createAdminClient()

  const { data: registration, error } = await admin
    .from('registrations')
    .select('id, entry_fee_cents, platform_fee_gross_cents, platform_fee_net_cents, platform_fee_iva_cents')
    .eq('id', input.registrationId)
    .single()

  if (error || !registration) {
    console.error('No se pudo cargar registration para encolar boleta:', error)
    return
  }

  const platformFeeGross = registration.platform_fee_gross_cents
  if (!platformFeeGross || platformFeeGross <= 0) {
    // Freeroll u otro caso sin servicio facturable; no se emite boleta.
    return
  }

  // Si la inscripción no trae el desglose persistido (caso defensivo),
  // recalculamos con la lógica oficial.
  const net = registration.platform_fee_net_cents
  const iva = registration.platform_fee_iva_cents
  let netCents = net
  let ivaCents = iva
  if (netCents == null || ivaCents == null) {
    const recomputed = calculateIvaIncludedBreakdown(platformFeeGross)
    netCents = recomputed.netCents
    ivaCents = recomputed.ivaCents
  }

  const { error: insertError } = await admin.from('dte_documents').insert({
    registration_id: registration.id,
    flow_payment_attempt_id: input.flowAttemptId,
    document_type: 'boleta_electronica',
    total_cents: platformFeeGross,
    net_cents: netCents,
    iva_cents: ivaCents,
    status: 'pending',
  })

  if (insertError) {
    console.error('Error encolando dte_documents:', insertError)
  }
}

// Helper utilizado solo en testing/scripts para anticipar el split.
// No se invoca en runtime de webhook.
export function previewBoletaForEntry(entryFeeCents: number, prizeFundBps?: number) {
  const split = splitEntryFee(entryFeeCents, prizeFundBps)
  return {
    totalCents: split.platformFeeGrossCents,
    netCents: split.platformFeeNetCents,
    ivaCents: split.platformFeeIvaCents,
  }
}

// Lee body con tope estricto de bytes; aborta si se excede.
async function readBoundedText(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  // eslint-disable-next-line no-constant-condition
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
