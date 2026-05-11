import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { getAppUrl } from '@/lib/env'
import { createFlowPayment, buildFlowCheckoutUrl } from '@/lib/flow/payments'
import { computeDepositBreakdown } from '@/lib/flow/fees'
import { checkRegistrationWindow } from '@/lib/tournament/helpers'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'

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

  const [{ data: profile }, { data: tournament }] = await Promise.all([
    admin
      .from('profiles')
      .select('is_banned, kyc_status, birth_date, terms_accepted_at')
      .eq('id', userId)
      .single(),
    admin
      .from('tournaments')
      .select('id, entry_fee_cents, max_players, registration_opens_at, play_window_start, play_window_end, status')
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

  const birthDate = new Date(profile.birth_date)
  const now = new Date()
  let age = now.getFullYear() - birthDate.getFullYear()
  const monthDiff = now.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--
  if (age < 18) {
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

  // Calculo del cobro: entry_fee neto + fee Flow al usuario
  const breakdown = computeDepositBreakdown(tournament.entry_fee_cents)
  const requestOrigin = new URL(req.url).origin
  const appUrl = getAppUrl(requestOrigin) ?? requestOrigin
  const commerceOrder = `tour-${randomUUID()}`

  const { data: attempt, error: attemptError } = await admin
    .from('flow_payment_attempts')
    .insert({
      user_id: userId,
      commerce_order: commerceOrder,
      net_amount_cents: breakdown.netCents,
      charged_amount_cents: breakdown.chargedCents,
      user_fee_cents: breakdown.userFeeCents,
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
      amount: breakdown.chargedPesos,
      email: user.email ?? '',
      urlConfirmation: `${appUrl}/api/webhooks/flow`,
      urlReturn: `${appUrl}/tournaments/${tournamentId}/return`,
      optional: {
        user_id: userId,
        tournament_id: tournamentId,
        entry_fee_cents: String(breakdown.netCents),
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
      breakdown: {
        entryFeeCents: breakdown.netCents,
        chargedCents: breakdown.chargedCents,
        userFeeCents: breakdown.userFeeCents,
      },
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
