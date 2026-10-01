import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireUserRole } from '@/lib/supabase/auth'
import { checkPlayWindow, PLAY_WINDOW_ERROR } from '@/lib/tournament/helpers'
import { Unity2048 } from '@/components/game/unity-2048'
import type { Tournament } from '@/types/database'

// Uses the same registration, authoritative engine and one-game limit as 2048 web.
export default async function UnityTournamentPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params, access = await requireUserRole(), db = createAdminClient()
  const [{data:t},{data:registration}] = await Promise.all([
    db.from('tournaments').select('*').eq('id',id).single(),
    db.from('registrations').select('id').eq('tournament_id',id).eq('user_id',access.userId).single(),
  ])
  if (!t) notFound()
  const tournament = t as Tournament
  if (tournament.game_type !== '2048_score') notFound()
  const window = checkPlayWindow(tournament)
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
    <h1 className="text-2xl font-bold">{tournament.name}</h1>
    <Link href={`/tournaments/${id}/leaderboard`} className="text-sm underline">Ver ranking</Link>
    {!registration ? <p>No estás inscrito en este torneo.</p> : !window.ok ? <p>{PLAY_WINDOW_ERROR[window.reason]}</p> : <Unity2048 tournament={{startUrl:`/api/tournaments/${id}/game/start`,moveUrl:`/api/tournaments/${id}/game/move`,timeoutUrl:`/api/tournaments/${id}/game/timeout`}} />}
  </div>
}
