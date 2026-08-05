'use client'

import { CheckCircle2, FlaskConical, Gift, LockKeyhole, Rocket, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import {
  DEFAULT_TOURNAMENT_PRESET_KEY,
  MONTHLY_FIXED_COST_TARGET_CENTS,
  TOURNAMENT_PRESETS,
  calculatePresetFinancials,
  getTournamentPreset,
  tournamentsNeededForMonthlyTarget,
  type TournamentPreset,
} from '@/lib/tournament/finance'

type CreateTournamentAction = (formData: FormData) => Promise<void>

interface TournamentPresetFormProps {
  action: CreateTournamentAction
  registrationOpensAt: string
  playWindowStart: string
  playWindowEnd: string
}

const PRESET_ICONS: Record<
  TournamentPreset['key'],
  ComponentType<{ className?: string }>
> = {
  commercial_v1: Trophy,
  freeroll_v1: Gift,
  internal_test_v1: FlaskConical,
}

export function TournamentPresetForm({
  action,
  registrationOpensAt,
  playWindowStart,
  playWindowEnd,
}: TournamentPresetFormProps) {
  const defaultPreset = getTournamentPreset(DEFAULT_TOURNAMENT_PRESET_KEY)!
  const [presetKey, setPresetKey] = useState<TournamentPreset['key']>(defaultPreset.key)
  const [name, setName] = useState(defaultTournamentName(defaultPreset))
  const [description, setDescription] = useState(defaultPreset.description)
  const [dates, setDates] = useState({ registrationOpensAt, playWindowStart, playWindowEnd })

  const preset = getTournamentPreset(presetKey) ?? defaultPreset
  const financials = useMemo(() => calculatePresetFinancials(preset), [preset])
  const registrationOpensMs = Date.parse(dates.registrationOpensAt)
  const playStartMs = Date.parse(dates.playWindowStart)
  const playEndMs = Date.parse(dates.playWindowEnd)
  const datesValid =
    Number.isFinite(registrationOpensMs) &&
    Number.isFinite(playStartMs) &&
    Number.isFinite(playEndMs) &&
    registrationOpensMs < playStartMs &&
    playStartMs < playEndMs &&
    preset.durationMinutes * 60_000 <= playEndMs - playStartMs
  const canLaunch = name.trim().length > 0 && name.trim().length <= 120 && datesValid

  function selectPreset(nextPreset: TournamentPreset) {
    const parsedStart = new Date(dates.playWindowStart)
    const nextEnd = Number.isNaN(parsedStart.getTime())
      ? dates.playWindowEnd
      : formatLocalDateTime(new Date(parsedStart.getTime() + nextPreset.windowHours * 60 * 60 * 1000))

    setPresetKey(nextPreset.key)
    setName(defaultTournamentName(nextPreset))
    setDescription(nextPreset.description)
    setDates((current) => ({ ...current, playWindowEnd: nextEnd }))
  }

  const commercial = preset.key === 'commercial_v1'
  const monthlyAtMinimum = tournamentsNeededForMonthlyTarget(financials.min.contributionCents)
  const monthlyAtCapacity = tournamentsNeededForMonthlyTarget(financials.max.contributionCents)

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="preset_key" value={preset.key} />

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">1. Elige el propósito</p>
            <p className="text-xs text-muted-foreground mt-1">
              Los montos, premios y cupos están protegidos por la política económica.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <LockKeyhole className="h-3.5 w-3.5" /> Economía protegida
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {TOURNAMENT_PRESETS.map((option) => {
            const Icon = PRESET_ICONS[option.key]
            const selected = option.key === preset.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => selectPreset(option)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? 'border-foreground bg-foreground/[0.04] ring-1 ring-foreground'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-5 w-5" />
                  {selected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </div>
                <p className="mt-3 text-sm font-semibold">{option.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
                <p className="mt-3 text-xs font-medium">
                  {option.entryFeePesos > 0
                    ? `${formatPesos(option.entryFeePesos)} · ${option.minPlayers}–${option.maxPlayers} cupos`
                    : option.isTest
                      ? '1 participante · sin venta'
                      : `Gratis · costo promocional ${formatPesos(option.prize1Pesos)}`}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">2. Identidad y calendario</p>
          <p className="text-xs text-muted-foreground mt-1">
            Solo debes decidir cómo se llama, a quién va dirigido y cuándo se juega.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nombre del torneo">
            <input
              name="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Nivel recomendado">
            <select
              name="skill_tier"
              defaultValue=""
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="">Todos los niveles</option>
              <option value="novato">Novato</option>
              <option value="intermedio">Intermedio</option>
              <option value="pro">Pro</option>
            </select>
          </Field>
        </div>

        <Field label="Descripción pública">
          <textarea
            name="description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DateField
            label="Abre inscripciones"
            name="registration_opens_at"
            value={dates.registrationOpensAt}
            onChange={(value) => setDates((current) => ({ ...current, registrationOpensAt: value }))}
          />
          <DateField
            label="Comienza el juego"
            name="play_window_start"
            value={dates.playWindowStart}
            onChange={(value) => setDates((current) => ({ ...current, playWindowStart: value }))}
          />
          <DateField
            label="Cierra el juego"
            name="play_window_end"
            value={dates.playWindowEnd}
            onChange={(value) => setDates((current) => ({ ...current, playWindowEnd: value }))}
          />
        </div>
        {!datesValid && (
          <p className="text-xs text-red-600">
            Las inscripciones deben abrir antes del inicio y la ventana debe permitir una partida de {preset.durationMinutes} minutos.
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-muted/20 p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">3. Revisa antes de publicar</p>
            <p className="text-xs text-muted-foreground mt-1">
              Esta es la configuración final; no existen campos financieros editables.
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            commercial
              ? 'bg-emerald-100 text-emerald-800'
              : preset.isTest
                ? 'bg-slate-100 text-slate-700'
                : 'bg-amber-100 text-amber-800'
          }`}>
            {commercial ? 'Genera contribución' : preset.isTest ? 'No comercial' : 'Gasto de marketing'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Inscripción" value={formatPesos(preset.entryFeePesos)} />
          <Metric label="Cupos" value={`${preset.minPlayers}–${preset.maxPlayers}`} />
          <Metric label="Premio fijo" value={formatCents(financials.totalPrizesCents)} />
          <Metric label="Partida" value={`${preset.durationMinutes} min`} />
        </div>

        {commercial ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-background p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Al mínimo de {preset.minPlayers} jugadores
              </p>
              <MetricRow label="Ventas con IVA" value={formatCents(financials.min.grossRevenueCents)} />
              <MetricRow label="IVA débito incluido" value={formatCents(financials.min.vatDebitCents)} />
              <MetricRow label="Costo Flow estimado" value={formatCents(financials.min.flowFeeNetCents)} />
              <MetricRow label="Premios comprometidos" value={formatCents(financials.min.fixedPrizeCents)} />
              <MetricRow
                label="Contribución antes de CAC y costos fijos"
                value={formatCents(financials.min.contributionCents)}
                emphasis
              />
              <p className="text-xs text-muted-foreground">
                Margen de contribución {(financials.min.contributionMarginBps / 100).toFixed(1)}%.
              </p>
            </div>

            <div className="rounded-lg border bg-background p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Meta operativa mensual
              </p>
              <MetricRow label="Costos fijos de planificación" value={formatCents(MONTHLY_FIXED_COST_TARGET_CENTS)} />
              <MetricRow label="Torneos al mínimo" value={`${monthlyAtMinimum} al mes`} />
              <MetricRow label="Torneos llenos" value={`${monthlyAtCapacity} al mes`} />
              <MetricRow
                label={`Contribución con ${preset.maxPlayers} jugadores`}
                value={formatCents(financials.max.contributionCents)}
                emphasis
              />
              <p className="text-xs text-muted-foreground">
                Meta de control, no utilidad garantizada: faltan CAC y costos reales del mes.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-4 text-sm">
            {preset.isTest ? (
              <p>
                Esta ejecución se marca como prueba interna y queda fuera de los indicadores comerciales.
              </p>
            ) : (
              <p>
                La plataforma asume {formatCents(financials.totalPrizesCents)} como gasto promocional. Solo se permite un freeroll activo por semana.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="h-4 w-4" />
            El servidor y la base de datos volverán a validar esta configuración.
          </p>
          <button
            type="submit"
            disabled={!canLaunch}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Rocket className="h-4 w-4" />
            Publicar torneo con estas condiciones
          </button>
        </div>
      </section>
    </form>
  )
}

function defaultTournamentName(preset: TournamentPreset) {
  return `${preset.shortLabel} ${new Date().toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
  })}`
}

function formatLocalDateTime(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function formatPesos(pesos: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(pesos)
}

function formatCents(cents: number) {
  return formatPesos(Math.round(cents / 100))
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </label>
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
    <Field label={label}>
      <input
        type="datetime-local"
        name={name}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />
    </Field>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function MetricRow({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-4 text-sm ${emphasis ? 'border-t pt-2 font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="shrink-0 text-right">{value}</span>
    </div>
  )
}
