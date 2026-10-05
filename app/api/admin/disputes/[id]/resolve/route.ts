import { financialError } from '@/lib/payouts/review'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { recordAdminAction } from '@/lib/admin/audit'

interface ResolveBody {
  resolution: 'resolved' | 'rejected'
  notes: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdminMfaForApi()
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
  if (typeof body.notes !== 'string' || body.notes.trim().length < 10 || body.notes.length > 2000) {
    return Response.json({ error: 'Las notas de resolución son obligatorias' }, { status: 400 })
  }

  const { id: disputeId } = await params
  const adminSupabase = createAdminClient()

  const { error } = await Promise.resolve(adminSupabase.rpc('resolve_financial_dispute', {
    p_dispute_id: disputeId,
    p_admin_id: userId,
    p_resolution: body.resolution,
    p_reason: body.notes.trim(),
  })).catch(() => ({ error: { message: 'Respuesta perdida' } }))

  if (error) {
    return financialError(error)
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
