import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { recordAdminAction } from '@/lib/admin/audit'
import { sendAccountBannedEmail } from '@/lib/email/account-notifications'
import { setAccountSanction } from '@/lib/anticheat/integrity'
import { isJsonObject } from '@/lib/tournament/game-request'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdminMfaForApi()
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

  if (!isJsonObject(body)) return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  const { ban, reason } = body

  if (typeof ban !== 'boolean' || reason !== undefined && (typeof reason !== 'string' || reason.length > 1000)) {
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

  let sanction: Awaited<ReturnType<typeof setAccountSanction>>
  try {
    sanction = await setAccountSanction(supabase, { userId: targetUserId, banned: ban,
      reason: reason?.trim() || (ban ? 'Suspensión manual' : 'Retiro de suspensión manual'), actorId: adminId })
  } catch {
    return Response.json({ error: 'No se pudo confirmar la sanción completa.', code: 'SANCTION_STATE_UNCONFIRMED' }, { status: 503 })
  }
  if (ban) {
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

  return Response.json({ ...sanction, userId: targetUserId })
}
