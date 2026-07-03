import { createAdminClient } from '@/lib/supabase/server'
import { computeExpiredCredit, type CreditTx } from '@/lib/wallet/rakeback'

// Expira los créditos de rakeback vencidos (>30 días sin consumir), calculado FIFO
// por usuario, insertando un débito tournament_credit (kind='expiry'). Idempotente.
//
// v1: barre todas las transacciones de crédito en cada corrida. Bajo volumen es
// barato; a escala conviene mover a un cron diario dedicado con filtrado por usuario.
export async function expireStaleCredits(): Promise<{
  usersChecked: number
  usersExpired: number
  totalExpiredCents: number
}> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('wallet_transactions')
    .select('user_id, amount_cents, created_at, metadata')
    .eq('type', 'tournament_credit')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`expire-credits: ${error.message}`)

  const rows = (data ?? []) as {
    user_id: string
    amount_cents: number
    created_at: string
    metadata: Record<string, unknown> | null
  }[]

  const byUser = new Map<string, CreditTx[]>()
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? []
    list.push({
      amountCents: r.amount_cents,
      createdAt: r.created_at,
      expiresAt: (r.metadata as { expires_at?: string } | null)?.expires_at ?? null,
    })
    byUser.set(r.user_id, list)
  }

  const now = new Date()
  let usersExpired = 0
  let totalExpiredCents = 0

  for (const [userId, txs] of byUser) {
    const expired = computeExpiredCredit(txs, now)
    if (expired <= 0) continue

    const { error: insErr } = await admin.rpc('wallet_insert_transaction', {
      p_user_id: userId,
      p_type: 'tournament_credit',
      p_amount_cents: -expired,
      p_reference_type: 'rakeback',
      p_reference_id: null,
      p_metadata: { kind: 'expiry' },
    })
    if (insErr) {
      console.error(`[expire-credits] falló para ${userId}:`, insErr.message)
      continue
    }
    usersExpired += 1
    totalExpiredCents += expired
  }

  return { usersChecked: byUser.size, usersExpired, totalExpiredCents }
}
