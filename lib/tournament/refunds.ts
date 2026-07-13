import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { createFlowRefund, getFlowRefundStatus } from '@/lib/flow/refunds'
import { getAppUrl } from '@/lib/env'
import { sendTournamentCancelledEmail } from '@/lib/email/refund-notifications'
import { rakebackExpiryIso } from '@/lib/wallet/rakeback'
import type { FlowPaymentAttempt, FlowRefundAttempt, Tournament } from '@/types/database'

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
    .eq('status', 'paid')
  const attempts = rawAttempts as AttemptRow[] | null

  if (!attempts?.length) return results

  // Idempotencia: no reemitir una reversa para un pago que ya tiene un intento
  // de reembolso (en cualquier estado). Los 'rejected' los reintenta
  // autoRetryRejectedRefunds; aquí solo emitimos la PRIMERA reversa de cada pago.
  // Permite llamar issueFlowRefunds tanto en la cancelación inmediata (lifecycle)
  // como desde la red de seguridad (reconcileCancelledTournamentRefunds) sin duplicar.
  const { data: existingRefunds } = await supabase
    .from('flow_refund_attempts')
    .select('flow_payment_attempt_id')
    .eq('tournament_id', tournamentId)
  const alreadyRefunded = new Set(
    (existingRefunds ?? [])
      .map((row) => (row as { flow_payment_attempt_id: string | null }).flow_payment_attempt_id)
      .filter((id): id is string => Boolean(id))
  )

  for (const attempt of attempts) {
    if (alreadyRefunded.has(attempt.id)) continue
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
 * Reintenta automáticamente reembolsos rechazados, hasta `maxAutoRetries` veces.
 * Omite cualquier pago que ya tenga un intento pendiente o completado (evita duplicados).
 * Solo procesa intentos con más de 30 minutos de antigüedad para dar margen a Flow.
 */
export async function autoRetryRejectedRefunds(maxAutoRetries = 3): Promise<{
  retried: number
  skipped: number
  errors: number
}> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const appUrl = getAppUrl()
  if (!appUrl) {
    console.error('[auto-retry] APP_URL no configurado, omitiendo reintento automático')
    return { retried: 0, skipped: 0, errors: 0 }
  }
  const callbackUrl = `${appUrl}/api/webhooks/flow/refund`

  // Un intento rechazado por pago (el más reciente de cada flow_payment_attempt_id)
  const { data: rejected } = await supabase
    .from('flow_refund_attempts')
    .select('id, flow_payment_attempt_id, tournament_id, user_id, receiver_email, amount_cents, amount_pesos, created_at')
    .eq('status', 'rejected')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })

  const rows = (rejected ?? []) as Array<{
    id: string
    flow_payment_attempt_id: string
    tournament_id: string
    user_id: string
    receiver_email: string
    amount_cents: number
    amount_pesos: number
    created_at: string
  }>

  // Deduplicar: un reintento por pago original
  const seen = new Set<string>()
  const deduped = rows.filter((r) => {
    if (seen.has(r.flow_payment_attempt_id)) return false
    seen.add(r.flow_payment_attempt_id)
    return true
  })

  let retried = 0
  let skipped = 0
  let errors = 0

  for (const row of deduped) {
    // Si ya hay un intento pendiente o completado para este pago, no crear otro
    const { count: activeCount } = await supabase
      .from('flow_refund_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('flow_payment_attempt_id', row.flow_payment_attempt_id)
      .in('status', ['pending', 'completed'])

    if ((activeCount ?? 0) > 0) { skipped++; continue }

    // Contar intentos totales para respetar el límite de reintentos automáticos
    const { count: totalCount } = await supabase
      .from('flow_refund_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('flow_payment_attempt_id', row.flow_payment_attempt_id)

    if ((totalCount ?? 0) >= maxAutoRetries) { skipped++; continue }

    const newCommerceOrder = `ref-${randomUUID()}`

    try {
      const flowResponse = await createFlowRefund({
        refundCommerceOrder: newCommerceOrder,
        receiverEmail: row.receiver_email,
        amountPesos: row.amount_pesos,
        urlCallBack: callbackUrl,
      })

      await supabase.from('flow_refund_attempts').insert({
        tournament_id: row.tournament_id,
        user_id: row.user_id,
        flow_payment_attempt_id: row.flow_payment_attempt_id,
        refund_commerce_order: newCommerceOrder,
        flow_refund_token: flowResponse.token,
        flow_refund_order: flowResponse.flowRefundOrder,
        amount_cents: row.amount_cents,
        amount_pesos: row.amount_pesos,
        receiver_email: row.receiver_email,
        status: 'pending',
      })

      retried++
    } catch (err) {
      console.error('[auto-retry] Error en Flow para refund', row.id, err)
      errors++
    }
  }

  return { retried, skipped, errors }
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

/**
 * Red de seguridad de reembolsos: emite la reversa Flow para torneos ya
 * CANCELADOS que tengan pagos acreditados sin ninguna reversa emitida.
 *
 * Por qué existe: la emisión inmediata en el lifecycle puede no ocurrir en
 * todos los caminos de cancelación (p. ej. el auto-cancel de game/start llama
 * a cancel_tournament pero no emite reembolsos) o puede fallar parcialmente.
 * Este barrido idempotente garantiza que todo inscrito de un torneo cancelado
 * termine reembolsado. issueFlowRefunds omite los pagos que ya tienen un
 * intento de reembolso, así que reejecutar es seguro.
 *
 * Acotado a torneos recientes (lookbackDays) para mantener el barrido barato.
 */
export async function reconcileCancelledTournamentRefunds(lookbackDays = 3): Promise<{
  tournamentsChecked: number
  refundsIssued: number
  refundsFailed: number
  rewardsRestored: number
}> {
  const supabase = createAdminClient()
  const appUrl = getAppUrl()
  if (!appUrl) {
    console.error('[refund-reconcile] APP_URL no configurado, omitiendo barrido de cancelados')
    return { tournamentsChecked: 0, refundsIssued: 0, refundsFailed: 0, rewardsRestored: 0 }
  }

  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: cancelled } = await supabase
    .from('tournaments')
    .select('id, name, entry_fee_cents')
    .eq('status', 'cancelled')
    .gt('entry_fee_cents', 0)
    .gte('play_window_start', cutoff)

  const tournaments = (cancelled ?? []) as Pick<Tournament, 'id' | 'name' | 'entry_fee_cents'>[]
  let refundsIssued = 0
  let refundsFailed = 0
  let rewardsRestored = 0

  for (const t of tournaments) {
    const refundResults = await issueFlowRefunds(t.id, t.entry_fee_cents, appUrl, t.name)
    for (const r of refundResults) {
      if (r.error) refundsFailed++
      else refundsIssued++
    }
    rewardsRestored += await restoreRedeemedRewards(supabase, t.id)
  }

  return { tournamentsChecked: tournaments.length, refundsIssued, refundsFailed, rewardsRestored }
}

// Restituye las recompensas canjeadas en un torneo cancelado: quien usó su
// participación gratis la recibe de vuelta (con nueva ventana de vencimiento),
// simétrico a la reversa Flow de quienes pagaron cash. Idempotente por usuario:
// no restituye si ya existe un 'cancel_restore' para ese torneo.
async function restoreRedeemedRewards(
  supabase: ReturnType<typeof createAdminClient>,
  tournamentId: string
): Promise<number> {
  const { data } = await supabase
    .from('wallet_transactions')
    .select('user_id, amount_cents, metadata')
    .eq('type', 'tournament_credit')
    .eq('reference_id', tournamentId)

  const rows = (data ?? []) as {
    user_id: string
    amount_cents: number
    metadata: Record<string, unknown> | null
  }[]
  const kindOf = (m: Record<string, unknown> | null) => (m as { kind?: string } | null)?.kind
  const redemptions = rows.filter((r) => r.amount_cents < 0 && kindOf(r.metadata) === 'redeem')
  const alreadyRestored = new Set(
    rows
      .filter((r) => r.amount_cents > 0 && kindOf(r.metadata) === 'cancel_restore')
      .map((r) => r.user_id)
  )

  let restored = 0
  for (const redemption of redemptions) {
    if (alreadyRestored.has(redemption.user_id)) continue
    const { error } = await supabase.rpc('wallet_insert_transaction', {
      p_user_id: redemption.user_id,
      p_type: 'tournament_credit',
      p_amount_cents: -redemption.amount_cents,
      p_reference_type: 'rakeback',
      p_reference_id: tournamentId,
      p_metadata: { kind: 'cancel_restore', expires_at: rakebackExpiryIso() },
    })
    if (error) {
      console.error(`[refund-reconcile] No se pudo restituir recompensa a ${redemption.user_id}:`, error.message)
      continue
    }
    restored++
  }
  return restored
}
