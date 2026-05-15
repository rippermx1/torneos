import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { recordAdminAction } from '@/lib/admin/audit'
import { sendAccountBannedEmail } from '@/lib/email/account-notifications'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const adminId = auth.access.userId

  const { id: targetUserId } = await params
  const supabase = createAdminClient()

  let body: { ban: boolean; reason?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { ban, reason } = body

  if (typeof ban !== 'boolean') {
    return Response.json({ error: 'Campo "ban" requerido (boolean)' }, { status: 400 })
  }

  // Verificar que el usuario objetivo existe
  const { data: target } = await supabase
    .from('profiles')
    .select('id, username, is_admin')
    .eq('id', targetUserId)
    .single()

  if (!target) {
    return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  if (target.is_admin) {
    return Response.json({ error: 'No se puede banear a un administrador' }, { status: 403 })
  }

  // Aplicar ban o unban
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: ban })
    .eq('id', targetUserId)

  if (error) {
    return Response.json({ error: `Error actualizando usuario: ${error.message}` }, { status: 500 })
  }

  if (ban) {
    // Marcar juegos activos como inválidos al banear
    await supabase
      .from('games')
      .update({
        status: 'invalid',
        end_reason: 'invalid',
        ended_at: new Date().toISOString(),
      })
      .eq('user_id', targetUserId)
      .eq('status', 'active')

    console.info(`[admin] Usuario ${target.username} (${targetUserId}) baneado manualmente. Razón: ${reason ?? 'sin especificar'}`)
  } else {
    console.info(`[admin] Usuario ${target.username} (${targetUserId}) desbaneado manualmente.`)
  }

  await recordAdminAction(supabase, {
    adminId,
    action: ban ? 'user.ban' : 'user.unban',
    targetType: 'profile',
    targetId: targetUserId,
    summary: reason ?? (ban ? 'Usuario baneado' : 'Usuario desbaneado'),
    payload: {
      username: target.username,
      reason: reason ?? null,
    },
  })

  if (ban) {
    after(async () => {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(targetUserId)
        const email = authUser?.user?.email
        if (email) {
          await sendAccountBannedEmail({ to: email, username: target.username, reason: reason ?? null })
        }
      } catch (e) {
        console.error('[ban] Error enviando email de suspensión:', e)
      }
    })
  }

  return Response.json({ ok: true, banned: ban, userId: targetUserId })
}
