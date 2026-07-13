import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { Tournament } from '@/types/database'
import Link from 'next/link'
import { RegisterButton } from '@/components/tournament/register-button'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { checkPlayWindow, checkRegistrationWindow } from '@/lib/tournament/helpers'
import { calculateTournamentDisplayPayouts, splitEntryFee, selectPrizeTier, type PrizeTier } from '@/lib/tournament/finance'
import { PrizeLadder } from '@/components/tournament/prize-ladder'
import { SKILL_TIER_LABELS } from '@/lib/tournament/rating'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('tournaments')
    .select('name, description, prize_1st_cents, prize_2nd_cents, prize_3rd_cents, entry_fee_cents')
    .eq('id', id)
    .single()

  if (!data) return { title: 'Torneo no encontrado — TorneosPlay' }

  const t = data as Pick<
    Tournament,
    'name' | 'description' | 'prize_1st_cents' | 'prize_2nd_cents' | 'prize_3rd_cents' | 'entry_fee_cents'
  >
  const totalPrize = t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
  const description =
    t.description ||
    `Premio ${formatCLP(totalPrize)} · Inscripción ${formatCLP(t.entry_fee_cents)}. Compite en el torneo de 2048 con premios reales en CLP.`

  return {
    title: `${t.name} — TorneosPlay`,
    description,
    openGraph: {
      title: t.name,
      description,
      type: 'website',
    },
  }
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()   // anon — para datos públicos
  const admin = createAdminClient()       // service_role — para datos del usuario
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const [{ data: tData }, { count: playerCount }, { data: tierRows }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    admin
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', id),
    supabase
      .from('tournament_prize_tiers')
      .select('min_players_threshold, prize_fund_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents')
      .eq('tournament_id', id)
      .order('min_players_threshold', { ascending: true }),
  ])

  if (!tData) notFound()
  const t = tData as Tournament

  // Verificar si el usuario está inscrito (necesita admin para bypassear RLS)
  let isRegistered = false
  let creditBalanceCents = 0
  if (userId) {
    const { data: reg } = await admin
      .from('registrations')
      .select('id')
      .eq('tournament_id', id)
      .eq('user_id', userId)
      .single()
    isRegistered = !!reg

    if (t.entry_fee_cents > 0) {
      const { data: credit } = await admin.rpc('wallet_credit_balance', { p_user_id: userId })
      creditBalanceCents = Number(credit ?? 0)
    }
  }

  const registrationWindow = checkRegistrationWindow(t)
  const playWindow = checkPlayWindow(t)
  const canRegister = registrationWindow.ok
  const inPlayWindow = playWindow.ok
  const currentPlayerCount = playerCount ?? 0
  const hasMinimumPlayers = currentPlayerCount >= t.min_players

  const payouts = calculateTournamentDisplayPayouts(t, currentPlayerCount)
  const split = splitEntryFee(t.entry_fee_cents, t.prize_fund_bps)

  // Escalera de premios: bolsa garantizada que sube por tramos con la convocatoria.
  const tiers: PrizeTier[] = (tierRows ?? []).map((r) => ({
    thresholdPlayers: r.min_players_threshold,
    fundCents: r.prize_fund_cents,
    prize1Cents: r.prize_1st_cents,
    prize2Cents: r.prize_2nd_cents,
    prize3Cents: r.prize_3rd_cents,
  }))
  const applicableTier = tiers.length > 0 ? selectPrizeTier(tiers, currentPlayerCount) : null
  const hasLadder = tiers.length > 1
  const shownFundCents = applicableTier ? applicableTier.fundCents : payouts.prizeFundCents
  const shownP1 = applicableTier ? applicableTier.prize1Cents : payouts.prize1Cents
  const shownP2 = applicableTier ? applicableTier.prize2Cents : payouts.prize2Cents
  const shownP3 = applicableTier ? applicableTier.prize3Cents : payouts.prize3Cents

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t.name}</h1>
        {t.skill_tier && (
          <span className="inline-block text-xs font-medium bg-muted text-foreground rounded-full px-2.5 py-1">
            División {SKILL_TIER_LABELS[t.skill_tier]}
          </span>
        )}
        {t.description && <p className="text-muted-foreground">{t.description}</p>}
      </div>

      {/* Info principal */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard label="Inscripción" value={formatCLP(t.entry_fee_cents)} highlight />
        <InfoCard
          label={hasLadder ? 'Bolsa actual' : 'Premio fijo'}
          value={formatCLP(shownFundCents)}
        />
        <InfoCard label="Jugadores" value={`${currentPlayerCount} / ${t.max_players}`} />
        <InfoCard label="Mínimo para jugar" value={`${t.min_players} jugadores`} />
      </div>

      {t.entry_fee_cents > 0 && (
        <div className="border rounded-xl p-5 space-y-2 text-sm">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">¿Cómo se usa tu inscripción?</h2>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Fondo de premios del torneo</span>
            <span className="font-medium">{formatCLP(split.prizeFundContributionCents)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Operación de la plataforma (IVA y procesamiento incluidos)</span>
            <span className="font-medium">{formatCLP(split.platformFeeGrossCents)}</span>
          </div>
        </div>
      )}

      {t.entry_fee_cents > 0 && ['scheduled', 'open'].includes(t.status) && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">Garantía de reembolso</p>
          <p>
            Si al inicio del torneo no se han inscrito al menos {t.min_players} jugadores, el torneo se cancela automáticamente y te devolvemos el 100% de tu inscripción ({formatCLP(t.entry_fee_cents)}) al mismo medio de pago que usaste.
          </p>
        </div>
      )}

      {/* Premios */}
      <div className="border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {hasLadder ? 'Premios del tramo actual' : 'Premios'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {hasLadder
            ? 'Reparto de la bolsa alcanzada según los inscritos actuales. La bolsa sube con la convocatoria (ver escalera).'
            : 'Los montos de premio son fijos y están publicados antes de la inscripción.'}
        </p>
        <div className="space-y-2">
          {[
            { place: '🥇 1° lugar', amount: shownP1 },
            { place: '🥈 2° lugar', amount: shownP2 },
            { place: '🥉 3° lugar', amount: shownP3 },
          ]
            .filter((p) => p.amount > 0)
            .map(({ place, amount }) => (
              <div key={place} className="flex justify-between text-sm">
                <span>{place}</span>
                <span className="font-semibold">{formatCLP(amount)}</span>
              </div>
            ))}
        </div>
      </div>

      <PrizeLadder tiers={tiers} currentPlayerCount={currentPlayerCount} registrationOpen={canRegister} />

      {/* Fechas */}
      <div className="border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Fechas</h2>
        <div className="space-y-2 text-sm">
          <DateRow label="Inscripciones abren" value={formatDateTimeCL(t.registration_opens_at)} />
          <DateRow label="Inicio de partidas" value={formatDateTimeCL(t.play_window_start)} />
          <DateRow label="Cierre de partidas" value={formatDateTimeCL(t.play_window_end)} />
          <DateRow label="Duración máxima" value={`${t.max_game_duration_seconds / 60} minutos`} />
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!userId && canRegister ? (
          <Link
            href="/sign-up"
            className="flex-1 text-center bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Crear cuenta para inscribirme
          </Link>
        ) : !userId && inPlayWindow ? (
          <Link
            href="/sign-in"
            className="flex-1 text-center bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Iniciar sesión para jugar
          </Link>
        ) : !userId ? (
          <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
            Inscripciones cerradas
          </div>
        ) : isRegistered ? (
          <>
            <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
              ✓ Inscrito
            </div>
            {inPlayWindow && hasMinimumPlayers ? (
              <Link
                href={`/tournaments/${id}/play`}
                className="flex-1 text-center bg-amber-500 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
              >
                Jugar ahora
              </Link>
            ) : inPlayWindow ? (
              <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
                Mínimo no alcanzado; el torneo será cancelado y reembolsado.
              </div>
            ) : (
              <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
                {playWindow.reason === 'window_not_open'
                  ? 'Partidas aún no abiertas'
                  : 'Partidas cerradas'}
              </div>
            )}
          </>
        ) : canRegister ? (
          <RegisterButton
            tournamentId={id}
            entryFeeCents={t.entry_fee_cents}
            creditBalanceCents={creditBalanceCents}
            className="flex-1"
          />
        ) : (
          <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
            Inscripciones cerradas
          </div>
        )}

        <Link
          href={`/tournaments/${id}/leaderboard`}
          className="flex-1 text-center border rounded-xl py-3 text-sm font-medium hover:bg-muted transition-colors"
        >
          Ver ranking
        </Link>
      </div>
    </div>
  )
}

function InfoCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-600' : ''}`}>{value}</p>
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
