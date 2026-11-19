import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getFlowRefundStatus } from '@/lib/flow/refunds'
import { sendRefundCompletedEmail } from '@/lib/email/refund-notifications'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import { recordRefundStatus } from '@/lib/flow/refund-worker'
import { readFlowToken } from '@/lib/flow/settlement'

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

  const token = await readFlowToken(req, MAX_BODY_BYTES)
  if (!token) {
    return new Response('Missing token', { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    const refundStatus = await getFlowRefundStatus(token)

    const { data: attempt, error } = await supabase.from('flow_refund_attempts')
      .select('id, user_id, receiver_email, amount_pesos, tournament_id').eq('flow_refund_token', token).single()
    if (error || !attempt) throw new Error(error?.message ?? 'Token sin correlación local; requiere conciliación')
    const changed = await recordRefundStatus(attempt.id, token, refundStatus)
    // Enviar email de confirmación cuando el reembolso se acredita.
    // Corre después de responder para no demorar el 200 a Flow.
    if (refundStatus.status === 'completed' && changed && attempt) {
      const { user_id, receiver_email, amount_pesos, tournament_id } = attempt as {
        user_id: string
        receiver_email: string
        amount_pesos: number
        tournament_id: string | null
      }

      after(async () => {
        try {
          const [{ data: authUser }, { data: tournament }] = await Promise.all([
            supabase.auth.admin.getUserById(user_id),
            tournament_id ? supabase.from('tournaments').select('name').eq('id', tournament_id).single() : Promise.resolve({ data: null }),
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
    return new Response('No se pudo confirmar el reembolso', { status: 503 })
  }
}
