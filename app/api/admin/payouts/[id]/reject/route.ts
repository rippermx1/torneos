import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { recordAdminAction } from '@/lib/admin/audit'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId

  const { id: requestId } = await params
  let body: { notes?: string } = {}
  try { body = await req.json() } catch { /* notes es opcional */ }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase.rpc('reject_withdrawal', {
    p_request_id: requestId,
    p_admin_id: userId,
    p_notes: body.notes ?? null,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  await recordAdminAction(adminSupabase, {
    adminId: userId,
    action: 'payout.reject',
    targetType: 'withdrawal_request',
    targetId: requestId,
    summary: body.notes ?? 'Retiro rechazado sin nota',
    payload: { notes: body.notes ?? null },
  })

  return Response.json({ ok: true })
}
