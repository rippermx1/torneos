import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { isValidRut, samePersonName, sameRut } from '@/lib/identity/verification'
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
  const { data: request } = await adminSupabase
    .from('withdrawal_requests')
    .select('user_id, account_rut, account_holder, status')
    .eq('id', requestId)
    .single()

  if (!request) {
    return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  }

  if (request.status !== 'pending') {
    return Response.json({ error: 'La solicitud ya fue procesada' }, { status: 409 })
  }

  const { data: withdrawalProfile } = await adminSupabase
    .from('profiles')
    .select('kyc_status, full_name, rut')
    .eq('id', request.user_id)
    .single()

  if (!withdrawalProfile || withdrawalProfile.kyc_status !== 'approved') {
    return Response.json({ error: 'No se puede aprobar: KYC no aprobado' }, { status: 422 })
  }

  if (!withdrawalProfile.rut || !isValidRut(withdrawalProfile.rut) || !sameRut(withdrawalProfile.rut, request.account_rut)) {
    return Response.json(
      { error: 'No se puede aprobar: el RUT bancario no coincide con el KYC aprobado' },
      { status: 422 }
    )
  }

  if (!withdrawalProfile.full_name || !samePersonName(withdrawalProfile.full_name, request.account_holder)) {
    return Response.json(
      { error: 'No se puede aprobar: el titular bancario no coincide con el KYC aprobado' },
      { status: 422 }
    )
  }

  const { error } = await adminSupabase.rpc('approve_withdrawal', {
    p_request_id: requestId,
    p_admin_id: userId,
    p_notes: body.notes ?? null,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  await recordAdminAction(adminSupabase, {
    adminId: userId,
    action: 'payout.approve',
    targetType: 'withdrawal_request',
    targetId: requestId,
    summary: `Aprobó retiro a ${request.account_holder} (${request.account_rut})`,
    payload: {
      target_user_id: request.user_id,
      account_holder: request.account_holder,
      account_rut: request.account_rut,
      notes: body.notes ?? null,
    },
  })

  return Response.json({ ok: true })
}
