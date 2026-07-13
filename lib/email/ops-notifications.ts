import { sendEmail } from '@/lib/email/client'
import { getAlertEmail } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/server'

// Alertas operativas para el operador de la plataforma (no para usuarios):
// crons caídos, ganadores con estadísticas anómalas, etc. ALERT_EMAIL tiene
// prioridad; si falta, se usa el email del owner/admin para no perder alertas.
export async function sendOpsAlertEmail(input: {
  subject: string
  lines: string[]
}): Promise<void> {
  const to = await resolveOpsAlertEmail()
  if (!to) {
    console.warn(`[ops-alert] Sin ALERT_EMAIL ni owner/admin con email — alerta solo en logs: ${input.subject}`)
    console.warn('[ops-alert]', input.lines.join(' | '))
    return
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2 style="color:#b45309;">⚠ ${escapeHtml(input.subject)}</h2>
      ${input.lines.map((l) => `<p style="margin:6px 0;">${escapeHtml(l)}</p>`).join('')}
      <p style="color:#6b7280; font-size:12px; margin-top:16px;">Alerta automática de TorneosPlay.</p>
    </div>
  `

  try {
    await sendEmail({
      to,
      subject: `[TorneosPlay OPS] ${input.subject}`,
      html,
      text: input.lines.join('\n'),
    })
  } catch (e) {
    console.error('[ops-alert] Error enviando alerta:', e)
  }
}

async function resolveOpsAlertEmail(): Promise<string | undefined> {
  const configured = getAlertEmail()
  if (configured) return configured

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profile_roles')
      .select('profile_id, role, granted_at')
      .in('role', ['owner', 'admin'])
      .limit(20)

    if (error) throw error

    const rows = [...(data ?? [])].sort((a, b) => {
      const rolePriority = (role: string) => role === 'owner' ? 0 : 1
      const priorityDifference = rolePriority(a.role) - rolePriority(b.role)
      if (priorityDifference !== 0) return priorityDifference
      return new Date(a.granted_at).getTime() - new Date(b.granted_at).getTime()
    })

    const seen = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.profile_id)) continue
      seen.add(row.profile_id)
      const { data: authData } = await admin.auth.admin.getUserById(row.profile_id)
      if (authData.user?.email) return authData.user.email
    }
  } catch (error) {
    console.error('[ops-alert] No se pudo resolver el email owner/admin:', error)
  }

  return undefined
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
