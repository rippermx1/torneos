import { createClient, createAdminClient } from '@/lib/supabase/server'
import { recordAdminAction } from '@/lib/admin/audit'
import type { Profile } from '@/types/database'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  const supabase = createAdminClient()
  const { data: profileData } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()

  if (!(profileData as Profile | null)?.is_admin) {
    return Response.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

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
