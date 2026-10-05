import { createAdminClient } from '@/lib/supabase/server'
import { dispatchRefund, reconcileRefund } from '@/lib/flow/refund-worker'
import { getAppUrl } from '@/lib/env'
import { rakebackExpiryIso } from '@/lib/wallet/rakeback'
import type { Tournament } from '@/types/database'

export interface RefundResult {
  userId: string; email: string; amountCents: number; refundCommerceOrder: string
  flowRefundToken?: string; error?: string
}

// The cancellation transaction already records obligations. This also recovers
// legacy cancellations, before dispatching any external operation.
export async function issueFlowRefunds(
  tournamentId: string, _entryFeeCents: number, requestOrigin: string, tournamentName?: string
): Promise<RefundResult[]> {
  void tournamentName // signature retained for lifecycle callers; worker reads stored tournament
  const admin = createAdminClient()
  const queued = await admin.rpc('queue_tournament_refunds', { p_tournament_id: tournamentId })
  if (queued.error) throw new Error(queued.error.message)
  const { data, error } = await admin.from('flow_refund_attempts').select('*')
    .eq('tournament_id', tournamentId).eq('status', 'queued').order('created_at', { ascending: true }).limit(50)
  if (error) throw new Error(error.message)
  const results: RefundResult[] = []
  for (const row of data ?? []) {
    const result: RefundResult = { userId: row.user_id, email: row.receiver_email,
      amountCents: row.amount_cents, refundCommerceOrder: row.refund_commerce_order }
    try {
      const dispatched = await dispatchRefund(row.id, requestOrigin)
      if (!dispatched.dispatched && !dispatched.error) continue // another worker owns it
      result.flowRefundToken = dispatched.token
      result.error = dispatched.error
    } catch (e) { result.error = e instanceof Error ? e.message : String(e) }
    results.push(result)
  }
  return results
}

export async function reconcileStaleRefunds(minAgeMinutes = 10) {
  const { data, error } = await createAdminClient().from('flow_refund_attempts')
    .select('id, flow_refund_token').in('status', ['pending', 'unknown'])
    .lt('created_at', new Date(Date.now() - minAgeMinutes * 60_000).toISOString())
    .not('flow_refund_token', 'is', null).order('last_reconciled_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true }).limit(50)
  if (error) throw new Error(error.message)
  let updated = 0, errors = 0
  for (const row of data ?? []) {
    if (!row.flow_refund_token) continue
    try { if (await reconcileRefund(row.id, row.flow_refund_token)) updated++ }
    catch (e) { console.error('[refund-reconcile]', row.id, e); errors++ }
    finally {
      const stamp = await createAdminClient().from('flow_refund_attempts')
        .update({ last_reconciled_at: new Date().toISOString() }).eq('id', row.id)
      if (stamp.error) errors++
    }
  }
  return { checked: data?.length ?? 0, updated, errors }
}

export async function reconcileCancelledTournamentRefunds() {
  const admin = createAdminClient()
  const appUrl = getAppUrl()
  if (!appUrl) throw new Error('APP_URL no configurado')
  const { data, error } = await admin.from('tournaments').select('id, name, entry_fee_cents')
    .eq('status', 'cancelled').gt('entry_fee_cents', 0)
  if (error) throw new Error(error.message)
  const tournaments = (data ?? []) as Pick<Tournament, 'id' | 'name' | 'entry_fee_cents'>[]
  let refundsIssued = 0, refundsFailed = 0, rewardsRestored = 0
  for (const t of tournaments) {
    const results = await issueFlowRefunds(t.id, t.entry_fee_cents, appUrl, t.name)
    for (const r of results) { if (r.error) refundsFailed++; else refundsIssued++ }
    rewardsRestored += await restoreRedeemedRewards(admin, t.id)
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
