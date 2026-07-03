import { randomUUID } from 'crypto'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { getAppUrl } from '@/lib/env'
import { createFlowPayment, buildFlowCheckoutUrl } from '@/lib/flow/payments'
import { checkRegistrationWindow } from '@/lib/tournament/helpers'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import { isAdult } from '@/lib/identity/verification'
import { canRegisterForTier, DEFAULT_SKILL_TIER, SKILL_TIER_LABELS } from '@/lib/tournament/rating'
import { sendTournamentRegistrationEmail } from '@/lib/email/tournament-notifications'
import type { SkillTier } from '@/types/database'

// ───────────────────────────────────────────────────────────────
// Checkout Flow para inscripcion a torneo (Ruta 1).
//
// Cada inscripcion paga es un cobro Flow individual. El voucher
// Flow refleja el monto total pagado; la boleta electronica para
// el SII se emite por separado solo por el platform_fee_gross via
// LibreDTE (despues del webhook).
//
// Flujo:
//  1. Validar pre-condiciones (KYC, edad, T&C, ventana, capacidad)
//  2. Crear flow_payment_attempt (intent=tournament_registration)
//  3. Llamar Flow API → URL de pago
//  4. Frontend redirige al usuario a Flow
//  5. Flow webhook → settle_tournament_registration
// ───────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const { user } = auth.access
  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `checkout:flow:${userId}:${getRequestIp(req)}`,
    limit: 5,
    windowMs: 10 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  const { id: tournamentId } = await params
  const admin = createAdminClient()

  // Flag opcional: inscribirse usando crédito de rakeback (sin pasar por Flow).
  let useCredit = false
  try {
    const body = await req.json()
    useCredit = body?.useCredit === true
  } catch {
    // Sin body → flujo Flow normal.
  }

  const [{ data: profile }, { data: tournament }] = await Promise.all([
    admin
      .from('profiles')
      .select('is_banned, kyc_status, birth_date, terms_accepted_at')
      .eq('id', userId)
      .single(),
    admin
      .from('tournaments')
      .select('id, entry_fee_cents, max_players, registration_opens_at, play_window_start, play_window_end, status, skill_tier')
      .eq('id', tournamentId)
      .single(),
  ])

  if (!tournament) {
    return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })
  }

  if (profile?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  if (!profile?.terms_accepted_at) {
    return Response.json(
      { error: 'Debes aceptar los Términos y Condiciones antes de participar en torneos.', termsRequired: true },
      { status: 403 }
    )
  }

  if (!profile?.birth_date) {
    return Response.json(
      { error: 'Debes completar tu perfil (fecha de nacimiento) para participar en torneos de pago.' },
      { status: 403 }
    )
  }

  if (!isAdult(profile.birth_date)) {
    return Response.json({ error: 'Debes ser mayor de 18 años para participar.' }, { status: 403 })
  }

  if (tournament.entry_fee_cents <= 0) {
    return Response.json(
      { error: 'Este torneo es gratuito. Usa el endpoint de inscripción directa.' },
      { status: 400 }
    )
  }

  if (profile.kyc_status !== 'approved') {
    return Response.json(
      { error: 'Debes completar la verificación de identidad (KYC) para participar en torneos de pago.', kycRequired: true },
      { status: 403 }
    )
  }

  const playability = checkRegistrationWindow(tournament)
  if (!playability.ok) {
    return Response.json({ error: playability.reason }, { status: 400 })
  }

  // División por habilidad: si el torneo la restringe, solo esa división entra.
  if (tournament.skill_tier) {
    const { data: ratingRow } = await admin
      .from('player_ratings')
      .select('tier')
      .eq('profile_id', userId)
      .maybeSingle()
    const playerTier = (ratingRow?.tier ?? DEFAULT_SKILL_TIER) as SkillTier
    if (!canRegisterForTier(playerTier, tournament.skill_tier as SkillTier)) {
      return Response.json(
        {
          error: `Este torneo es solo para la división ${SKILL_TIER_LABELS[tournament.skill_tier as SkillTier]}. Tu división actual es ${SKILL_TIER_LABELS[playerTier]}.`,
          tierMismatch: true,
        },
        { status: 403 }
      )
    }
  }

  // Pre-flight: ya inscrito?
  const { count: existingCount } = await admin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)

  if ((existingCount ?? 0) > 0) {
    return Response.json({ error: 'Ya estás inscrito en este torneo' }, { status: 409 })
  }

  // Evita doble cobro: una inscripcion pagada solo puede tener un intento
  // activo. Los pendientes antiguos se expiran para permitir reintento.
  const nowIso = new Date().toISOString()
  const staleAttemptCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  await admin
    .from('flow_payment_attempts')
    .update({ status: 'expired', settled_at: nowIso })
    .eq('user_id', userId)
    .eq('tournament_id', tournamentId)
    .eq('intent', 'tournament_registration')
    .eq('status', 'pending')
    .lt('created_at', staleAttemptCutoff)

  const { data: activeAttempt, error: activeAttemptError } = await admin
    .from('flow_payment_attempts')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('tournament_id', tournamentId)
    .eq('intent', 'tournament_registration')
    .in('status', ['pending', 'paid'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeAttemptError) {
    console.error('Error revisando flow_payment_attempt activo:', activeAttemptError)
    return Response.json({ error: 'No se pudo validar el estado del pago' }, { status: 500 })
  }

  if (activeAttempt?.status === 'paid') {
    return Response.json(
      { error: 'Ya existe un pago confirmado para este torneo.' },
      { status: 409 }
    )
  }

  if (activeAttempt?.status === 'pending') {
    return Response.json(
      { error: 'Ya tienes un pago pendiente para este torneo. Espera la confirmación o reintenta más tarde.', pendingPayment: true },
      { status: 409 }
    )
  }

  // Pre-flight: capacidad (no autoritativo; settle revalida)
  const { count: registeredCount } = await admin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)

  if ((registeredCount ?? 0) >= tournament.max_players) {
    return Response.json({ error: 'El torneo está lleno' }, { status: 400 })
  }

  const entryFeeCents = tournament.entry_fee_cents

  // Inscripción con crédito de rakeback (todo-o-nada): si el usuario lo pide y su
  // crédito cubre la cuota completa, se inscribe sin pasar por Flow.
  if (useCredit) {
    const { data: creditBalance } = await admin.rpc('wallet_credit_balance', { p_user_id: userId })
    if (Number(creditBalance ?? 0) < entryFeeCents) {
      return Response.json(
        { error: 'No tienes crédito suficiente para cubrir la inscripción completa.', insufficientCredit: true },
        { status: 400 }
      )
    }

    const { data: registrationId, error: creditError } = await admin.rpc('register_with_credit', {
      p_user_id: userId,
      p_tournament_id: tournamentId,
      p_entry_fee_cents: entryFeeCents,
    })

    if (creditError) {
      const msg = creditError.message
      if (msg.includes('Torneo lleno')) return Response.json({ error: 'El torneo está lleno' }, { status: 400 })
      if (msg.includes('Inscripciones cerradas')) return Response.json({ error: 'Inscripciones cerradas' }, { status: 400 })
      if (msg.includes('Crédito insuficiente')) {
        return Response.json({ error: 'No tienes crédito suficiente para cubrir la inscripción completa.', insufficientCredit: true }, { status: 400 })
      }
      if (creditError.code === '23505' || msg.includes('unique')) {
        return Response.json({ error: 'Ya estás inscrito en este torneo' }, { status: 409 })
      }
      console.error('Error inscribiendo con crédito:', msg)
      return Response.json({ error: 'No se pudo inscribir con crédito' }, { status: 500 })
    }

    after(async () => {
      try {
        const { data: t } = await admin
          .from('tournaments')
          .select('name, play_window_start, play_window_end, entry_fee_cents')
          .eq('id', tournamentId)
          .single()
        if (user.email && t) {
          await sendTournamentRegistrationEmail({
            to: user.email,
            username: user.user_metadata?.username ?? user.email,
            tournamentName: t.name,
            playWindowStart: t.play_window_start,
            playWindowEnd: t.play_window_end,
            entryFeeCents: t.entry_fee_cents,
          })
        }
      } catch (e) {
        console.error('[checkout] Error email inscripción con crédito:', e)
      }
    })

    return Response.json({ registered: true, viaCredit: true, registrationId })
  }

  // El usuario paga exactamente el entry_fee. La plataforma absorbe el costo
  // de Flow y su IVA desde el margen operacional del 30%.
  const entryFeePesos = Math.ceil(entryFeeCents / 100)
  const requestOrigin = new URL(req.url).origin
  const appUrl = getAppUrl(requestOrigin) ?? requestOrigin
  const commerceOrder = `tour-${randomUUID()}`

  const { data: attempt, error: attemptError } = await admin
    .from('flow_payment_attempts')
    .insert({
      user_id: userId,
      commerce_order: commerceOrder,
      net_amount_cents: entryFeeCents,
      charged_amount_cents: entryFeeCents,
      user_fee_cents: 0,
      status: 'pending',
      intent: 'tournament_registration',
      tournament_id: tournamentId,
    })
    .select('id')
    .single()

  if (attemptError || !attempt) {
    if (attemptError?.code === '23505') {
      return Response.json(
        { error: 'Ya tienes un pago pendiente para este torneo. Espera la confirmación o reintenta más tarde.', pendingPayment: true },
        { status: 409 }
      )
    }
    console.error('Error creando flow_payment_attempt (torneo):', attemptError)
    return Response.json({ error: 'No se pudo iniciar el pago' }, { status: 500 })
  }

  try {
    const flowResponse = await createFlowPayment({
      commerceOrder,
      subject: `Inscripción torneo - TorneosPlay`,
      amount: entryFeePesos,
      email: user.email ?? '',
      urlConfirmation: `${appUrl}/api/webhooks/flow`,
      urlReturn: `${appUrl}/tournaments/${tournamentId}/return`,
      optional: {
        user_id: userId,
        tournament_id: tournamentId,
        entry_fee_cents: String(entryFeeCents),
      },
      timeout: 1800,
    })

    await admin
      .from('flow_payment_attempts')
      .update({
        flow_token: flowResponse.token,
        flow_order: flowResponse.flowOrder,
      })
      .eq('id', attempt.id)

    return Response.json({
      redirectUrl: buildFlowCheckoutUrl(flowResponse),
    })
  } catch (err) {
    await admin
      .from('flow_payment_attempts')
      .update({ status: 'rejected', settled_at: new Date().toISOString() })
      .eq('id', attempt.id)

    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('Error creando pago Flow (torneo):', message)
    return Response.json({ error: `Error al iniciar pago: ${message}` }, { status: 500 })
  }
}
