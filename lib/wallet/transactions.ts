import { createAdminClient } from '@/lib/supabase/server'
import type { WalletTransactionType } from '@/types/database'

interface InsertTransactionParams {
  userId: string
  type: WalletTransactionType
  amountCents: number        // positivo = crédito, negativo = débito
  referenceType?: string
  referenceId?: string
  metadata?: Record<string, unknown>
}

// Wrapper sobre la función Postgres wallet_insert_transaction.
// Siempre usa el cliente admin para llamar funciones SECURITY DEFINER.
export async function insertTransaction(params: InsertTransactionParams) {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('wallet_insert_transaction', {
    p_user_id: params.userId,
    p_type: params.type,
    p_amount_cents: params.amountCents,
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_metadata: params.metadata ?? {},
  })

  if (error) {
    throw new Error(`wallet_insert_transaction falló: ${error.message}`)
  }

  return data
}

// Consulta el saldo actual del usuario.
export async function getBalance(userId: string): Promise<number> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('wallet_transactions')
    .select('balance_after_cents')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data ? Number(data.balance_after_cents) : 0
}

// Verifica si un payment_id de Mercado Pago ya fue procesado (idempotencia).
export async function isMpPaymentAlreadyProcessed(mpPaymentId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('wallet_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('metadata->>mp_payment_id', mpPaymentId)

  return (count ?? 0) > 0
}

// Saldo retirable: solo lo ganado en torneos menos lo retirado.
// Los depósitos no son retirables hasta haber pasado por un torneo
// (esto evita lavado y absorción de comisiones de pasarela).
export async function getWithdrawableBalance(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('wallet_withdrawable_balance', {
    p_user_id: userId,
  })
  if (error) throw new Error(`wallet_withdrawable_balance falló: ${error.message}`)
  return Number(data ?? 0)
}

// Suma retirada en una ventana móvil expresada como interval Postgres ('1 day', '30 days', etc).
export async function getWithdrawnInWindow(
  userId: string,
  pgInterval: string
): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('wallet_withdrawn_in_window', {
    p_user_id: userId,
    p_window: pgInterval,
  })
  if (error) throw new Error(`wallet_withdrawn_in_window falló: ${error.message}`)
  return Number(data ?? 0)
}
