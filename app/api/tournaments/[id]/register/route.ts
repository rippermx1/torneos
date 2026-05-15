import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkRegistrationWindow } from '@/lib/tournament/helpers'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import { sendTournamentRegistrationEmail } from '@/lib/email/tournament-notifications'

// ───────────────────────────────────────────────────────────────
// Inscripcion directa: SOLO para torneos gratuitos (entry_fee=0).
// Para torneos pagados, el frontend debe usar
// /api/tournaments/[id]/checkout/flow/create y completar el cobro
// vía Flow. El webhook completa la inscripción atómicamente.
// ───────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `tournament:register:${userId}:${getRequestIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  const { id: tournamentId } = await params
  const supabase = createAdminClient()

  const [{ data: profile }, { data: tournament }] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_banned, birth_date, terms_accepted_at')
      .eq('id', userId)
      .single(),
    supabase
      .from('tournaments')
      .select('id, entry_fee_cents, max_players, registration_opens_at, play_window_start, play_window_end, status')
      .eq('id', tournamentId)
      .single(),
  ])

  if (profile?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  if (!profile?.terms_accepted_at) {
    return Response.json(
      { error: 'Debes aceptar los Términos y Condiciones antes de participar en torneos.', termsRequired: true },
      { status: 403 }
    )
  }

  if (profile?.birth_date) {
    const birthDate = new Date(profile.birth_date)
    const now = new Date()
    let age = now.getFullYear() - birthDate.getFullYear()
    const monthDiff = now.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--
    if (age < 18) {
      return Response.json({ error: 'Debes ser mayor de 18 años para participar.' }, { status: 403 })
    }
  }

  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })

  if (tournament.entry_fee_cents > 0) {
    return Response.json(
      {
        error: 'Este torneo requiere pago. Completa el checkout de inscripción.',
        paymentRequired: true,
        checkoutPath: `/api/tournaments/${tournamentId}/checkout/flow/create`,
      },
      { status: 402 }
    )
  }

  const playability = checkRegistrationWindow(tournament)
  if (!playability.ok) {
    return Response.json({ error: playability.reason }, { status: 400 })
  }

  const { error: rpcError } = await supabase.rpc('register_for_tournament', {
    p_user_id: userId,
    p_tournament_id: tournamentId,
    p_entry_fee_cents: tournament.entry_fee_cents,
  })

  if (rpcError) {
    if (rpcError.message.includes('unique') || rpcError.code === '23505') {
      return Response.json({ error: 'Ya estás inscrito en este torneo' }, { status: 409 })
    }
    if (rpcError.message.includes('Torneo lleno')) {
      return Response.json({ error: 'El torneo está lleno' }, { status: 400 })
    }
    if (rpcError.message.includes('Inscripciones cerradas')) {
      return Response.json({ error: 'Inscripciones cerradas' }, { status: 400 })
    }
    return Response.json({ error: `Error al inscribirse: ${rpcError.message}` }, { status: 500 })
  }

  after(async () => {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(auth.access.userId)
      const email = authUser?.user?.email
      const username = authUser?.user?.user_metadata?.username ?? email
      if (email) {
        await sendTournamentRegistrationEmail({
          to: email,
          username,
          tournamentName: tournament.name,
          playWindowStart: tournament.play_window_start,
          playWindowEnd: tournament.play_window_end,
          entryFeeCents: tournament.entry_fee_cents,
        })
      }
    } catch (e) {
      console.error('[register] Error enviando email de inscripción:', e)
    }
  })

  return Response.json({ ok: true })
}
