import { createAdminClient } from '@/lib/supabase/server'
import { getFlowPaymentStatus } from '@/lib/flow/payments'

// ───────────────────────────────────────────────────────────────
// Webhook de Flow para confirmación de pago.
//
// Spec:
// - Flow llama a urlConfirmation vía POST application/x-www-form-urlencoded
//   con un único parámetro: token.
// - Debemos consultar payment/getStatus para obtener el estado real.
//   Esto evita falsificación: el atacante no puede simular un pago
//   exitoso con solo un token, porque consultamos a Flow directamente.
// - Status: 1=pendiente, 2=pagado, 3=rechazado, 4=anulado.
// - Solo si status=2 acreditamos la billetera.
// - Idempotencia por flow_token (índice único en wallet_transactions).
// ───────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? ''
  let token: string | null = null

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    const params = new URLSearchParams(text)
    token = params.get('token')
  } else if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as { token?: string }
      token = body.token ?? null
    } catch {
      return new Response('Body inválido', { status: 400 })
    }
  } else {
    // Algunos despliegues mandan multipart o vacío; intentamos leer query string
    const url = new URL(req.url)
    token = url.searchParams.get('token')
  }

  if (!token) {
    return new Response('Token faltante', { status: 400 })
  }

  // Consultar estado real del pago a Flow
  let status
  try {
    status = await getFlowPaymentStatus(token)
  } catch (err) {
    console.error('Error consultando Flow getStatus:', err)
    // Devolvemos 500 para que Flow reintente
    return new Response('Error consultando estado', { status: 500 })
  }

  const admin = createAdminClient()

  // Pago no exitoso: marcar attempt como fallido y devolver OK
  if (status.status !== 2) {
    if (status.status === 3 || status.status === 4) {
      await admin.rpc('wallet_mark_flow_attempt_failed', {
        p_commerce_order: status.commerceOrder,
        p_flow_token: token,
        p_flow_status_code: status.status,
        p_raw: status as unknown as Record<string, unknown>,
      })
    }
    // status=1 (pendiente): no hacemos nada, esperamos otro webhook o el cron
    return new Response('OK', { status: 200 })
  }

  // status=2 → pagado. Acreditar.
  // La función SQL valida que el monto cobrado coincida y maneja idempotencia.
  // Flow devuelve amount en pesos enteros; lo convertimos a centavos.
  const amountCents = Math.round(status.amount * 100)

  try {
    const { error } = await admin.rpc('wallet_credit_flow_payment', {
      p_commerce_order: status.commerceOrder,
      p_flow_token: token,
      p_flow_order: status.flowOrder,
      p_amount_cents: amountCents,
      p_payment_method: status.paymentData?.media ?? null,
      p_payer_email: status.payer ?? null,
      p_raw: status as unknown as Record<string, unknown>,
    })

    if (error) {
      const message = error.message ?? ''
      // Idempotencia por índice único: si el flow_token ya fue procesado,
      // el insert falla con duplicate key. Eso es OK.
      if (
        message.includes('duplicate key') ||
        message.includes('idx_wallet_unique_flow_token')
      ) {
        return new Response('OK', { status: 200 })
      }
      console.error('Error acreditando Flow payment:', error)
      return new Response('Error acreditando pago', { status: 500 })
    }
  } catch (err) {
    console.error('Excepción acreditando Flow payment:', err)
    return new Response('Error acreditando pago', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
