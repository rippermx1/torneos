import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRegistrationWindow } from '@/lib/tournament/helpers'
import { getBalance } from '@/lib/wallet/transactions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  const { id: tournamentId } = await params
  const supabase = createAdminClient()

  const [{ data: profile }, { data: tournament }] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_banned, kyc_status, birth_date, terms_accepted_at')
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

  // Términos y condiciones deben estar aceptados para cualquier torneo
  if (!profile?.terms_accepted_at) {
    return Response.json(
      { error: 'Debes aceptar los Términos y Condiciones antes de participar en torneos.', termsRequired: true },
      { status: 403 }
    )
  }

  // Obtener torneo primero para saber si es de pago (KYC solo requerido en torneos de pago)
  // — se obtiene más abajo; aquí pre-chequeamos edad si hay birth_date
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

  const playability = checkRegistrationWindow(tournament)
  if (!playability.ok) {
    return Response.json({ error: playability.reason }, { status: 400 })
  }

  // Para torneos de pago, exigir KYC aprobado y birth_date declarada
  if (tournament.entry_fee_cents > 0) {
    if (!profile?.birth_date) {
      return Response.json({ error: 'Debes completar tu perfil (fecha de nacimiento) para participar en torneos de pago.' }, { status: 403 })
    }
    if (profile?.kyc_status !== 'approved') {
      return Response.json({ error: 'Debes completar la verificación de identidad (KYC) para participar en torneos de pago.', kycRequired: true }, { status: 403 })
    }
  }

  // Si hay cuota de inscripción, verificar saldo suficiente antes de intentar el débito
  if (tournament.entry_fee_cents > 0) {
    const balance = await getBalance(userId)
    if (balance < tournament.entry_fee_cents) {
      return Response.json(
        {
          error: 'Saldo insuficiente. Recarga tu billetera antes de inscribirte.',
          insufficientFunds: true,
          balanceCents: balance,
          requiredCents: tournament.entry_fee_cents,
        },
        { status: 402 }
      )
    }
  }

  // Inscripción atómica: débito de cuota + inserción de registro en una sola transacción Postgres.
  // La función register_for_tournament revierte el débito si la inserción falla.
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
    if (rpcError.message.includes('Saldo insuficiente')) {
      return Response.json({ error: 'Saldo insuficiente', insufficientFunds: true }, { status: 402 })
    }
    return Response.json({ error: `Error al inscribirse: ${rpcError.message}` }, { status: 500 })
  }

  return Response.json({ ok: true })
}
