import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { readAccountingPackage, validAccountingPeriod } from '@/lib/accounting/operations'
import { AccountingWorkspace } from '@/components/admin/accounting-workspace'

export const revalidate = 0
export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams
  const period = params.period && validAccountingPeriod(params.period) ? params.period : new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date())
  const pack = await readAccountingPackage(createAdminClient(), period)
  return <div className="max-w-7xl space-y-5">
    <div><h1 className="text-2xl font-bold">Contabilidad de la empresa</h1>
      <p className="text-sm text-muted-foreground mt-2">Registra gastos, aportes y liquidaciones. Concilia con cartola y documentos antes de aprobar cada cierre. Los documentos tributarios se emiten y verifican fuera de la plataforma.</p>
      <Link href="/admin/reports" className="text-sm underline">Ver cobros e impuestos de torneos</Link></div>
    <AccountingWorkspace pack={pack} period={period} />
  </div>
}
