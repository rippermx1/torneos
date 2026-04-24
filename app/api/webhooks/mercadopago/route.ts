import { getMpPayment } from '@/lib/mercadopago/client'
import { getMercadoPagoWebhookSecret } from '@/lib/env'
import { insertTransaction, isMpPaymentAlreadyProcessed } from '@/lib/wallet/transactions'
import { createHmac } from 'crypto'

// Mercado Pago envía notificaciones de pago a este endpoint.
// Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
//
// MP puede entregar la misma notificación más de una vez → manejamos idempotencia
// verificando si el mp_payment_id ya fue procesado en wallet_transactions.

export async function POST(req: Request): Promise<Response> {
  // Verificar firma de MP para evitar notificaciones falsas
  const secret = getMercadoPagoWebhookSecret()
  if (!secret) {
    console.error('MERCADOPAGO_WEBHOOK_SECRET no configurado')
    return new Response('Webhook no configurado', { status: 500 })
  }

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')
  const url = new URL(req.url)
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id')

  if (!xSignature || !xRequestId) {
    return new Response('Headers de firma faltantes', { status: 401 })
  }

  const valid = verifyMpSignature({ xSignature, xRequestId, dataId, secret })
  if (!valid) {
    return new Response('Firma inválida', { status: 401 })
  }

  let body: MpWebhookBody
  try {
    body = await req.json()
  } catch {
    return new Response('Body inválido', { status: 400 })
  }

  // Solo procesar notificaciones de tipo "payment"
  if (body.type !== 'payment' || !body.data?.id) {
    return new Response('OK', { status: 200 })
  }

  const mpPaymentId = String(body.data.id)

  // Idempotencia: si ya procesamos este pago, ignorar
  const alreadyProcessed = await isMpPaymentAlreadyProcessed(mpPaymentId)
  if (alreadyProcessed) {
    return new Response('OK', { status: 200 })
  }

  // Obtener detalles del pago desde la API de MP
  let paymentData: MpPaymentData
  try {
    const mpPayment = getMpPayment()
    paymentData = (await mpPayment.get({ id: Number(mpPaymentId) })) as MpPaymentData
  } catch (err) {
    console.error('Error obteniendo pago de MP:', err)
    return new Response('Error consultando pago', { status: 500 })
  }

  // Solo acreditar pagos aprobados
  if (paymentData.status !== 'approved') {
    return new Response('OK', { status: 200 })
  }

  const userId = paymentData.metadata?.user_id
  const amountCents = paymentData.metadata?.amount_cents

  if (!userId || typeof amountCents !== 'number' || amountCents <= 0) {
    console.error('Pago MP sin metadata válida:', { userId, amountCents, mpPaymentId })
    return new Response('Metadata de pago inválida', { status: 400 })
  }

  // Acreditar wallet
  try {
    await insertTransaction({
      userId,
      type: 'deposit',
      amountCents,
      referenceType: 'payment',
      metadata: {
        mp_payment_id: mpPaymentId,
        mp_status: paymentData.status,
        mp_payment_method: paymentData.payment_method_id,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('duplicate key') ||
      message.includes('idx_wallet_unique_mp_payment')
    ) {
      return new Response('OK', { status: 200 })
    }
    console.error('Error acreditando wallet:', err)
    return new Response('Error acreditando pago', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}

// Verificación de firma HMAC de Mercado Pago
// Formato x-signature: "ts=TIMESTAMP,v1=HASH"
function verifyMpSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
}: {
  xSignature: string
  xRequestId: string
  dataId: string | null
  secret: string
}): boolean {
  try {
    const parts = Object.fromEntries(xSignature.split(',').map((p) => p.split('=')))
    const ts = parts['ts']
    const v1 = parts['v1']
    if (!ts || !v1) return false

    const manifest = `id:${dataId ?? ''};request-id:${xRequestId};ts:${ts};`
    const expected = createHmac('sha256', secret).update(manifest).digest('hex')
    return expected === v1
  } catch {
    return false
  }
}

interface MpWebhookBody {
  type: string
  data?: { id: string | number }
  action?: string
}

interface MpPaymentData {
  id: number
  status: string
  payment_method_id?: string
  metadata?: {
    user_id?: string
    amount_cents?: number
  }
}
