import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { WalletTransaction } from '@/types/database'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const TYPE_LABEL: Record<WalletTransaction['type'], string> = {
  deposit: 'Abono',
  withdrawal: 'Retiro',
  ticket_debit: 'Inscripción a torneo',
  prize_credit: 'Premio',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
}

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const adminSupabase = createAdminClient()
  const [{ data }, { data: withdrawableData }] = await Promise.all([
    adminSupabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    adminSupabase.rpc('wallet_withdrawable_balance', { p_user_id: user.id }),
  ])

  const transactions = (data ?? []) as WalletTransaction[]
  const balance = transactions[0]?.balance_after_cents ?? 0
  const withdrawable = Number(withdrawableData ?? 0)

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mi saldo</h1>
          <p className="text-3xl font-bold mt-1">{formatCLP(balance)}</p>
          <p className="text-sm text-muted-foreground">Saldo disponible</p>
          <p className="text-xs text-muted-foreground mt-1">
            Retirable: <span className="font-medium">{formatCLP(withdrawable)}</span>
            <span className="ml-1">(premios ganados)</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/wallet/withdraw"
            className="bg-foreground text-background px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Retirar
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Historial</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos aún.</p>
        ) : (
          <div className="border rounded-xl divide-y">
            {transactions.map((tx) => {
              const isCredit = tx.amount_cents > 0
              return (
                <div key={tx.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{TYPE_LABEL[tx.type]}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTimeCL(tx.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                      {isCredit ? '+' : ''}{formatCLP(tx.amount_cents)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatCLP(tx.balance_after_cents)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
