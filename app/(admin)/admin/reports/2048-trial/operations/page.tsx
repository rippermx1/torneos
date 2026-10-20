import { connection } from 'next/server'
import { requireAdminMfa } from '@/lib/supabase/admin-mfa'
import { player2048ChileDay } from '@/lib/game/player-2048-retention'
import { Trial2048Operations } from '@/components/admin/2048-trial-operations'

export const revalidate = 0

async function requestDay() {
  await connection()
  return player2048ChileDay(Date.now())
}

export default async function Trial2048OperationsPage() {
  await requireAdminMfa()
  const asOfDay = await requestDay()
  return <Trial2048Operations asOfDay={asOfDay} practiceUrl="https://torneos-dev.vercel.app/play" />
}
