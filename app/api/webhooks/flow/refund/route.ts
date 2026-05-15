import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getFlowRefundStatus } from '@/lib/flow/refunds'
import { sendRefundCompletedEmail } from '@/lib/email/refund-notifications'
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
      return new Response('OK', { status: 200 })
    }

    const { data: attempt } = await supabase
      .from('flow_refund_attempts')
      .update({ status, settled_at: new Date().toISOString() })
      .eq('flow_refund_token', token)
      .select('user_id, receiver_email, amount_pesos, tournament_id')
      .single()

    // Enviar email de confirmación cuando el reembolso se acredita.
    // Corre después de responder para no demorar el 200 a Flow.
    if (status === 'completed' && attempt) {
      const { user_id, receiver_email, amount_pesos, tournament_id } = attempt as {
        user_id: string
        receiver_email: string
        amount_pesos: number
        tournament_id: string
      }

      after(async () => {
        try {
          const [{ data: authUser }, { data: tournament }] = await Promise.all([
            supabase.auth.admin.getUserById(user_id),
            supabase.from('tournaments').select('name').eq('id', tournament_id).single(),
          ])
          const username = authUser?.user?.user_metadata?.username ?? receiver_email
          await sendRefundCompletedEmail({
            to: receiver_email,
            username,
            tournamentName: tournament?.name ?? 'torneo',
            amountPesos: amount_pesos,
          })
        } catch (e) {
          console.error('[webhook/flow/refund] Error enviando email completado:', e)
        }
      })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[webhook/flow/refund] Error procesando token:', token, message)
    return new Response('OK', { status: 200 })
  }
}
