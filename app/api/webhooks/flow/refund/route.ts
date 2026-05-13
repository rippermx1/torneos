import { createAdminClient } from '@/lib/supabase/server'
import { getFlowRefundStatus } from '@/lib/flow/refunds'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import type { FlowRefundStatus } from '@/types/database'

// ───────────────────────────────────────────────────────────────
// Webhook de Flow para confirmación de reembolsos.
//
// Flow llama a urlCallBack vía POST con parámetro `token`.
// Consultamos /refund/getStatus para obtener el estado real
// (evita falsificaciones) y actualizamos flow_refund_attempts.
//
// Estados Flow: "pending" | "completed" | "rejected" | "cancelled"
// ───────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 4096

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await checkRateLimit({
    key: `webhook:flow:refund:${getRequestIp(req)}`,
    limit: 60,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  // Leer body con cap de tamaño
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 })
  }

  let token: string | null = null
  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    token = params.get('token')
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (!token) {
    return new Response('Missing token', { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    const refundStatus = await getFlowRefundStatus(token)

    const status: FlowRefundStatus | null = refundStatus.status === 'completed'
      ? 'completed'
      : refundStatus.status === 'cancelled'
      ? 'cancelled'
      : refundStatus.status === 'rejected'
      ? 'rejected'
      : null

    if (!status) {
      // Estado desconocido o pendiente — Flow reintentará
      return new Response('OK', { status: 200 })
    }

    await supabase
      .from('flow_refund_attempts')
      .update({
        status,
        settled_at: new Date().toISOString(),
      })
      .eq('flow_refund_token', token)

    return new Response('OK', { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[webhook/flow/refund] Error procesando token:', token, message)
    // Devolver 200 igual para que Flow no reintente infinitamente
    return new Response('OK', { status: 200 })
  }
}
