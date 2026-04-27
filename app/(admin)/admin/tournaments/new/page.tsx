import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { TournamentType } from '@/types/database'

// ── Plantillas por modalidad ──────────────────────────────────
// Estas se aplican como defaults en el cliente via data-attributes
const MODALIDAD_DEFAULTS = {
  standard: {
    label: 'Estándar',
    description: 'Pool competitivo semanal. Premio al top 3.',
    entry_fee: 3000,
    prize_1st: 15000,
    prize_2nd: 8000,
    prize_3rd: 4000,
    min_players: 8,
    max_players: 100,
    duration_minutes: 10,
    window_hours: 24,
    badge: '🏆',
    info: 'El formato más popular. Duración de 24 h para que todos puedan jugar.',
  },
  express: {
    label: 'Express',
    description: 'Torneo flash de 2 horas. Alta velocidad.',
    entry_fee: 1000,
    prize_1st: 8000,
    prize_2nd: 3000,
    prize_3rd: 0,
    min_players: 4,
    max_players: 50,
    duration_minutes: 8,
    window_hours: 2,
    badge: '⚡',
    info: 'Ventana de solo 2 horas. Menor cuota, acción rápida.',
  },
  elite: {
    label: 'Élite',
    description: 'Alta cuota, pocos cupos, gran premio.',
    entry_fee: 10000,
    prize_1st: 60000,
    prize_2nd: 25000,
    prize_3rd: 10000,
    min_players: 4,
    max_players: 20,
    duration_minutes: 15,
    window_hours: 48,
    badge: '💎',
    info: 'Cupos limitados a 20 jugadores. Premio máximo.',
  },
  freeroll: {
    label: 'Freeroll',
    description: 'Gratis. Ideal para nuevos jugadores.',
    entry_fee: 0,
    prize_1st: 5000,
    prize_2nd: 0,
    prize_3rd: 0,
    min_players: 2,
    max_players: 200,
    duration_minutes: 10,
    window_hours: 48,
    badge: '🎁',
    info: 'Sin cuota de inscripción. Premio cubierto por la plataforma. Máximo 1 por semana.',
  },
}

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
  const maxPlayers       = parseInt(formData.get('max_players') as string)
  const registrationOpens = new Date(formData.get('registration_opens_at') as string).toISOString()
  const playStart        = new Date(formData.get('play_window_start') as string).toISOString()
  const playEnd          = new Date(formData.get('play_window_end') as string).toISOString()
  const maxDuration      = parseInt(formData.get('max_game_duration_minutes') as string) * 60

  if (!name || prize1 <= 0 || minPlayers < 2 || maxPlayers < minPlayers) {
    throw new Error('Datos del torneo inválidos')
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

  const toLocalInput = (d: Date) => d.toISOString().slice(0, 16)
  const defaults = MODALIDAD_DEFAULTS.standard

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/tournaments" className="text-sm text-muted-foreground hover:text-foreground">← Torneos</Link>
        <h1 className="text-2xl font-bold">Crear torneo</h1>
      </div>

      {/* Selector de modalidad */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Modalidad</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(MODALIDAD_DEFAULTS) as [string, typeof defaults][]).map(([key, m]) => (
            <label key={key} className="cursor-pointer">
              <input type="radio" name="tournament_type" value={key} defaultChecked={key === 'standard'} className="sr-only peer" form="tournament-form" />
              <div className="border rounded-xl p-3 text-center space-y-1 peer-checked:border-foreground peer-checked:bg-muted/50 hover:bg-muted/30 transition-colors">
                <p className="text-2xl">{m.badge}</p>
                <p className="text-xs font-semibold">{m.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{m.info}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <form id="tournament-form" action={createTournament} className="space-y-5">
        <input type="hidden" name="tournament_type" value="standard" />

        <Field label="Nombre del torneo" name="name" required placeholder="Torneo Estándar #1" />
        <Field label="Descripción (opcional)" name="description" placeholder="Detalles del torneo..." />

        <fieldset className="border rounded-xl p-4 space-y-4">
          <legend className="text-sm font-medium px-1">Premios (en pesos CLP)</legend>
          <div className="grid grid-cols-3 gap-3">
            <Field label="🥇 1° lugar" name="prize_1st" type="number" required defaultValue={String(defaults.prize_1st)} />
            <Field label="🥈 2° lugar" name="prize_2nd" type="number" defaultValue={String(defaults.prize_2nd)} />
            <Field label="🥉 3° lugar" name="prize_3rd" type="number" defaultValue={String(defaults.prize_3rd)} />
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Comisión sugerida: recauda al menos un 20% más que el total de premios para cubrir costos.
          </p>
        </fieldset>

        <fieldset className="border rounded-xl p-4 space-y-4">
          <legend className="text-sm font-medium px-1">Inscripción y cupos</legend>
          <Field label="Cuota de inscripción (CLP, 0 = freeroll)" name="entry_fee" type="number" required defaultValue={String(defaults.entry_fee)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo jugadores" name="min_players" type="number" required defaultValue={String(defaults.min_players)} />
            <Field label="Máximo jugadores" name="max_players" type="number" required defaultValue={String(defaults.max_players)} />
          </div>
        </fieldset>

        <fieldset className="border rounded-xl p-4 space-y-4">
          <legend className="text-sm font-medium px-1">Fechas y tiempos</legend>
          <Field label="Inscripciones abren" name="registration_opens_at" type="datetime-local" required defaultValue={toLocalInput(start)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio de partidas" name="play_window_start" type="datetime-local" required defaultValue={toLocalInput(start)} />
            <Field label="Cierre de partidas" name="play_window_end" type="datetime-local" required defaultValue={toLocalInput(end)} />
          </div>
          <Field label="Duración máxima de partida (min)" name="max_game_duration_minutes" type="number" required defaultValue={String(defaults.duration_minutes)} />
        </fieldset>

        <div className="border rounded-xl p-4 bg-amber-50 text-sm space-y-1">
          <p className="font-semibold text-amber-800">⚖️ Checklist legal antes de publicar</p>
          <ul className="list-disc list-inside text-amber-700 space-y-0.5 text-xs">
            <li>Los premios comprometidos están disponibles en la cuenta de la empresa</li>
            <li>El total de inscripciones mínimas cubre los premios + comisión</li>
            <li>Si no se alcanza el mínimo, el sistema reembolsa automáticamente</li>
            <li>Este torneo es una competencia de habilidad, no un juego de azar</li>
          </ul>
        </div>

        <button type="submit" className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity">
          Crear torneo
        </button>
      </form>
    </div>
  )
}

function Field({ label, name, type = 'text', required = false, placeholder, defaultValue }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={name} name={name} type={type} required={required}
        placeholder={placeholder} defaultValue={defaultValue}
        step={type === 'number' ? '1' : undefined}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background"
      />
    </div>
  )
}
