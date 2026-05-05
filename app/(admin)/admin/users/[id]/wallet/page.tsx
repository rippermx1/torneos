import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Profile, WalletTransaction, WalletTransactionType } from '@/types/database'

export const revalidate = 0

const TYPE_LABEL: Record<WalletTransactionType, string> = {
  deposit: 'Depósito',
  withdrawal: 'Retiro',
  ticket_debit: 'Inscripción',
  prize_credit: 'Premio',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
}

const TYPE_TONE: Record<WalletTransactionType, string> = {
  deposit: 'bg-green-100 text-green-700',
  prize_credit: 'bg-emerald-100 text-emerald-700',
  refund: 'bg-blue-100 text-blue-700',
  ticket_debit: 'bg-amber-100 text-amber-700',
  withdrawal: 'bg-purple-100 text-purple-700',
  adjustment: 'bg-slate-100 text-slate-700',
}

export default async function AdminUserWalletPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: userId } = await params
  const supabase = createAdminClient()

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  const profile = profileRow as Profile | null
  if (!profile) notFound()

  const [{ data: txData }, withdrawableRpc] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.rpc('wallet_withdrawable_balance', { p_user_id: userId }),
  ])

  const transactions = (txData ?? []) as WalletTransaction[]
  const currentBalance = transactions[0]?.balance_after_cents ?? 0
  const withdrawable = (withdrawableRpc.data as number | null) ?? 0

  const totals = transactions.reduce(
    (acc, t) => {
      acc[t.type] = (acc[t.type] ?? 0) + Number(t.amount_cents)
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">
          ← Usuarios
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Billetera · {profile.username}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.full_name ?? '—'} · RUT {profile.rut ?? '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Saldo total</p>
          <p className="text-2xl font-bold">{formatCLP(currentBalance)}</p>
        </div>
        <div className="border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Saldo retirable</p>
          <p className="text-2xl font-bold text-green-700">{formatCLP(withdrawable)}</p>
          <p className="text-xs text-muted-foreground">Premios + reembolsos − retiros</p>
        </div>
        <div className="border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Transacciones (200 últ.)</p>
          <p className="text-2xl font-bold">{transactions.length}</p>
        </div>
      </div>

      {/* Subtotales por tipo */}
      <div className="border rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Resumen por tipo
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {(Object.keys(TYPE_LABEL) as WalletTransactionType[]).map((t) => (
            <div key={t} className="flex items-center justify-between">
              <span className="text-muted-foreground">{TYPE_LABEL[t]}</span>
              <span className="font-mono">{formatCLP(totals[t] ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin movimientos registrados.</p>
      ) : (
        <div className="border rounded-xl divide-y overflow-hidden">
          <div className="grid grid-cols-[140px_120px_1fr_auto_auto] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
            <span>Fecha</span>
            <span>Tipo</span>
            <span>Referencia</span>
            <span className="text-right">Monto</span>
            <span className="text-right">Saldo después</span>
          </div>
          {transactions.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[140px_120px_1fr_auto_auto] gap-3 px-4 py-2.5 items-start text-sm"
            >
              <span className="text-xs text-muted-foreground">
                {formatDateTimeCL(t.created_at)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium self-start ${TYPE_TONE[t.type]}`}>
                {TYPE_LABEL[t.type]}
              </span>
              <div className="space-y-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {t.reference_type ? `${t.reference_type}` : '—'}
                  {t.reference_id ? ` · ${t.reference_id.slice(0, 8)}` : ''}
                </p>
                {Object.keys(t.metadata ?? {}).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      metadata
                    </summary>
                    <pre className="mt-1 bg-muted/40 rounded-md p-2 overflow-x-auto">
                      {JSON.stringify(t.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <span className={`text-right font-mono font-semibold ${Number(t.amount_cents) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {Number(t.amount_cents) >= 0 ? '+' : ''}{formatCLP(t.amount_cents)}
              </span>
              <span className="text-right font-mono text-muted-foreground">
                {formatCLP(t.balance_after_cents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
