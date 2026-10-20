import { connection } from 'next/server'
import { requireAdminMfa } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { player2048ChileDay, player2048RetentionRange } from '@/lib/game/player-2048-retention'
import { get2048TrialServerSnapshot, type Trial2048ServerSnapshot } from '@/lib/analytics/2048-trial-server'
import { Trial2048Report } from '@/components/admin/2048-trial-report'

export const revalidate = 0

async function requestCalendar() {
  await connection()
  const to = player2048ChileDay(Date.now())
  return { from: new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10), to }
}

export default async function Trial2048ReportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdminMfa()
  const [params, defaults] = await Promise.all([searchParams, requestCalendar()])
  const implicit = params.from === undefined && params.to === undefined
  const range = Object.keys(params).some(key => key !== 'from' && key !== 'to') ? null
    : player2048RetentionRange(implicit ? defaults.from : params.from, implicit ? defaults.to : params.to)
  let snapshot: Trial2048ServerSnapshot | null = null
  if (range) {
    try { snapshot = await get2048TrialServerSnapshot(createAdminClient(), range) }
    catch { /* Unknown sources stay unknown; never expose database errors or credentials. */ }
  }
  return <Trial2048Report snapshot={snapshot} from={range?.from ?? defaults.from} to={range?.to ?? defaults.to}
    rangeError={range ? undefined : 'Indica from y to como fechas ISO, en un rango inclusivo de hasta 90 días. No se consultaron datos.'} />
}
