'use client'

import { AlertTriangle, CheckCircle2, FlaskConical, Gift, Rocket, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import type { TournamentType } from '@/types/database'
import {
  buildFixedPrize,
  calculateFixedPrizeFinancials,
  calculatePresetFinancials,
  centsToPesos,
  DEFAULT_FREEROLL_PRIZE_CENTS,
  LATENCY_PRESET,
  MAX_PILOT_FIRST_PRIZE_CENTS,
  MAX_PILOT_TOTAL_PRIZE_CENTS,
  maxPlayersForMinimum,
  MIN_PAID_ENTRY_FEE_CENTS,
  pesosToCents,
  TOURNAMENT_PRESETS,
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
  | 'freerollPrizePesos'
  | 'minPlayers'
  | 'maxPlayers'
  | 'durationMinutes'

const PRESET_ICONS: Record<TournamentPreset['strategy'], ComponentType<{ className?: string }>> = {
  acquisition: Gift,
  balanced: Trophy,
}

export function TournamentPresetForm({
  action,
  registrationOpensAt,
  playWindowStart,
  playWindowEnd,
}: TournamentPresetFormProps) {
  const defaultPreset = TOURNAMENT_PRESETS[0]
  const [presetKey, setPresetKey] = useState<TournamentType>(defaultPreset.key)
  const [isTest, setIsTest] = useState(false)
  const [skillTier, setSkillTier] = useState('')
  const [name, setName] = useState('Torneo Piloto')
  const [description, setDescription] = useState<string>(defaultPreset.description)
  const [values, setValues] = useState(() => valuesFromPreset(defaultPreset))
  const [dates, setDates] = useState({ registrationOpensAt, playWindowStart, playWindowEnd })

  const paidTournament = values.entryFeePesos > 0
  const fixedPrize = useMemo(() => {
    if (!paidTournament) {
      const prize1Cents = pesosToCents(values.freerollPrizePesos)
      return { fundCents: prize1Cents, prize1Cents, prize2Cents: 0, prize3Cents: 0 }
    }

    try {
      return buildFixedPrize({
        entryFeeCents: pesosToCents(values.entryFeePesos),
        minPlayers: values.minPlayers,
        maxPlayers: values.maxPlayers,
      })
    } catch {
      return null
    }
  }, [paidTournament, values.entryFeePesos, values.freerollPrizePesos, values.minPlayers, values.maxPlayers])

  const financials = useMemo(() => {
    if (!fixedPrize) return null
    return calculateFixedPrizeFinancials({
      entryFeeCents: pesosToCents(values.entryFeePesos),
      prize1Cents: fixedPrize.prize1Cents,
      prize2Cents: fixedPrize.prize2Cents,
      prize3Cents: fixedPrize.prize3Cents,
      minPlayers: values.minPlayers,
      maxPlayers: values.maxPlayers,
    })
  }, [fixedPrize, values.entryFeePesos, values.minPlayers, values.maxPlayers])

  function applyPreset(preset: TournamentPreset) {
    setPresetKey(preset.key)
    setIsTest(false)
    setName(`${preset.shortLabel} ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}`)
    setDescription(preset.description)
    setValues(valuesFromPreset(preset))
  }

  function applyLatencyPreset() {
    setPresetKey(LATENCY_PRESET.tournamentType)
    setIsTest(true)
    setName(`Latencia ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`)
    setDescription('Torneo gratuito de prueba para medir latencia.')
    setValues({
      entryFeePesos: LATENCY_PRESET.entryFeePesos,
      freerollPrizePesos: 1,
      minPlayers: LATENCY_PRESET.minPlayers,
      maxPlayers: LATENCY_PRESET.maxPlayers,
      durationMinutes: LATENCY_PRESET.durationMinutes,
    })
  }

  function setNumeric(field: NumericField, rawValue: string) {
    const parsed = Number(rawValue)
    setValues((current) => ({
      ...current,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }))
  }

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
  const capacityLimit = values.minPlayers >= 1 ? maxPlayersForMinimum(values.minPlayers) : 0
  const capacityValid =
    values.minPlayers >= (isTest ? 1 : 2) &&
    values.maxPlayers >= values.minPlayers &&
    (!paidTournament || values.maxPlayers <= capacityLimit)
  const paidEntryValid =
    !paidTournament || pesosToCents(values.entryFeePesos) >= MIN_PAID_ENTRY_FEE_CENTS
  const freerollPrizeValid = paidTournament || values.freerollPrizePesos > 0
  const prizeCapsValid = Boolean(
    fixedPrize &&
      fixedPrize.fundCents <= MAX_PILOT_TOTAL_PRIZE_CENTS &&
      fixedPrize.prize1Cents <= MAX_PILOT_FIRST_PRIZE_CENTS
  )
  const economicsValid =
    values.entryFeePesos >= 0 &&
    values.durationMinutes > 0 &&
    Boolean(financials) &&
    (!paidTournament || financials?.isMinHealthy)
  const canLaunch =
    datesValid &&
    capacityValid &&
    paidEntryValid &&
    freerollPrizeValid &&
    prizeCapsValid &&
    economicsValid

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Formatos permitidos</p>
          <p className="text-xs text-muted-foreground">
            El piloto concentra la demanda en un solo torneo pagado. El premio queda fijo al publicar.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOURNAMENT_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.strategy]
            const presetFinancials = calculatePresetFinancials(preset)
            const selected = preset.key === presetKey && !isTest

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
                  <Metric label="Premio fijo" value={formatCents(presetFinancials.totalPrizesCents)} />
                  <Metric label="Cupos" value={`${preset.minPlayers}–${preset.maxPlayers}`} />
                  <Metric
                    label="Margen mínimo"
                    value={preset.entryFeePesos > 0 ? formatBps(presetFinancials.min.contributionMarginBps) : 'Costo promo'}
                  />
                </div>
              </button>
            )
          })}
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2">Desarrollo</p>
          <button
            type="button"
            onClick={applyLatencyPreset}
            className={`flex items-center gap-2 text-left border rounded-lg px-3 py-2 text-sm transition-colors ${
              isTest ? 'border-foreground bg-muted/50' : 'hover:bg-muted/30 border-dashed'
            }`}
          >
            <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">Latencia (1 jugador)</span>
            <span className="text-xs text-muted-foreground">· prueba gratuita · $1 simbólico</span>
          </button>
        </div>
      </section>

      <form id="tournament-form" action={action} className="space-y-5">
        <input type="hidden" name="tournament_type" value={presetKey} />
        <input type="hidden" name="is_test" value={isTest ? '1' : ''} />

        <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="text-sm font-medium px-1">Datos principales</legend>
              <Field label="Nombre del torneo" name="name" required value={name} onChange={setName} />
              <Field label="Descripción" name="description" value={description} onChange={setDescription} />
              <div className="space-y-1.5">
                <label htmlFor="skill_tier" className="text-sm font-medium">División por habilidad</label>
                <select
                  id="skill_tier"
                  name="skill_tier"
                  value={skillTier}
                  onChange={(event) => setSkillTier(event.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background"
                >
                  <option value="">Abierto (todas las divisiones)</option>
                  <option value="novato">Solo Novato</option>
                  <option value="intermedio">Solo Intermedio</option>
                  <option value="pro">Solo Pro</option>
                </select>
              </div>
            </fieldset>

            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="text-sm font-medium px-1">Entrada, premio y cupos</legend>
              <NumberField label="Cuota de inscripción" name="entry_fee" value={values.entryFeePesos} onChange={(value) => setNumeric('entryFeePesos', value)} required />
              {!paidTournament && (
                <NumberField label="Premio 1er lugar" name="freeroll_prize" value={values.freerollPrizePesos} onChange={(value) => setNumeric('freerollPrizePesos', value)} required />
              )}
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Mínimo" name="min_players" value={values.minPlayers} onChange={(value) => setNumeric('minPlayers', value)} required />
                <NumberField label="Máximo" name="max_players" value={values.maxPlayers} onChange={(value) => setNumeric('maxPlayers', value)} required />
              </div>
              {paidTournament && fixedPrize && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                  <p className="font-medium text-sm">Premio fijo: {formatCents(fixedPrize.fundCents)}</p>
                  <p className="text-muted-foreground">
                    1° {formatCents(fixedPrize.prize1Cents)} · 2° {formatCents(fixedPrize.prize2Cents)} · no cambia con los inscritos.
                  </p>
                </div>
              )}
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
              {canLaunch ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
            </div>
            {financials && fixedPrize && (
              <div className="space-y-2 text-sm">
                <MetricRow label="Premio fijo" value={formatCents(fixedPrize.fundCents)} />
                <MetricRow label="Venta al mínimo" value={formatCents(financials.min.grossRevenueCents)} />
                <MetricRow label="IVA al mínimo" value={formatCents(financials.min.vatDebitCents)} />
                <MetricRow label="Flow neto estimado" value={formatCents(financials.min.flowFeeNetCents)} />
                <MetricRow label="Contribución mínima" value={formatCents(financials.min.contributionCents)} tone="green" />
                <MetricRow label="Margen mínimo" value={paidTournament ? formatBps(financials.min.contributionMarginBps) : 'Freeroll'} tone={financials.isMinHealthy ? 'green' : 'red'} />
                {paidTournament && (
                  <MetricRow label="Margen al llenarse" value={formatBps(financials.max.contributionMarginBps)} tone="green" />
                )}
              </div>
            )}
            {!paidEntryValid && <p className="text-xs text-red-700">La inscripción pagada mínima es $2.000.</p>}
            {!capacityValid && paidTournament && (
              <p className="text-xs text-red-700">Con este mínimo, el cupo máximo permitido es {capacityLimit}.</p>
            )}
            {!prizeCapsValid && <p className="text-xs text-red-700">La configuración excede los topes monetarios del piloto.</p>}
            {paidTournament && financials && !financials.isMinHealthy && (
              <p className="text-xs text-amber-700">El margen al mínimo debe ser al menos 25%.</p>
            )}
            {!paidTournament && !freerollPrizeValid && <p className="text-xs text-red-700">El freeroll necesita un premio mayor a 0.</p>}
            {!datesValid && <p className="text-xs text-red-700">Revisa las fechas y la duración de la partida.</p>}
            <button
              type="submit"
              disabled={!canLaunch}
              className="w-full bg-foreground text-background py-3 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Rocket className="h-4 w-4" />
              Crear torneo con premio fijo
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
    freerollPrizePesos:
      preset.entryFeePesos === 0 ? preset.prize1Pesos : centsToPesos(DEFAULT_FREEROLL_PRIZE_CENTS),
    minPlayers: preset.minPlayers,
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
  return <div><p className="text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : ''
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className={`font-medium text-right ${toneClass}`}>{value}</span></div>
}

function Field({ label, name, value, onChange, required = false }: { label: string; name: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="space-y-1.5"><label htmlFor={name} className="text-sm font-medium">{label}</label><input id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background" /></div>
}

function NumberField({ label, name, value, onChange, required = false }: { label: string; name: string; value: number; onChange: (value: string) => void; required?: boolean }) {
  return <div className="space-y-1.5"><label htmlFor={name} className="text-sm font-medium">{label}</label><input id={name} name={name} type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} required={required} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background" /></div>
}

function DateField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><label htmlFor={name} className="text-sm font-medium">{label}</label><input id={name} name={name} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background" /></div>
}
