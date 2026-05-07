import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import {
  getBalance,
  getWithdrawableBalance,
  getWithdrawnInWindow,
  insertTransaction,
} from '@/lib/wallet/transactions'
import {
  MIN_WITHDRAWAL_CENTS,
  MAX_WITHDRAWAL_CENTS,
  DAILY_WITHDRAWAL_CAP_CENTS,
  MONTHLY_WITHDRAWAL_CAP_CENTS,
} from '@/lib/wallet/limits'
import { isValidRut, samePersonName, sameRut } from '@/lib/identity/verification'

interface WithdrawRequest {
  amountCents: number
  bankName: string
  bankAccount: string
  accountRut: string
  accountHolder: string
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId

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

  if (!isValidRut(accountRut)) {
    return Response.json({ error: 'RUT del titular bancario inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('kyc_status, full_name, rut')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return Response.json({ error: 'No se pudo verificar el perfil del usuario' }, { status: 500 })
  }

  if (profile.kyc_status !== 'approved') {
    return Response.json(
      { error: 'Debes tener KYC aprobado antes de solicitar retiros.' },
      { status: 403 }
    )
  }

  if (!profile.rut || !isValidRut(profile.rut) || !sameRut(profile.rut, accountRut)) {
    return Response.json(
      { error: 'El RUT bancario debe coincidir con la identidad verificada.' },
      { status: 422 }
    )
  }

  if (!profile.full_name || !samePersonName(profile.full_name, accountHolder)) {
    return Response.json(
      { error: 'El titular bancario debe coincidir con el nombre verificado en KYC.' },
      { status: 422 }
    )
  }

  const { data: pendingWithdrawal, error: pendingError } = await supabase
    .from('withdrawal_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (pendingError) {
    return Response.json({ error: 'No se pudo validar retiros pendientes' }, { status: 500 })
  }

  if (pendingWithdrawal) {
    return Response.json(
      { error: 'Ya tienes una solicitud de retiro pendiente. Espera su revisión antes de crear otra.' },
      { status: 409 }
    )
  }

  // 1. Saldo retirable: solo lo ganado en torneos puede retirarse.
  // El saldo total puede ser mayor por saldos legados o ajustes, pero solo
  // premios + reembolsos de torneo son retirables.
  const [withdrawable, totalBalance] = await Promise.all([
    getWithdrawableBalance(userId),
    getBalance(userId),
  ])

  if (totalBalance < amountCents) {
    return Response.json(
      {
        error: 'Saldo insuficiente',
        insufficientFunds: true,
        balanceCents: totalBalance,
        requiredCents: amountCents,
      },
      { status: 402 }
    )
  }

  if (withdrawable < amountCents) {
    return Response.json(
      {
        error:
          'Solo el saldo ganado en torneos o reembolsos de torneo es retirable.',
        notWithdrawable: true,
        withdrawableCents: withdrawable,
        balanceCents: totalBalance,
        requiredCents: amountCents,
      },
      { status: 403 }
    )
  }

  // 2. Anti-fraude: caps en ventana móvil
  const [withdrawn24h, withdrawn30d] = await Promise.all([
    getWithdrawnInWindow(userId, '1 day'),
    getWithdrawnInWindow(userId, '30 days'),
  ])

  if (withdrawn24h + amountCents > DAILY_WITHDRAWAL_CAP_CENTS) {
    return Response.json(
      {
        error: 'Excede el límite diario de retiros ($500.000 CLP).',
        capExceeded: 'daily',
        usedCents: withdrawn24h,
        capCents: DAILY_WITHDRAWAL_CAP_CENTS,
      },
      { status: 429 }
    )
  }

  if (withdrawn30d + amountCents > MONTHLY_WITHDRAWAL_CAP_CENTS) {
    return Response.json(
      {
        error: 'Excede el límite mensual de retiros ($2.000.000 CLP).',
        capExceeded: 'monthly',
        usedCents: withdrawn30d,
        capCents: MONTHLY_WITHDRAWAL_CAP_CENTS,
      },
      { status: 429 }
    )
  }

  // 3. Debitar inmediatamente para evitar doble gasto.
  // Si la inserción de la solicitud falla, devolvemos crédito compensatorio.
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
      referenceType: 'withdrawal',
      metadata: { reason: 'withdrawal_request_creation_failed', original_tx: transactionId },
    }).catch(console.error)

    if (error?.code === '23505') {
      return Response.json(
        { error: 'Ya tienes una solicitud de retiro pendiente. Espera su revisión antes de crear otra.' },
        { status: 409 }
      )
    }

    return Response.json({ error: 'Error al crear la solicitud' }, { status: 500 })
  }

  return Response.json({ ok: true, requestId: data.id })
}
