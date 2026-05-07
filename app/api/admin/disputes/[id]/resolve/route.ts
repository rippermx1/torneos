import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { recordAdminAction } from '@/lib/admin/audit'

interface ResolveBody {
  resolution: 'resolved' | 'rejected'
  notes: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId

  let body: ResolveBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!['resolved', 'rejected'].includes(body.resolution)) {
    return Response.json({ error: 'Resolución inválida' }, { status: 400 })
  }
  if (!body.notes?.trim()) {
    return Response.json({ error: 'Las notas de resolución son obligatorias' }, { status: 400 })
  }

  const { id: disputeId } = await params
  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase
    .from('disputes')
    .update({
      status: body.resolution,
      admin_notes: body.notes.trim(),
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', disputeId)
    .eq('status', 'open') // solo abiertas

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  await recordAdminAction(adminSupabase, {
    adminId: userId,
    action: body.resolution === 'resolved' ? 'dispute.resolved' : 'dispute.rejected',
    targetType: 'dispute',
    targetId: disputeId,
    summary: body.notes.trim(),
    payload: { resolution: body.resolution },
  })

  return Response.json({ ok: true })
}
