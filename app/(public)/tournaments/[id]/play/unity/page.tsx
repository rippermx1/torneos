import { redirect } from 'next/navigation'

// Preserve bookmarks without mounting another client or starting another game.
export default async function UnityTournamentAlias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/tournaments/${encodeURIComponent(id)}/play`)
}
