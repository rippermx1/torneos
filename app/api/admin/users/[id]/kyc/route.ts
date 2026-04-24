import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: adminProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminProfile?.is_admin) return Response.json({ error: 'Acceso denegado' }, { status: 403 })

  const { id: targetUserId } = await params

  let body: { action: 'approve' | 'reject' }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!['approve', 'reject'].includes(body.action)) {
    return Response.json({ error: 'Acción inválida' }, { status: 400 })
  }

  // Verificar que el usuario objetivo existe
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, kyc_status')
    .eq('id', targetUserId)
    .single()

  if (!profile) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const newStatus: Profile['kyc_status'] = body.action === 'approve' ? 'approved' : 'rejected'

  const { error } = await supabase
    .from('profiles')
    .update({
      kyc_status: newStatus,
      kyc_verified_at: body.action === 'approve' ? new Date().toISOString() : null,
    })
    .eq('id', targetUserId)

  if (error) {
    return Response.json({ error: `Error actualizando KYC: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true, status: newStatus })
}
