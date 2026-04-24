import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRegistrationWindow } from '@/lib/tournament/helpers'
import { getBalance } from '@/lib/wallet/transactions'
import type { Tournament } from '@/types/database'

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

  // Obtener torneo
  const { data: tData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tData) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })

  const tournament = tData as Tournament

  const playability = checkRegistrationWindow(tournament)
  if (!playability.ok) {
    return Response.json({ error: playability.reason }, { status: 400 })
  }

  // Verificar cupo
  const { count } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)

  if (count !== null && count >= tournament.max_players) {
    return Response.json({ error: 'El torneo está lleno' }, { status: 400 })
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
  const adminSupabase = createAdminClient()
  const { error: rpcError } = await adminSupabase.rpc('register_for_tournament', {
    p_user_id: userId,
    p_tournament_id: tournamentId,
    p_entry_fee_cents: tournament.entry_fee_cents,
  })

  if (rpcError) {
    if (rpcError.message.includes('unique') || rpcError.code === '23505') {
      return Response.json({ error: 'Ya estás inscrito en este torneo' }, { status: 409 })
    }
    if (rpcError.message.includes('Saldo insuficiente')) {
      return Response.json({ error: 'Saldo insuficiente', insufficientFunds: true }, { status: 402 })
    }
    return Response.json({ error: `Error al inscribirse: ${rpcError.message}` }, { status: 500 })
  }

  return Response.json({ ok: true })
}
