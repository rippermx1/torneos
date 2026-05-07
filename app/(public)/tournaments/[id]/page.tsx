import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { Tournament } from '@/types/database'
import Link from 'next/link'
import { RegisterButton } from '@/components/tournament/register-button'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { checkPlayWindow, checkRegistrationWindow } from '@/lib/tournament/helpers'
import { calculateTournamentDisplayPayouts, splitEntryFee } from '@/lib/tournament/finance'

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

  if (!data) return { title: 'Torneo no encontrado — Torneos 2048' }

  const t = data as Pick<
    Tournament,
    'name' | 'description' | 'prize_1st_cents' | 'prize_2nd_cents' | 'prize_3rd_cents' | 'entry_fee_cents'
  >
  const totalPrize = t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
  const description =
    t.description ||
    `Premio ${formatCLP(totalPrize)} · Inscripción ${formatCLP(t.entry_fee_cents)}. Compite en el torneo de 2048 con premios reales en CLP.`

  return {
    title: `${t.name} — Torneos 2048`,
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

  const [{ data: tData }, { count: playerCount }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    admin
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', id),
  ])

  if (!tData) notFound()
  const t = tData as Tournament

  // Verificar si el usuario está inscrito (necesita admin para bypassear RLS)
  let isRegistered = false
  if (userId) {
    const { data: reg } = await admin
      .from('registrations')
      .select('id')
      .eq('tournament_id', id)
      .eq('user_id', userId)
      .single()
    isRegistered = !!reg
  }

  const registrationWindow = checkRegistrationWindow(t)
  const playWindow = checkPlayWindow(t)
  const canRegister = registrationWindow.ok
  const inPlayWindow = playWindow.ok
  const currentPlayerCount = playerCount ?? 0
  const hasMinimumPlayers = currentPlayerCount >= t.min_players

  const payouts = calculateTournamentDisplayPayouts(t, currentPlayerCount)
  const split = splitEntryFee(t.entry_fee_cents, t.prize_fund_bps)

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t.name}</h1>
        {t.description && <p className="text-muted-foreground">{t.description}</p>}
      </div>

      {/* Info principal */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard label="Inscripción" value={formatCLP(t.entry_fee_cents)} highlight />
        <InfoCard
          label="Premio mínimo"
          value={formatCLP(payouts.prizeFundCents)}
        />
        <InfoCard label="Jugadores" value={`${currentPlayerCount} / ${t.max_players}`} />
        <InfoCard label="Mínimo para jugar" value={`${t.min_players} jugadores`} />
      </div>

      {t.entry_fee_cents > 0 && (
        <div className="border rounded-xl p-5 space-y-2 text-sm">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Distribución</h2>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Aporte a premios por inscripción</span>
            <span className="font-medium">{formatCLP(split.prizeFundContributionCents)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Fee plataforma IVA incluido</span>
            <span className="font-medium">{formatCLP(split.platformFeeGrossCents)}</span>
          </div>
        </div>
      )}

      {/* Premios */}
      <div className="border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Premios</h2>
        <div className="space-y-2">
          {[
            { place: '🥇 1° lugar', amount: payouts.prize1Cents },
            { place: '🥈 2° lugar', amount: payouts.prize2Cents },
            { place: '🥉 3° lugar', amount: payouts.prize3Cents },
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
