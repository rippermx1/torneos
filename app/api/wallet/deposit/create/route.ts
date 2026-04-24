import { createClient } from '@/lib/supabase/server'
import { getAppUrl } from '@/lib/env'
import { getMpPreference } from '@/lib/mercadopago/client'

const MIN_DEPOSIT_CENTS = 100000   // $1.000 CLP mínimo
const MAX_DEPOSIT_CENTS = 50000000 // $500.000 CLP máximo

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
    amountCents < MIN_DEPOSIT_CENTS ||
    amountCents > MAX_DEPOSIT_CENTS
  ) {
    return Response.json(
      { error: `Monto inválido. Mínimo $1.000 CLP, máximo $500.000 CLP.` },
      { status: 400 }
    )
  }

  const email = user.email ?? ''
  const requestOrigin = new URL(req.url).origin
  const appUrl = getAppUrl(requestOrigin) ?? requestOrigin

  // Mercado Pago trabaja en pesos CLP enteros (no centavos)
  const amountPesos = amountCents / 100

  try {
    const preference = getMpPreference()
    const result = await preference.create({
      body: {
        items: [
          {
            id: 'wallet-deposit',
            title: 'Recarga de billetera — Torneos 2048',
            quantity: 1,
            unit_price: amountPesos,
            currency_id: 'CLP',
          },
        ],
        payer: { email },
        back_urls: {
          success: `${appUrl}/wallet?deposit=success`,
          failure: `${appUrl}/wallet?deposit=failure`,
          pending: `${appUrl}/wallet?deposit=pending`,
        },
        auto_return: 'approved',
        notification_url: `${appUrl}/api/webhooks/mercadopago`,
        // Guardamos user_id y monto para verificarlo en el webhook
        metadata: {
          user_id: userId,
          amount_cents: amountCents,
        },
        statement_descriptor: 'TORNEOS2048',
      },
    })

    return Response.json({ initPoint: result.init_point })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('Error creando preferencia MP:', message)
    return Response.json({ error: `Error al iniciar pago: ${message}` }, { status: 500 })
  }
}
