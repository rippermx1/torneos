import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { MIN_WITHDRAWAL_CENTS, MAX_WITHDRAWAL_CENTS } from '@/lib/wallet/limits'
import { isValidRut, samePersonName, sameRut } from '@/lib/identity/verification'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'

interface WithdrawRequest {
  requestId: string
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
  const rateLimit = await checkRateLimit({
    key: `wallet:withdraw:${userId}:${getRequestIp(req)}`,
    limit: 3,
    windowMs: 60 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  let body: WithdrawRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { requestId, amountCents, bankName, bankAccount, accountRut, accountHolder } = body
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return Response.json({ error: 'Identificador de solicitud inválido' }, { status: 400 })
  }

  if (
    typeof amountCents !== 'number' ||
    !Number.isSafeInteger(amountCents) || amountCents % 100 !== 0 ||
    amountCents < MIN_WITHDRAWAL_CENTS ||
    amountCents > MAX_WITHDRAWAL_CENTS
  ) {
    return Response.json(
      { error: 'Monto inválido. Mínimo $5.000 CLP, máximo $500.000 CLP.' },
      { status: 400 }
    )
  }

  if ([bankName, bankAccount, accountRut, accountHolder].some(v => typeof v !== 'string' || !v.trim() || v.length > 200)) {
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

  try {
    const { data, error } = await supabase.rpc('request_withdrawal', {
      p_request_id: requestId, p_user_id: userId, p_amount_cents: amountCents,
      p_bank_name: bankName.trim(), p_bank_account: bankAccount.trim(),
      p_account_rut: accountRut.trim(), p_account_holder: accountHolder.trim(),
      p_verified_full_name: profile.full_name,
    })
    if (error) {
      const status = /^PT(400|402|403|409|422|429)$/.test(error.code) ? Number(error.code.slice(2)) : 503
      return Response.json({ error: status === 503 ? 'No se pudo confirmar la solicitud. Reintenta con los mismos datos.' : error.message }, { status })
    }
    if (data !== requestId) throw new Error('Respuesta de retiro inconsistente')
    return Response.json({ ok: true, requestId: data })
  } catch (e) {
    console.error('[withdraw/request]', e)
    return Response.json({ error: 'No se pudo confirmar la solicitud. Reintenta con los mismos datos.' }, { status: 503 })
  }
}
