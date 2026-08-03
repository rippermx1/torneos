import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCLP } from '@/lib/utils'
import { MIN_WITHDRAWAL_CENTS, MAX_WITHDRAWAL_CENTS } from '@/lib/wallet/limits'
import { CobrarForm } from './cobrar-form'

// Cobro de premios: la plataforma paga por transferencia el total de premios
// adeudados (hasta el máximo por solicitud). No hay montos a elección: no es
// una cuenta que se administra, es una deuda que se paga.

export default async function CobrarPremiosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()
  const [{ data: withdrawableData }, { data: pendingPayout }] = await Promise.all([
    admin.rpc('wallet_withdrawable_balance', { p_user_id: user.id }),
    admin
      .from('withdrawal_requests')
      .select('id, amount_cents, status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])
      .maybeSingle(),
  ])

  const pendingPrizes = Number(withdrawableData ?? 0)
  const payoutCents = Math.min(pendingPrizes, MAX_WITHDRAWAL_CENTS)

  if (pendingPayout) {
    return (
      <div className="max-w-sm space-y-4">
        <div className="border rounded-xl p-6 text-center space-y-3">
          <h2 className="text-lg font-semibold">Ya tienes un pago en proceso</h2>
          <p className="text-sm text-muted-foreground">
            Estamos procesando el pago de {formatCLP(pendingPayout.amount_cents)}.{' '}
            {pendingPayout.status === 'approved'
              ? 'La transferencia ya fue autorizada y está pendiente de confirmación bancaria.'
              : 'Se acreditará en tu cuenta bancaria después de la revisión.'}
          </p>
        </div>
        <Link
          href="/premios"
          className="block w-full text-center border rounded-xl py-3 text-sm hover:bg-muted transition-colors"
        >
          Volver a mis premios
        </Link>
      </div>
    )
  }

  if (pendingPrizes < MIN_WITHDRAWAL_CENTS) {
    return (
      <div className="max-w-sm space-y-4">
        <div className="border rounded-xl p-6 text-center space-y-3">
          <h2 className="text-lg font-semibold">Aún no alcanzas el mínimo de pago</h2>
          <p className="text-sm text-muted-foreground">
            Tienes {formatCLP(pendingPrizes)} en premios por cobrar. El pago se habilita desde{' '}
            {formatCLP(MIN_WITHDRAWAL_CENTS)} acumulados.
          </p>
        </div>
        <Link
          href="/tournaments"
          className="block w-full text-center bg-foreground text-background rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Ver torneos
        </Link>
      </div>
    )
  }

  return (
    <CobrarForm
      payoutCents={payoutCents}
      remainingCents={pendingPrizes - payoutCents}
    />
  )
}
