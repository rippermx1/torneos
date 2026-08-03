import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { WithdrawalRequest } from '@/types/database'
import { PayoutActions } from '@/components/admin/payout-actions'
import { PayoutCompletionForm } from '@/components/admin/payout-completion-form'

const STATUS_STYLE: Record<WithdrawalRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<WithdrawalRequest['status'], string> = {
  pending: 'Pendiente',
  approved: 'Autorizado',
  paid: 'Pagado',
  rejected: 'Rechazado',
}

export default async function AdminPayoutsPage() {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const requests = (data ?? []) as WithdrawalRequest[]

  // Obtener usernames
  const userIds = [...new Set(requests.map((r) => r.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, rut, kyc_status')
    .in('id', userIds)

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p: { id: string; username: string; rut: string | null; kyc_status: string }) => [
      p.id,
      p,
    ])
  )

  const pending = requests.filter((r) => r.status === 'pending')
  const authorized = requests.filter((r) => r.status === 'approved')
  const rest = requests.filter((r) => r.status === 'paid' || r.status === 'rejected')

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Pagos de premios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {pending.length} por revisar · {authorized.length} autorizada{authorized.length !== 1 ? 's' : ''} por transferir. La autorización y la salida bancaria se registran por separado.
        </p>
      </div>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes de revisión
          </h2>
          {pending.map((r) => {
            const profile = profileMap[r.user_id] as { username: string; rut: string | null; kyc_status: string } | undefined
            return (
              <div key={r.id} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{profile?.username ?? r.user_id.slice(0, 8)}</span>
                      {profile?.kyc_status !== 'approved' && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                          KYC: {profile?.kyc_status ?? '—'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      RUT: {profile?.rut ?? '—'} · Solicitado: {formatDateTimeCL(r.created_at)}
                    </p>
                  </div>
                  <p className="text-xl font-bold shrink-0">{formatCLP(r.amount_cents)}</p>
                </div>

                <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                  <p><span className="text-muted-foreground">Banco:</span> {r.bank_name}</p>
                  <p><span className="text-muted-foreground">Cuenta:</span> {r.bank_account}</p>
                  <p><span className="text-muted-foreground">Titular:</span> {r.account_holder}</p>
                  <p><span className="text-muted-foreground">RUT titular:</span> {r.account_rut}</p>
                </div>

                <PayoutActions requestId={r.id} />
              </div>
            )
          })}
        </section>
      )}

      {authorized.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Autorizados · pendientes de transferencia
          </h2>
          {authorized.map((r) => {
            const profile = profileMap[r.user_id] as { username: string } | undefined
            return (
              <div key={r.id} className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{profile?.username ?? r.account_holder}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.account_holder} · {r.account_rut} · {r.bank_name} · {r.bank_account}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Autorizado: {r.reviewed_at ? formatDateTimeCL(r.reviewed_at) : '—'}
                    </p>
                  </div>
                  <p className="text-xl font-bold shrink-0">{formatCLP(r.amount_cents)}</p>
                </div>
                <PayoutCompletionForm requestId={r.id} />
              </div>
            )
          })}
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historial</h2>
          <div className="border rounded-xl divide-y overflow-hidden">
            {rest.map((r) => {
              const profile = profileMap[r.user_id] as { username: string } | undefined
              return (
                <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {profile?.username ?? '—'} · {r.bank_name}
                  </span>
                  <span className="font-semibold shrink-0">{formatCLP(r.amount_cents)}</span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {formatDateTimeCL(r.paid_at ?? r.reviewed_at ?? r.created_at)}
                  </span>
                  {r.status === 'paid' && (
                    <span className="flex gap-2 text-xs">
                      <a href={`/api/payouts/${r.id}/receipt`} target="_blank" rel="noreferrer" className="underline">
                        {r.receipt_number ?? 'Comprobante'}
                      </a>
                      {r.proof_storage_path ? (
                        <a href={`/api/admin/payouts/${r.id}/proof`} target="_blank" rel="noreferrer" className="underline">
                          Evidencia bancaria
                        </a>
                      ) : (
                        <span className="text-amber-700">Sin evidencia (legado)</span>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {requests.length === 0 && (
        <p className="text-muted-foreground text-sm">No hay solicitudes de retiro.</p>
      )}
    </div>
  )
}
