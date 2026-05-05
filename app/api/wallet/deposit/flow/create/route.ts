import { randomUUID } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAppUrl } from '@/lib/env'
import { createFlowPayment, buildFlowCheckoutUrl } from '@/lib/flow/payments'
import {
  computeDepositBreakdown,
  MIN_DEPOSIT_NET_CENTS,
  MAX_DEPOSIT_NET_CENTS,
} from '@/lib/flow/fees'

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  let body: { amountCents: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { amountCents } = body
  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_DEPOSIT_NET_CENTS ||
    amountCents > MAX_DEPOSIT_NET_CENTS
  ) {
    return Response.json(
      { error: 'Monto inválido. Mínimo $1.000 CLP, máximo $500.000 CLP.' },
      { status: 400 }
    )
  }

  const breakdown = computeDepositBreakdown(amountCents)
  const requestOrigin = new URL(req.url).origin
  const appUrl = getAppUrl(requestOrigin) ?? requestOrigin
  const commerceOrder = `dep-${randomUUID()}`

  // Persistimos el intento ANTES de llamar a Flow para tener trazabilidad.
  // Si Flow falla, el attempt queda como pending y el cron de reconciliación
  // lo cierra como expired tras 30 minutos.
  const admin = createAdminClient()
  const { data: attempt, error: attemptError } = await admin
    .from('flow_payment_attempts')
    .insert({
      user_id: userId,
      commerce_order: commerceOrder,
      net_amount_cents: breakdown.netCents,
      charged_amount_cents: breakdown.chargedCents,
      user_fee_cents: breakdown.userFeeCents,
      status: 'pending',
    })
    .select('id')
    .single()

  if (attemptError || !attempt) {
    console.error('Error creando flow_payment_attempt:', attemptError)
    return Response.json(
      { error: 'No se pudo iniciar el pago' },
      { status: 500 }
    )
  }

  try {
    const flowResponse = await createFlowPayment({
      commerceOrder,
      subject: 'Recarga de billetera — Torneos 2048',
      amount: breakdown.chargedPesos,
      email: user.email ?? '',
      urlConfirmation: `${appUrl}/api/webhooks/flow`,
      urlReturn: `${appUrl}/api/wallet/deposit/flow/return`,
      optional: { user_id: userId, net_cents: String(breakdown.netCents) },
      timeout: 1800, // 30 min: si no paga en ese plazo, expira
    })

    // Guardamos el flow_token tan pronto lo recibimos
    await admin
      .from('flow_payment_attempts')
      .update({
        flow_token: flowResponse.token,
        flow_order: flowResponse.flowOrder,
      })
      .eq('id', attempt.id)

    return Response.json({
      redirectUrl: buildFlowCheckoutUrl(flowResponse),
      breakdown: {
        netCents: breakdown.netCents,
        chargedCents: breakdown.chargedCents,
        userFeeCents: breakdown.userFeeCents,
      },
    })
  } catch (err) {
    // Si Flow rechaza, marcamos el attempt como fallido para no dejar basura pending
    await admin
      .from('flow_payment_attempts')
      .update({ status: 'rejected', settled_at: new Date().toISOString() })
      .eq('id', attempt.id)

    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('Error creando pago Flow:', message)
    return Response.json(
      { error: `Error al iniciar pago: ${message}` },
      { status: 500 }
    )
  }
}
