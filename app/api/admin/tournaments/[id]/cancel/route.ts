import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { recordAdminAction } from '@/lib/admin/audit'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const supabase = createAdminClient()
  const { id: tournamentId } = await params

  const { data: tData } = await supabase
    .from('tournaments')
    .select('id, name, status')
    .eq('id', tournamentId)
    .single()

  if (!tData) {
    return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })
  }

  if (!['scheduled', 'open'].includes(tData.status)) {
    return Response.json(
      { error: `No se puede cancelar torneo en estado: ${tData.status}` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase.rpc('cancel_tournament', {
    p_tournament_id: tournamentId,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  await recordAdminAction(supabase, {
    adminId: userId,
    action: 'tournament.cancel',
    targetType: 'tournament',
    targetId: tournamentId,
    summary: 'Cancelación manual de torneo',
    payload: { result: data as unknown as Record<string, unknown> },
  })

  return Response.json({ ok: true, result: data })
}
