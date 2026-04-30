import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/auth'
import { formatDateTimeLocalInput, parseDateTimeLocalToIso } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { TournamentType } from '@/types/database'
import { calculateTournamentFinancials } from '@/lib/tournament/finance'
import { TournamentPresetForm } from '@/components/admin/tournament-preset-form'

async function createTournament(formData: FormData) {
  'use server'

  const userId = await requireAdmin()

  const name             = formData.get('name') as string
  const description      = (formData.get('description') as string) || null
  const rawTournamentType = formData.get('tournament_type')
  const tournamentType: TournamentType =
    rawTournamentType === 'express' ||
    rawTournamentType === 'elite' ||
    rawTournamentType === 'freeroll'
      ? rawTournamentType
      : 'standard'
  const entryFee         = Math.round(parseFloat(formData.get('entry_fee') as string) * 100)
  const prize1           = Math.round(parseFloat(formData.get('prize_1st') as string) * 100)
  const prize2           = Math.round(parseFloat((formData.get('prize_2nd') as string) || '0') * 100)
  const prize3           = Math.round(parseFloat((formData.get('prize_3rd') as string) || '0') * 100)
  const minPlayers       = parseInt(formData.get('min_players') as string)
  const targetPlayers    = parseInt((formData.get('target_players') as string) || String(minPlayers))
  const maxPlayers       = parseInt(formData.get('max_players') as string)
  const registrationOpens = parseDateTimeLocalToIso(formData.get('registration_opens_at') as string)
  const playStart        = parseDateTimeLocalToIso(formData.get('play_window_start') as string)
  const playEnd          = parseDateTimeLocalToIso(formData.get('play_window_end') as string)
  const maxDuration      = parseInt(formData.get('max_game_duration_minutes') as string) * 60

  if (!name || prize1 <= 0 || minPlayers < 2 || maxPlayers < minPlayers) {
    throw new Error('Datos del torneo inválidos')
  }

  // Orden de premios: 1° >= 2° >= 3°
  if (prize2 > prize1 || prize3 > prize2) {
    throw new Error('Los premios deben estar en orden descendente: 1° ≥ 2° ≥ 3°')
  }

  const financials = calculateTournamentFinancials({
    entryFeeCents: entryFee,
    prize1Cents: prize1,
    prize2Cents: prize2,
    prize3Cents: prize3,
    minPlayers,
    targetPlayers,
  })

  if (entryFee > 0 && !financials.isBreakEven) {
    throw new Error(
      `Configuración no rentable: con ${minPlayers} jugadores mínimos la recaudación ` +
      `($${(financials.minRevenueCents / 100).toLocaleString('es-CL')} CLP) no cubre premios, IVA y costo Flow ` +
      `($${(financials.requiredRevenueCents / 100).toLocaleString('es-CL')} CLP requeridos). ` +
      `Ajusta el mínimo a ${financials.requiredMinPlayers} jugadores o reduce los premios.`
    )
  }

  // Freerolls: máximo 1 por semana activo (scheduled/open/live)
  if (tournamentType === 'freeroll') {
    const supabaseCheck = createAdminClient()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabaseCheck
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_type', 'freeroll')
      .in('status', ['scheduled', 'open', 'live'])
      .gte('created_at', oneWeekAgo)
    if ((count ?? 0) >= 1) {
      throw new Error('Ya existe un freeroll activo en los últimos 7 días. Solo se permite uno por semana.')
    }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      description,
      game_type: '2048_score',
      tournament_type: tournamentType,
      entry_fee_cents: entryFee,
      prize_1st_cents: prize1,
      prize_2nd_cents: prize2,
      prize_3rd_cents: prize3,
      min_players: minPlayers,
      max_players: maxPlayers,
      registration_opens_at: registrationOpens,
      play_window_start: playStart,
      play_window_end: playEnd,
      max_game_duration_seconds: maxDuration,
      status: 'scheduled',
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Error creando torneo: ${error.message}`)
  redirect(`/tournaments/${data.id}`)
}

export default function NewTournamentPage() {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  const start = new Date(now)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 24)

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/tournaments" className="text-sm text-muted-foreground hover:text-foreground">← Torneos</Link>
        <h1 className="text-2xl font-bold">Crear torneo</h1>
      </div>
      <TournamentPresetForm
        action={createTournament}
        registrationOpensAt={formatDateTimeLocalInput(start)}
        playWindowStart={formatDateTimeLocalInput(start)}
        playWindowEnd={formatDateTimeLocalInput(end)}
      />
    </div>
  )
}
