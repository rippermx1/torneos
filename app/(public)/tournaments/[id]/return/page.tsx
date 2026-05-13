import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP } from '@/lib/utils'

// ───────────────────────────────────────────────────────────────
// Página de retorno tras checkout Flow para inscripción a torneo.
// Flow redirige aquí con ?token=... cuando el usuario vuelve del
// gateway. La acreditación autoritativa la hace el webhook; esta
// página solo refleja el estado actual del flow_payment_attempt.
// No requiere sesión activa: el token Flow es el identificador
// seguro del intento (unguessable, generado por Flow).
// ───────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function TournamentReturnPage({ params, searchParams }: Props) {
  const { id: tournamentId } = await params
  const { token } = await searchParams

  const admin = createAdminClient()

  let attempt: {
    status: string
    net_amount_cents: number
    charged_amount_cents: number
    settled_at: string | null
  } | null = null

  if (token) {
    const { data } = await admin
      .from('flow_payment_attempts')
      .select('status, net_amount_cents, charged_amount_cents, settled_at')
      .eq('flow_token', token)
      .eq('tournament_id', tournamentId)
      .maybeSingle()
    attempt = data
  }

  const status = attempt?.status ?? 'pending'

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border border-foreground/10 bg-background p-6 text-center">
        {status === 'credited' ? (
          <>
            <h1 className="text-2xl font-semibold">¡Inscripción confirmada!</h1>
            <p className="mt-2 text-sm text-foreground/70">
              Pagaste {attempt ? formatCLP(attempt.charged_amount_cents) : ''} y ya estás dentro del torneo.
            </p>
            <Link
              href={`/tournaments/${tournamentId}`}
              className="mt-6 inline-block w-full rounded-xl bg-foreground px-4 py-3 font-medium text-background"
            >
              Ir al torneo
            </Link>
          </>
        ) : status === 'rejected' || status === 'expired' ? (
          <>
            <h1 className="text-2xl font-semibold">Pago no completado</h1>
            <p className="mt-2 text-sm text-foreground/70">
              No se pudo confirmar tu pago. Si descontaron de tu medio de pago, contáctanos.
            </p>
            <Link
              href={`/tournaments/${tournamentId}`}
              className="mt-6 inline-block w-full rounded-xl border border-foreground/20 px-4 py-3 font-medium"
            >
              Volver al torneo
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Estamos confirmando tu pago…</h1>
            <p className="mt-2 text-sm text-foreground/70">
              Flow nos está notificando. Esto suele tardar unos segundos. Recarga la página en un momento.
            </p>
            <Link
              href={`/tournaments/${tournamentId}`}
              className="mt-6 inline-block w-full rounded-xl border border-foreground/20 px-4 py-3 font-medium"
            >
              Volver al torneo
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
