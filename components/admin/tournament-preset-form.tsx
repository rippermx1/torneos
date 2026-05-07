'use client'

import { AlertTriangle, CheckCircle2, Gem, Gift, Rocket, Trophy, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import type { TournamentType } from '@/types/database'
import {
  calculateEntryPoolFinancials,
  TOURNAMENT_PRESETS,
  pesosToCents,
  type TournamentPreset,
} from '@/lib/tournament/finance'

type CreateTournamentAction = (formData: FormData) => Promise<void>

interface TournamentPresetFormProps {
  action: CreateTournamentAction
  registrationOpensAt: string
  playWindowStart: string
  playWindowEnd: string
}

type NumericField =
  | 'entryFeePesos'
  | 'minPlayers'
  | 'targetPlayers'
  | 'maxPlayers'
  | 'durationMinutes'

const PRESET_ICONS: Record<TournamentPreset['strategy'], ComponentType<{ className?: string }>> = {
  acquisition: Gift,
  daily: Zap,
  balanced: Trophy,
  premium: Gem,
}

export function TournamentPresetForm({
  action,
  registrationOpensAt,
  playWindowStart,
  playWindowEnd,
}: TournamentPresetFormProps) {
  const [presetKey, setPresetKey] = useState<TournamentType>('standard')
  const [name, setName] = useState('Torneo Estándar')
  const [description, setDescription] = useState('Premios dinámicos: 85% de cada inscripción va a premios.')
  const [values, setValues] = useState(() => valuesFromPreset(TOURNAMENT_PRESETS[1]))
  const [dates, setDates] = useState({
    registrationOpensAt,
    playWindowStart,
    playWindowEnd,
  })

  const financials = useMemo(() => calculateEntryPoolFinancials({
    entryFeeCents: pesosToCents(values.entryFeePesos),
    minPlayers: values.minPlayers,
    targetPlayers: values.targetPlayers,
    maxPlayers: values.maxPlayers,
  }), [values])

  function applyPreset(preset: TournamentPreset) {
    setPresetKey(preset.key)
    setName(`${preset.shortLabel} ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}`)
    setDescription(preset.description)
    setValues(valuesFromPreset(preset))
  }

  function setNumeric(field: NumericField, rawValue: string) {
    const parsed = Number(rawValue)
    setValues((current) => ({
      ...current,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }))
  }

  const paidTournament = values.entryFeePesos > 0
  const registrationOpensMs = Date.parse(dates.registrationOpensAt)
  const playStartMs = Date.parse(dates.playWindowStart)
  const playEndMs = Date.parse(dates.playWindowEnd)
  const playWindowSeconds = (playEndMs - playStartMs) / 1000
  const datesValid =
    Number.isFinite(registrationOpensMs) &&
    Number.isFinite(playStartMs) &&
    Number.isFinite(playEndMs) &&
    registrationOpensMs < playStartMs &&
    playStartMs < playEndMs &&
    values.durationMinutes * 60 <= playWindowSeconds
  const capacityValid =
    values.minPlayers >= 2 &&
    values.targetPlayers >= values.minPlayers &&
    values.maxPlayers >= values.minPlayers &&
    values.targetPlayers <= values.maxPlayers
  const economicsValid = values.entryFeePesos >= 0 && values.durationMinutes > 0
  const paidPlayersValid = !paidTournament || values.minPlayers >= 3
  const canLaunch = datesValid && capacityValid && economicsValid && paidPlayersValid

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Presets listos</p>
          <p className="text-xs text-muted-foreground">
            Selecciona una base rentable y ajusta cupos u horarios antes de publicar.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {TOURNAMENT_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.strategy]
            const presetFinancials = calculateEntryPoolFinancials({
              entryFeeCents: pesosToCents(preset.entryFeePesos),
              minPlayers: preset.minPlayers,
              targetPlayers: preset.targetPlayers,
              maxPlayers: preset.maxPlayers,
            })
            const selected = preset.key === presetKey

            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`text-left border rounded-lg p-3 space-y-3 transition-colors ${
                  selected ? 'border-foreground bg-muted/50' : 'hover:bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{preset.label}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{preset.description}</p>
                  </div>
                  <Icon className="h-5 w-5 shrink-0" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Metric label="Entrada" value={formatPesos(preset.entryFeePesos)} />
                  <Metric label="Premio mín." value={formatCents(presetFinancials.minPrizeFundCents)} />
                  <Metric label="Mínimo" value={`${preset.minPlayers} jugadores`} />
                  <Metric label="Fee neto" value={preset.entryFeePesos > 0 ? formatBps(presetFinancials.platformNetMarginBps) : 'Costo promo'} />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <form id="tournament-form" action={action} className="space-y-5">
        <input type="hidden" name="tournament_type" value={presetKey} />
        <input type="hidden" name="target_players" value={values.targetPlayers} />

        <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="text-sm font-medium px-1">Datos principales</legend>
              <Field label="Nombre del torneo" name="name" required value={name} onChange={setName} />
              <Field label="Descripción" name="description" value={description} onChange={setDescription} />
            </fieldset>

            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="text-sm font-medium px-1">Entrada y cupos</legend>
              <NumberField label="Cuota de inscripción" name="entry_fee" value={values.entryFeePesos} onChange={(value) => setNumeric('entryFeePesos', value)} required />
              <div className="grid grid-cols-3 gap-3">
                <NumberField label="Mínimo" name="min_players" value={values.minPlayers} onChange={(value) => setNumeric('minPlayers', value)} required />
                <NumberField label="Objetivo" name="target_players_visible" value={values.targetPlayers} onChange={(value) => setNumeric('targetPlayers', value)} />
                <NumberField label="Máximo" name="max_players" value={values.maxPlayers} onChange={(value) => setNumeric('maxPlayers', value)} required />
              </div>
            </fieldset>

            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="text-sm font-medium px-1">Fechas y tiempo</legend>
              <DateField label="Inscripciones abren" name="registration_opens_at" value={dates.registrationOpensAt} onChange={(value) => setDates((current) => ({ ...current, registrationOpensAt: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <DateField label="Inicio partidas" name="play_window_start" value={dates.playWindowStart} onChange={(value) => setDates((current) => ({ ...current, playWindowStart: value }))} />
                <DateField label="Cierre partidas" name="play_window_end" value={dates.playWindowEnd} onChange={(value) => setDates((current) => ({ ...current, playWindowEnd: value }))} />
              </div>
              <NumberField label="Duración máxima de partida en minutos" name="max_game_duration_minutes" value={values.durationMinutes} onChange={(value) => setNumeric('durationMinutes', value)} required />
            </fieldset>
          </div>

          <aside className="border rounded-lg p-4 h-fit space-y-4 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Resultado esperado</p>
              {canLaunch ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div className="space-y-2 text-sm">
              <MetricRow label="Premio mínimo" value={formatCents(financials.minPrizeFundCents)} />
              <MetricRow label="Premio objetivo" value={formatCents(financials.targetPrizeFundCents)} />
              <MetricRow label="Premio máximo" value={formatCents(financials.maxPrizeFundCents)} />
              <MetricRow label="Fee plataforma bruto" value={formatCents(financials.targetPlatformFeeGrossCents)} />
              <MetricRow label="IVA fee objetivo" value={formatCents(financials.targetPlatformFeeIvaCents)} />
              <MetricRow label="Ingreso neto objetivo" value={formatCents(financials.targetPlatformFeeNetCents)} tone="green" />
              <MetricRow label="Margen neto por entrada" value={paidTournament ? formatBps(financials.platformNetMarginBps) : 'Freeroll'} tone={financials.isTargetHealthy ? 'green' : 'red'} />
            </div>
            {!canLaunch && (
              <p className="text-xs text-red-700">
                Revisa cupos, horarios, duración y mínimo de jugadores antes de publicar.
              </p>
            )}
            {paidTournament && !paidPlayersValid && (
              <p className="text-xs text-red-700">
                Los torneos pagados requieren al menos 3 jugadores.
              </p>
            )}
            {paidTournament && !financials.isTargetHealthy && (
              <p className="text-xs text-amber-700">
                El fee neto queda estrecho. Úsalo sólo como adquisición.
              </p>
            )}
            {!paidTournament && (
              <p className="text-xs text-muted-foreground">
                Freeroll: registrar como costo de marketing y limitar frecuencia.
              </p>
            )}
            <button
              type="submit"
              disabled={!canLaunch}
              className="w-full bg-foreground text-background py-3 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Rocket className="h-4 w-4" />
              Crear torneo
            </button>
          </aside>
        </section>
      </form>
    </div>
  )
}

function valuesFromPreset(preset: TournamentPreset) {
  return {
    entryFeePesos: preset.entryFeePesos,
    minPlayers: preset.minPlayers,
    targetPlayers: preset.targetPlayers,
    maxPlayers: preset.maxPlayers,
    durationMinutes: preset.durationMinutes,
  }
}

function formatPesos(value: number) {
  return `$${value.toLocaleString('es-CL')}`
}

function formatCents(cents: number) {
  return formatPesos(Math.round(cents / 100))
}

function formatBps(bps: number) {
  return `${(bps / 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : ''

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-right ${toneClass}`}>{value}</span>
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  required = false,
}: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background"
      />
    </div>
  )
}

function NumberField({
  label,
  name,
  value,
  onChange,
  required = false,
}: {
  label: string
  name: string
  value: number
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background"
      />
    </div>
  )
}

function DateField({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background"
      />
    </div>
  )
}
