import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTimeCL } from '@/lib/utils'
import { KycActions } from './kyc-actions'
import { BanActions } from './ban-actions'
import type { KycSubmission, Profile } from '@/types/database'

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
  const profileIds = profiles.map((p) => p.id)

  const { data: submissionRows } = profileIds.length > 0
    ? await supabase
      .from('kyc_submissions')
      .select('*')
      .in('user_id', profileIds)
      .order('created_at', { ascending: false })
    : { data: [] }

  const latestSubmissionByUser = new Map<string, KycSubmission>()
  for (const submission of (submissionRows ?? []) as KycSubmission[]) {
    if (!latestSubmissionByUser.has(submission.user_id)) {
      latestSubmissionByUser.set(submission.user_id, submission)
    }
  }

  const submissionsByUser = Object.fromEntries(
    await Promise.all(
      [...latestSubmissionByUser.entries()].map(async ([userId, submission]) => [
        userId,
        {
          ...submission,
          document_front_signed_url: await createKycDocumentUrl(supabase, submission.document_front_path),
          document_back_signed_url: await createKycDocumentUrl(supabase, submission.document_back_path),
        },
      ])
    )
  ) as Record<string, KycSubmissionWithUrls>

  const pending  = profiles.filter((p) => p.kyc_status === 'pending')
  const approved = profiles.filter((p) => p.kyc_status === 'approved')
  const rejected = profiles.filter((p) => p.kyc_status === 'rejected')
  const banned   = profiles.filter((p) => p.is_banned)

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Usuarios y KYC</h1>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            {pending.length} pendientes
          </span>
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            {approved.length} aprobados
          </span>
          {banned.length > 0 && (
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {banned.length} baneados
            </span>
          )}
        </div>
      </div>

      {/* Baneados primero si hay */}
      {banned.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-600">
            Cuentas baneadas ({banned.length})
          </h2>
          <UserTable profiles={banned} submissionsByUser={submissionsByUser} showActions />
        </section>
      )}

      {/* Pendientes */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes de revisión ({pending.length})
          </h2>
          <UserTable profiles={pending} submissionsByUser={submissionsByUser} showActions />
        </section>
      )}

      {/* Aprobados */}
      {approved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Aprobados ({approved.length})
          </h2>
          <UserTable profiles={approved} submissionsByUser={submissionsByUser} />
        </section>
      )}

      {/* Rechazados */}
      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rechazados ({rejected.length})
          </h2>
          <UserTable profiles={rejected} submissionsByUser={submissionsByUser} showActions />
        </section>
      )}
    </div>
  )
}

type KycSubmissionWithUrls = KycSubmission & {
  document_front_signed_url: string | null
  document_back_signed_url: string | null
}

async function createKycDocumentUrl(
  supabase: ReturnType<typeof createAdminClient>,
  path: string | null
): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(path, 10 * 60)

  return data?.signedUrl ?? null
}

function UserTable({
  profiles,
  submissionsByUser,
  showActions = false,
}: {
  profiles: Profile[]
  submissionsByUser: Record<string, KycSubmissionWithUrls>
  showActions?: boolean
}) {
  return (
    <div className="border rounded-xl divide-y overflow-hidden">
      <div className="grid grid-cols-[1fr_1.35fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
        <span>Usuario</span>
        <span>Datos KYC</span>
        <span className="text-center">KYC</span>
        <span className="text-right">Registro</span>
        {showActions ? <span className="text-center">KYC</span> : <span />}
        <span className="text-center">Acceso</span>
      </div>
      {profiles.map((p) => {
        const submission = submissionsByUser[p.id]
        return (
          <div
            key={p.id}
            className={`grid grid-cols-[1fr_1.35fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-start text-sm ${p.is_banned ? 'bg-red-50/40' : ''}`}
          >
          {/* Usuario */}
          <div className="space-y-0.5 min-w-0">
            <Link href={`/admin/users/${p.id}/wallet`} className="font-medium truncate hover:underline block">
              {p.username}
            </Link>
            <p className="text-xs text-muted-foreground truncate">{p.full_name ?? '—'}</p>
            <div className="flex gap-1 flex-wrap">
              {p.is_admin && (
                <span className="inline-block text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                  Admin
                </span>
              )}
              {p.is_banned && (
                <span className="inline-block text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                  BANEADO
                </span>
              )}
            </div>
          </div>

          {/* Datos KYC */}
          <div className="space-y-0.5 text-xs text-muted-foreground min-w-0">
            <p>RUT: <span className="text-foreground">{p.rut ?? '—'}</span></p>
            <p>Tel: <span className="text-foreground">{p.phone ?? '—'}</span></p>
            <p>Ciudad: <span className="text-foreground">{p.city ?? '—'}</span></p>
            {p.birth_date && <p>Nac: <span className="text-foreground">{p.birth_date}</span></p>}
            {submission ? (
              <div className="pt-1 space-y-0.5">
                <p>
                  Doc: <span className="text-foreground">{submission.document_type}</span>
                  {' · '}
                  <span className="text-foreground">{submission.document_number}</span>
                </p>
                <p>
                  Banco KYC:{' '}
                  <span className="text-foreground">{submission.bank_account_holder}</span>
                  {' · '}
                  <span className="text-foreground">{submission.bank_account_rut}</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {submission.document_front_signed_url ? (
                    <a
                      href={submission.document_front_signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 text-foreground"
                    >
                      Frente
                    </a>
                  ) : <span>Frente: —</span>}
                  {submission.document_back_signed_url ? (
                    <a
                      href={submission.document_back_signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 text-foreground"
                    >
                      Reverso
                    </a>
                  ) : <span>Reverso: —</span>}
                </div>
                {submission.review_notes && (
                  <p>Nota: <span className="text-foreground">{submission.review_notes}</span></p>
                )}
              </div>
            ) : (
              <p className="pt-1 text-red-600">Sin evidencia documental</p>
            )}
          </div>

          {/* Badge estado KYC */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap self-start ${KYC_BADGE[p.kyc_status]}`}>
            {KYC_LABEL[p.kyc_status]}
          </span>

          {/* Fecha */}
          <span className="text-xs text-muted-foreground whitespace-nowrap self-start">
            {formatDateTimeCL(p.created_at)}
          </span>

          {/* Acciones KYC */}
          {showActions ? (
            <KycActions userId={p.id} currentStatus={p.kyc_status} />
          ) : (
            <div />
          )}

          {/* Ban/Unban */}
          <BanActions userId={p.id} isBanned={p.is_banned} isAdmin={p.is_admin} />
          </div>
        )
      })}
    </div>
  )
}
