import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

interface ResolveBody {
  resolution: 'resolved' | 'rejected'
  notes: string
}

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

  return Response.json({ ok: true })
}
