import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { Tournament } from '@/types/database'
import Link from 'next/link'
import { RegisterButton } from '@/components/tournament/register-button'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { getTournamentAvailability, normalizeRegistrationCount } from '@/lib/tournament/availability'
import { AvailabilityBadge } from '@/components/tournament/tournament-card'
import { CatalogFeedback } from '@/components/tournament/catalog-feedback'
import { withAuthDestination } from '@/lib/auth/redirect'
import { SKILL_TIER_LABELS } from '@/lib/tournament/rating'
import { communityFreeLatestStartMs, isCommunityFreePresetKey, isCommunityFreeTournament } from '@/lib/tournament/community-free'
import {
  getParticipationBlocker,
  type ParticipationBlocker,
  type ParticipationProfile,
} from '@/lib/tournament/readiness'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('name, description, preset_key, prize_1st_cents, prize_2nd_cents, prize_3rd_cents, entry_fee_cents')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') return { title: 'Torneo — TorneosPlay' }
  if (!data) return { title: 'Torneo no encontrado — TorneosPlay' }

  const t = data as Pick<
    Tournament,
    'name' | 'description' | 'preset_key' | 'prize_1st_cents' | 'prize_2nd_cents' | 'prize_3rd_cents' | 'entry_fee_cents'
  >
  const totalPrize = t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
  const description =
    t.description || (isCommunityFreePresetKey(t.preset_key)
      ? 'Reto comunitario gratuito de 2048: un intento de cinco minutos, clasificación por el servidor y sin premios.'
      : `Premio ${formatCLP(totalPrize)} · Inscripción ${formatCLP(t.entry_fee_cents)}. Compite en el torneo de 2048 con premios reales en CLP.`)

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
  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { /* Availability remains unknown without a service key. */ }
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const [{ data: tData, error: tournamentError }, { count: playerCount, error: countError }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    admin ? admin
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', id) : Promise.resolve({ count: null, error: true }),
  ])

  if (tournamentError && tournamentError.code !== 'PGRST116') {
    return <div className="mx-auto max-w-2xl px-4 py-10"><CatalogFeedback error retryHref={`/tournaments/${id}`} /></div>
  }
  if (!tData) notFound()
  const t = tData as Tournament
  if (t.game_type !== '2048_score') notFound()
  const community = isCommunityFreeTournament(t)

  // Verificar si el usuario está inscrito (necesita admin para bypassear RLS)
  let isRegistered = false
  let creditBalanceCents = 0
  let participationProfile: ParticipationProfile | null = null
  let hasPendingKycSubmission = false
  let hasExistingGame = false
  if (userId && admin) {
    const [
      { data: reg },
      { data: profile },
      { data: credit },
      { count: pendingKycCount },
      { data: existingGame },
    ] = await Promise.all([
      admin
        .from('registrations')
        .select('id')
        .eq('tournament_id', id)
        .eq('user_id', userId)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('username, birth_date, kyc_status, is_banned')
        .eq('id', userId)
        .maybeSingle(),
      t.entry_fee_cents > 0
        ? admin.rpc('wallet_credit_balance', { p_user_id: userId })
        : Promise.resolve({ data: 0 }),
      t.entry_fee_cents > 0
        ? admin
            .from('kyc_submissions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
      admin.from('games').select('id').eq('tournament_id', id).eq('user_id', userId).maybeSingle(),
    ])

    isRegistered = !!reg
    creditBalanceCents = Number(credit ?? 0)
    hasPendingKycSubmission = (pendingKycCount ?? 0) > 0
    hasExistingGame = !!existingGame

    if (profile) {
      participationProfile = {
        username: profile.username,
        birthDate: profile.birth_date,
        kycStatus: profile.kyc_status,
        isBanned: profile.is_banned,
      }
    }
  }

  const currentPlayerCount = countError ? null : normalizeRegistrationCount(playerCount)
  const availability = getTournamentAvailability({ ...t, registeredCount: currentPlayerCount })
  const playWindow = checkPlayWindow(t)
  const canRegister = availability.canRegister
  const inPlayWindow = playWindow.ok && availability.kind === 'live'
  const hasMinimumPlayers = currentPlayerCount !== null && currentPlayerCount >= t.min_players
  const tournamentHref = `/tournaments/${id}`
  const lastStartAt = communityFreeLatestStartMs(t) ?? Date.parse(t.play_window_end)
  const newStartsClosed = community && communityStartCutoffPassed(t)
  const participationBlocker = userId
    ? getParticipationBlocker({
        emailConfirmed: Boolean(user?.email_confirmed_at),
        profile: participationProfile,
        entryFeeCents: t.entry_fee_cents,
        hasPendingKycSubmission,
      })
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-2">
        <Link href="/tournaments" className="text-sm underline underline-offset-4">← Ver torneos</Link>
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{community ? '2048 · reto comunitario gratuito' : '2048'}</span><AvailabilityBadge availability={availability} /></div>
        <h1 className="text-3xl font-bold">{t.name}</h1>
        {!community && t.skill_tier && (
          <span className="inline-block text-xs font-medium bg-muted text-foreground rounded-full px-2.5 py-1">
            División {SKILL_TIER_LABELS[t.skill_tier]}
          </span>
        )}
        {t.description && <p className="text-muted-foreground">{t.description}</p>}
        <div className="flex flex-wrap gap-4 pt-2 text-sm font-medium">
          <a href="#participar" className="underline underline-offset-4">Ver inscripción y ranking</a>
          <Link href={withAuthDestination('/play', tournamentHref)} className="underline underline-offset-4">Practicar 2048 gratis</Link>
        </div>
      </div>

      {/* Info principal */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard label="Inscripción" value={community ? 'Gratis' : formatCLP(t.entry_fee_cents)} highlight />
        {community ? <InfoCard label="Modalidad" value="Clasificación sin premios" />
          : <InfoCard label="Premio total fijo" value={formatCLP(t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)} />}
        <InfoCard label="Jugadores" value={currentPlayerCount === null ? 'Por confirmar' : `${currentPlayerCount} / ${t.max_players}`} />
        <InfoCard label="Mínimo para jugar" value={`${t.min_players} jugadores`} />
      </div>

      <p className="text-sm text-muted-foreground">
        {availability.slots === null ? 'No pudimos confirmar los cupos. Actualiza para consultar la disponibilidad.'
          : ['live', 'closed', 'completed', 'cancelled'].includes(availability.kind) ? 'Inscripción cerrada. Puedes consultar el ranking del torneo.'
          : `${availability.slots} cupos libres. Los cupos se confirman al inscribirte.`}
        {availability.slots === null && <a href={tournamentHref} className="ml-2 font-medium underline">Actualizar disponibilidad</a>}
      </p>

      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">Antes de participar</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Una partida de 2048 por participante. Puedes reanudarla mientras quede tiempo; no puedes iniciar otra después de terminar.</li>
          <li>{community ? `Cada intento dispone de cinco minutos completos. Debes comenzar hasta ${formatDateTimeCL(new Date(lastStartAt))}; recuperar tu partida conserva su plazo original.` : `Tienes hasta ${t.max_game_duration_seconds / 60} minutos desde el inicio de tu partida, o hasta el cierre del torneo si ocurre antes.`}</li>
          <li>El servidor calcula el puntaje. Se clasifica por mayor puntaje, luego mayor ficha y después menos movimientos. Un empate completo se resuelve con el orden estable del identificador de participante.</li>
          <li>{community ? 'Solo las partidas válidas completadas participan en la clasificación final. No hay premios ni cambios en tu división de torneos pagados.' : 'Solo las partidas válidas completadas participan en la clasificación final. Los premios son fijos; consulta su distribución abajo.'}</li>
          <li>Si no se alcanza el mínimo de {t.min_players} participantes al inicio, {community ? 'el reto se cancela sin cobros ni reembolsos.' : 'el torneo se cancela. Las inscripciones pagadas se reembolsan según la política publicada.'}</li>
          <li>Debes tener 18 años, confirmar tu correo y aceptar las bases. {community ? 'No se requiere verificación financiera ni datos bancarios. ' : 'Las inscripciones pagadas requieren verificación de identidad. '}El uso de bots o la manipulación de partidas puede causar descalificación.</li>
          {community && <li>2048 incorpora azar. El puntaje y los desempates se calculan en el servidor; una semilla compartida no garantiza igualdad absoluta de oportunidades.</li>}
        </ul>
        <Link href="/legal/terminos" className="inline-block text-sm font-medium underline underline-offset-4">Leer bases completas</Link>
        {!community && <Link href="/legal/reembolso" className="ml-4 inline-block text-sm underline underline-offset-4">Política de reembolso</Link>}
      </section>

      {t.entry_fee_cents > 0 && (
        <div className="border rounded-xl p-5 space-y-2 text-sm">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Precio y premio transparentes</h2>
          <p className="text-muted-foreground">
            La inscripción es el precio final e incluye IVA. El premio ya está fijado y no aumenta ni disminuye según la cantidad de inscritos.
          </p>
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
      {!community && <div className="border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Premios
        </h2>
        <p className="text-xs text-muted-foreground">
          Los montos son fijos, están publicados antes de la inscripción y no dependen de la recaudación final.
        </p>
        <div className="space-y-2">
          {[
            { place: '🥇 1° lugar', amount: t.prize_1st_cents },
            { place: '🥈 2° lugar', amount: t.prize_2nd_cents },
            { place: '🥉 3° lugar', amount: t.prize_3rd_cents },
          ]
            .filter((p) => p.amount > 0)
            .map(({ place, amount }) => (
              <div key={place} className="flex justify-between text-sm">
                <span>{place}</span>
                <span className="font-semibold">{formatCLP(amount)}</span>
              </div>
            ))}
        </div>
      </div>}

      {/* Fechas */}
      <div className="border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Fechas</h2>
        <p className="text-xs text-muted-foreground">Horarios de Chile (Santiago).</p>
        <div className="space-y-2 text-sm">
          <DateRow label="Inscripciones abren" value={formatDateTimeCL(t.registration_opens_at)} />
          <DateRow label="Inscripciones cierran" value={formatDateTimeCL(t.play_window_start)} />
          <DateRow label="Inicio de partidas" value={formatDateTimeCL(t.play_window_start)} />
          <DateRow label="Cierre de partidas" value={formatDateTimeCL(t.play_window_end)} />
          {community && <DateRow label="Último inicio de un intento nuevo" value={formatDateTimeCL(new Date(lastStartAt))} />}
          <DateRow label="Duración máxima" value={`${t.max_game_duration_seconds / 60} minutos`} />
        </div>
      </div>

      {/* Acciones */}
      <div id="participar" className="scroll-mt-20 flex flex-col sm:flex-row gap-3">
        {!userId && canRegister ? (
          <Link
            href={withAuthDestination('/sign-up', tournamentHref)}
            className="flex-1 text-center bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Crear cuenta para inscribirme
          </Link>
        ) : !userId && inPlayWindow ? (
          <Link
            href={withAuthDestination('/sign-in', tournamentHref)}
            className="flex-1 text-center bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Iniciar sesión si ya estás inscrito
          </Link>
        ) : !userId ? (
          <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
            {availability.label}
          </div>
        ) : isRegistered ? (
          <>
            <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
              ✓ Inscrito
            </div>
            {inPlayWindow && hasMinimumPlayers && (!newStartsClosed || hasExistingGame) ? (
              <Link
                href={`/tournaments/${id}/play`}
                className="flex-1 text-center bg-amber-500 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
              >
                {hasExistingGame ? 'Abrir mi partida' : 'Jugar ahora'}
              </Link>
            ) : inPlayWindow ? (
              <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
                {newStartsClosed ? 'Terminó el plazo para iniciar un intento nuevo.' : currentPlayerCount === null ? 'Actualiza para confirmar la disponibilidad de juego.' : community ? 'Mínimo no alcanzado; consulta el estado del reto.' : 'Mínimo no alcanzado; consulta el estado y la política de reembolso.'}
              </div>
            ) : (
              <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
                {!playWindow.ok && playWindow.reason === 'window_not_open'
                  ? 'Partidas aún no abiertas'
                  : 'Partidas cerradas'}
              </div>
            )}
          </>
        ) : canRegister && participationBlocker ? (
          <ParticipationBlockerCard blocker={participationBlocker} tournamentHref={tournamentHref} />
        ) : canRegister ? (
          <RegisterButton
            tournamentId={id}
            entryFeeCents={t.entry_fee_cents}
            creditBalanceCents={creditBalanceCents}
            returnTo={tournamentHref}
            communityFree={community}
            className="flex-1"
          />
        ) : (
          <div className="flex-1 text-center border rounded-xl py-3 text-sm text-muted-foreground">
            {availability.label}
          </div>
        )}

        <Link
          href={`/tournaments/${id}/leaderboard`}
          className="flex-1 text-center border rounded-xl py-3 text-sm font-medium hover:bg-muted transition-colors"
        >
          Ver ranking
        </Link>
      </div>
      <Link href={withAuthDestination('/play', tournamentHref)} className="block rounded-xl border bg-muted/20 p-5 text-center text-sm font-medium hover:bg-muted">
        Practicar 2048 gratis y volver a este torneo
      </Link>
    </div>
  )
}

// Display snapshot only; admission and recovery remain authoritative in the API.
function communityStartCutoffPassed(tournament: Tournament, now = Date.now()) {
  const latestStart = communityFreeLatestStartMs(tournament)
  return latestStart !== null && now > latestStart
}

function ParticipationBlockerCard({ blocker, tournamentHref }: { blocker: ParticipationBlocker; tournamentHref: string }) {
  return (
    <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{blocker.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">{blocker.detail}</p>
      {blocker.href && blocker.actionLabel && (
        <Link
          href={blocker.kind === 'email' || blocker.kind === 'onboarding' ? withAuthDestination(blocker.href, tournamentHref) : blocker.href}
          className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-xs font-medium hover:bg-white"
        >
          {blocker.actionLabel}
        </Link>
      )}
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
