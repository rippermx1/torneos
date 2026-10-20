import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireUserRole } from '@/lib/supabase/auth'
import { checkPlayWindow, PLAY_WINDOW_ERROR } from '@/lib/tournament/helpers'
import { Unity2048 } from '@/components/game/unity-2048'
import type { Tournament } from '@/types/database'
import { isCommunityFreeTournament } from '@/lib/tournament/community-free'

// Unity is the canonical client; the platform owns access, the game and its result.
export default async function UnityTournamentPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params, access = await requireUserRole(), db = createAdminClient()
  const [{data:t},{data:registration},{data:existingGame,error:gameError}] = await Promise.all([
    db.from('tournaments').select('*').eq('id',id).single(),
    db.from('registrations').select('id').eq('tournament_id',id).eq('user_id',access.userId).single(),
    db.from('games').select('id').eq('tournament_id',id).eq('user_id',access.userId).maybeSingle(),
  ])
  if (!t) notFound()
  const tournament = t as Tournament
  if (tournament.game_type !== '2048_score') notFound()
  const window = checkPlayWindow(tournament)
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
    <h1 className="text-2xl font-bold">{tournament.name}</h1>
    {isCommunityFreeTournament(tournament) && <p className="text-sm text-muted-foreground">Reto comunitario gratuito · un intento de cinco minutos · sin premios. El resultado y la clasificación los confirma el servidor.</p>}
    <Link href={`/tournaments/${id}/leaderboard`} className="text-sm underline">Ver ranking</Link>
    {!registration ? <p>No estás inscrito en este torneo.</p> : gameError ? <p>No se pudo comprobar tu partida. Recarga para consultar su estado.</p> : !window.ok && !existingGame ? <p>{PLAY_WINDOW_ERROR[window.reason]}</p> : <Unity2048 tournament={{startUrl:`/api/tournaments/${id}/game/start`,moveUrl:`/api/tournaments/${id}/game/move`,timeoutUrl:`/api/tournaments/${id}/game/timeout`,existingGameId:existingGame?.id,resultsUrl:`/api/tournaments/${id}/leaderboard`,leaderboardUrl:`/tournaments/${id}/leaderboard`,presetKey:tournament.preset_key}} />}
  </div>
}
