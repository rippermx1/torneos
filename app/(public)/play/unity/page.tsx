import { redirect } from 'next/navigation'
import { getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'

export const metadata = { title: '2048 — TorneosPlay' }
export default async function UnityPracticePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = getTournamentReturnPath((await searchParams).next)
  redirect(returnTo ? withAuthDestination('/play', returnTo) : '/play')
}
