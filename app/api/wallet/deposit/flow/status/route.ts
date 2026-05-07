import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'

// ───────────────────────────────────────────────────────────────
// GET /api/wallet/deposit/flow/status?commerceOrder=...
//
// Endpoint de polling para que la página de retorno del pago
// pueda esperar la acreditación una vez Flow procese el webhook.
// El estado autoritativo es flow_payment_attempts.status.
// ───────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const commerceOrder = url.searchParams.get('commerceOrder')
  if (!commerceOrder) {
    return Response.json({ error: 'commerceOrder requerido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('flow_payment_attempts')
    .select('status, net_amount_cents, charged_amount_cents, user_fee_cents, settled_at, user_id')
    .eq('commerce_order', commerceOrder)
    .single()

  if (error || !data) {
    return Response.json({ error: 'Intento no encontrado' }, { status: 404 })
  }

  // No filtrar admin client por user_id, así que validamos manualmente
  if (data.user_id !== auth.access.userId) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  return Response.json({
    status: data.status,
    netCents: Number(data.net_amount_cents),
    chargedCents: Number(data.charged_amount_cents),
    userFeeCents: Number(data.user_fee_cents),
    settledAt: data.settled_at,
  })
}
