import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTimeCL } from '@/lib/utils'
import { KycActions } from './kyc-actions'
import type { Profile } from '@/types/database'

export const revalidate = 0

const KYC_BADGE: Record<Profile['kyc_status'], string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const KYC_LABEL: Record<Profile['kyc_status'], string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export default async function AdminUsersPage() {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const profiles = (data ?? []) as Profile[]

  const pending  = profiles.filter((p) => p.kyc_status === 'pending')
  const approved = profiles.filter((p) => p.kyc_status === 'approved')
  const rejected = profiles.filter((p) => p.kyc_status === 'rejected')

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Usuarios y KYC</h1>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            {pending.length} pendientes
          </span>
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            {approved.length} aprobados
          </span>
        </div>
      </div>

      {/* Pendientes primero */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes de revisión ({pending.length})
          </h2>
          <UserTable profiles={pending} showActions />
        </section>
      )}

      {/* Aprobados */}
      {approved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Aprobados ({approved.length})
          </h2>
          <UserTable profiles={approved} />
        </section>
      )}

      {/* Rechazados */}
      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rechazados ({rejected.length})
          </h2>
          <UserTable profiles={rejected} showActions />
        </section>
      )}
    </div>
  )
}

function UserTable({ profiles, showActions = false }: { profiles: Profile[]; showActions?: boolean }) {
  return (
    <div className="border rounded-xl divide-y overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
        <span>Usuario</span>
        <span>Datos KYC</span>
        <span className="text-center">Estado</span>
        <span className="text-right">Registro</span>
        {showActions && <span />}
      </div>
      {profiles.map((p) => (
        <div
          key={p.id}
          className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-4 py-3 items-start text-sm"
        >
          {/* Usuario */}
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium truncate">{p.username}</p>
            <p className="text-xs text-muted-foreground truncate">{p.full_name ?? '—'}</p>
            {p.is_admin && (
              <span className="inline-block text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                Admin
              </span>
            )}
          </div>

          {/* Datos KYC */}
          <div className="space-y-0.5 text-xs text-muted-foreground min-w-0">
            <p>RUT: <span className="text-foreground">{p.rut ?? '—'}</span></p>
            <p>Tel: <span className="text-foreground">{p.phone ?? '—'}</span></p>
            <p>Ciudad: <span className="text-foreground">{p.city ?? '—'}</span></p>
            {p.birth_date && <p>Nac: <span className="text-foreground">{p.birth_date}</span></p>}
          </div>

          {/* Badge estado */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap self-start ${KYC_BADGE[p.kyc_status]}`}>
            {KYC_LABEL[p.kyc_status]}
          </span>

          {/* Fecha */}
          <span className="text-xs text-muted-foreground whitespace-nowrap self-start">
            {formatDateTimeCL(p.created_at)}
          </span>

          {/* Acciones */}
          {showActions ? (
            <KycActions userId={p.id} currentStatus={p.kyc_status} />
          ) : (
            <div />
          )}
        </div>
      ))}
    </div>
  )
}
