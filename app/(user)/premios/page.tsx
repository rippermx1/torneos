import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { WalletTransaction } from '@/types/database'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MIN_WITHDRAWAL_CENTS } from '@/lib/wallet/limits'
import { maskBankAccount } from '@/lib/payouts/receipt'

// Página de premios y recompensas. Deliberadamente NO existe un "saldo":
// la plataforma no mantiene cuentas de dinero de usuarios. Lo que se muestra es
// (a) premios pendientes de pago (deuda de la plataforma con el ganador) y
// (b) recompensas promocionales canjeables por participaciones gratis.

const MOVEMENT_LABEL: Record<WalletTransaction['type'], string> = {
  deposit: 'Abono (histórico)',
  withdrawal: 'Pago de premios',
  ticket_debit: 'Inscripción (histórico)',
  prize_credit: 'Premio ganado',
  refund: 'Devolución',
  adjustment: 'Ajuste',
  tournament_credit: 'Recompensa',
}

function movementLabel(tx: WalletTransaction): string {
  if (tx.type === 'tournament_credit') {
    const kind = (tx.metadata as { kind?: string } | null)?.kind
    if (tx.amount_cents < 0) {
      return kind === 'expiry' ? 'Recompensa caducada' : 'Canje de participación gratis'
    }
    return kind === 'cancel_restore' ? 'Recompensa restituida (torneo cancelado)' : 'Recompensa por jugar'
  }
  return MOVEMENT_LABEL[tx.type]
}

export default async function PremiosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const adminSupabase = createAdminClient()
  const [
    { data },
    { data: withdrawableData },
    { data: creditData },
    { data: pendingPayout },
    { data: paidPayouts },
  ] = await Promise.all([
    adminSupabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    adminSupabase.rpc('wallet_withdrawable_balance', { p_user_id: user.id }),
    adminSupabase.rpc('wallet_credit_balance', { p_user_id: user.id }),
    adminSupabase
      .from('withdrawal_requests')
      .select('id, amount_cents, status, created_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])
      .maybeSingle(),
    adminSupabase
      .from('withdrawal_requests')
      .select('id, amount_cents, bank_name, bank_account, paid_at, receipt_number')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(10),
  ])

  const transactions = (data ?? []) as WalletTransaction[]
  const pendingPrizes = Number(withdrawableData ?? 0)
  const rewardCents = Number(creditData ?? 0)

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Mis premios</h1>
        <p className="text-sm text-muted-foreground">
          Los premios se pagan por transferencia bancaria a tu cuenta verificada. La plataforma no
          mantiene saldos ni acepta depósitos: cada participación se compra al momento.
        </p>
      </div>

      <div className="border rounded-xl p-5 space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Premios por cobrar</p>
            <p className="text-3xl font-bold mt-1">{formatCLP(pendingPrizes)}</p>
          </div>
          {pendingPayout ? (
            <div className="text-right">
              <p className="text-sm font-medium">Pago en proceso</p>
              <p className="text-xs text-muted-foreground">
                {formatCLP(pendingPayout.amount_cents)} ·{' '}
                {pendingPayout.status === 'approved' ? 'transferencia autorizada' : 'en revisión'}
              </p>
            </div>
          ) : pendingPrizes >= MIN_WITHDRAWAL_CENTS ? (
            <Link
              href="/premios/cobrar"
              className="bg-foreground text-background px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Cobrar mis premios
            </Link>
          ) : pendingPrizes > 0 ? (
            <p className="text-xs text-muted-foreground text-right max-w-[12rem]">
              El pago se habilita desde {formatCLP(MIN_WITHDRAWAL_CENTS)} en premios acumulados.
            </p>
          ) : null}
        </div>
      </div>

      {rewardCents > 0 && (
        <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-5 space-y-1.5">
          <p className="text-xs text-emerald-800 uppercase tracking-wide font-medium">Recompensas por jugar</p>
          <p className="text-sm text-emerald-900">
            Tienes una <span className="font-semibold">participación gratis</span> disponible en
            torneos con inscripción de hasta <span className="font-semibold">{formatCLP(rewardCents)}</span>.
          </p>
          <p className="text-xs text-emerald-800/80">
            Las recompensas se canjean al inscribirte (botón &quot;Canjear participación gratis&quot;), no son
            dinero ni transferibles, y caducan 30 días después de otorgadas.
          </p>
        </div>
      )}

      {(paidPayouts?.length ?? 0) > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Comprobantes de pago</h2>
          <div className="border rounded-xl divide-y">
            {paidPayouts?.map((payout) => (
              <div key={payout.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{payout.receipt_number ?? 'Pago de premio'}</p>
                  <p className="text-xs text-muted-foreground">
                    {payout.bank_name} · {maskBankAccount(payout.bank_account)} ·{' '}
                    {payout.paid_at ? formatDateTimeCL(payout.paid_at) : 'Fecha pendiente'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatCLP(payout.amount_cents)}</p>
                  <a
                    href={`/api/payouts/${payout.id}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    Ver comprobante
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-2">
        <h2 className="font-semibold">Historial</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos aún. ¡Gana un torneo para ver tu primer premio aquí!</p>
        ) : (
          <div className="border rounded-xl divide-y">
            {transactions.map((tx) => {
              const isCredit = tx.amount_cents > 0
              return (
                <div key={tx.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{movementLabel(tx)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTimeCL(tx.created_at)}</p>
                  </div>
                  <p className={`text-sm font-semibold shrink-0 ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                    {isCredit ? '+' : ''}{formatCLP(tx.amount_cents)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
