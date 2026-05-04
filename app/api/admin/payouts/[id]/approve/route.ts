import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isValidRut, samePersonName, sameRut } from '@/lib/identity/verification'
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

  return Response.json({ ok: true })
}
