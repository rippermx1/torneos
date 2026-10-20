import { Retention2048ReportView } from '@/components/admin/2048-retention-report'
import { player2048ChileDay } from '@/lib/game/player-2048-retention'
import { connection } from 'next/server'

async function requestCalendar() {
  await connection()
  const to = player2048ChileDay(Date.now())
  return { to, from: new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10) }
}

// The existing admin layout and the report API each enforce admin MFA.
export default async function Retention2048ReportPage() {
  const { from, to } = await requestCalendar()
  return <Retention2048ReportView initialFrom={from} initialTo={to} />
}
