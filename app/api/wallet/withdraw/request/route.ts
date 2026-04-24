import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getBalance, insertTransaction } from '@/lib/wallet/transactions'

const MIN_WITHDRAWAL_CENTS = 500000  // $5.000 CLP — debe coincidir con /legal/reembolso y withdraw/page.tsx
const MAX_WITHDRAWAL_CENTS = 50000000 // $500.000 CLP

interface WithdrawRequest {
  amountCents: number
  bankName: string
  bankAccount: string
  accountRut: string
  accountHolder: string
}

export async function POST(req: Request): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  let body: WithdrawRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { amountCents, bankName, bankAccount, accountRut, accountHolder } = body

  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_WITHDRAWAL_CENTS ||
    amountCents > MAX_WITHDRAWAL_CENTS
  ) {
    return Response.json(
      { error: 'Monto inválido. Mínimo $5.000 CLP, máximo $500.000 CLP.' },
      { status: 400 }
    )
  }

  if (!bankName?.trim() || !bankAccount?.trim() || !accountRut?.trim() || !accountHolder?.trim()) {
    return Response.json({ error: 'Todos los datos bancarios son obligatorios' }, { status: 400 })
  }

  // Verificar saldo antes de debitar
  const balance = await getBalance(userId)
  if (balance < amountCents) {
    return Response.json(
      {
        error: 'Saldo insuficiente',
        insufficientFunds: true,
        balanceCents: balance,
        requiredCents: amountCents,
      },
      { status: 402 }
    )
  }

  const supabase = createAdminClient()

  // Debitar inmediatamente para evitar doble gasto
  // Si la inserción de la solicitud falla, el catch revierte con un crédito compensatorio
  let transactionId: string | null = null
  try {
    const tx = await insertTransaction({
      userId,
      type: 'withdrawal',
      amountCents: -amountCents,
      referenceType: 'withdrawal_request',
      metadata: { status: 'pending' },
    })
    transactionId = (tx as { id: string }).id
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Error al debitar saldo: ${message}` }, { status: 500 })
  }

  // Crear solicitud de retiro
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .insert({
      user_id: userId,
      amount_cents: amountCents,
      bank_name: bankName.trim(),
      bank_account: bankAccount.trim(),
      account_rut: accountRut.trim(),
      account_holder: accountHolder.trim(),
    })
    .select('id')
    .single()

  if (error || !data) {
    // Rollback: devolver el dinero si no se pudo crear la solicitud
    await insertTransaction({
      userId,
      type: 'refund',
      amountCents,
      referenceType: 'withdrawal_request',
      metadata: { reason: 'withdrawal_request_creation_failed', original_tx: transactionId },
    }).catch(console.error)

    return Response.json({ error: 'Error al crear la solicitud' }, { status: 500 })
  }

  return Response.json({ ok: true, requestId: data.id })
}
