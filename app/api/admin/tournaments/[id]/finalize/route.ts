import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { forceFinalizeTournament } from '@/lib/tournament/lifecycle'
import { recordAdminAction } from '@/lib/admin/audit'

// Trigger manual de finalización para el admin.
// Útil para cerrar torneos antes de que el cron los procese,
// o para testing sin esperar el cron.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const supabase = createAdminClient()

  const { id: tournamentId } = await params

  try {
    const result = await forceFinalizeTournament(tournamentId)
    await recordAdminAction(supabase, {
      adminId: userId,
      action: 'tournament.finalize',
      targetType: 'tournament',
      targetId: tournamentId,
      summary: 'Finalización manual de torneo',
      payload: { result: result as unknown as Record<string, unknown> },
    })
    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 400 })
  }
}
