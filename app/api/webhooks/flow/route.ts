import { readFlowToken, settleFlowPayment } from '@/lib/flow/settlement'

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
// - Solo si status=2 liquidamos el intento segun su intent.
// - tournament_registration crea la inscripcion de forma idempotente.
// ───────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const token = await readFlowToken(req)
  if (!token) {
    return new Response('Token faltante', { status: 400 })
  }

  try {
    await settleFlowPayment(token)
    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Error procesando webhook Flow:', err)
    return new Response('Error acreditando pago', { status: 500 })
  }
}
