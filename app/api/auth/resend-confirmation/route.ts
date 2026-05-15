import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'

// Reenvía el email de confirmación al usuario autenticado.
// Supabase impone max_frequency=1m por su cuenta; aquí añadimos una
// capa extra para evitar abusos desde el cliente.

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await checkRateLimit({
    key: `resend-confirm:${getRequestIp(req)}`,
    limit: 3,
    windowMs: 5 * 60_000, // 3 reenvíos cada 5 minutos por IP
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  if (user.email_confirmed_at) {
    return Response.json({ error: 'El email ya está verificado' }, { status: 400 })
  }

  if (!user.email) {
    return Response.json({ error: 'No hay email asociado a esta cuenta' }, { status: 400 })
  }

  const origin = new URL(req.url).origin
  const redirectTo = `${origin}/auth/confirm?next=/onboarding`

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: user.email,
    options: { emailRedirectTo: redirectTo },
  })

  if (error) {
    // Supabase devuelve error si se reenvió hace menos de 1 minuto
    const isRateLimit = error.message.toLowerCase().includes('rate') ||
                        error.message.toLowerCase().includes('frequency')
    return Response.json(
      { error: isRateLimit ? 'Espera un momento antes de reenviar.' : error.message },
      { status: isRateLimit ? 429 : 500 },
    )
  }

  return Response.json({ ok: true })
}
