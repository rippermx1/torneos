import { sendEmail } from '@/lib/email/client'
import { getAlertEmail } from '@/lib/env'

// Alertas operativas para el operador de la plataforma (no para usuarios):
// crons caídos, ganadores con estadísticas anómalas, etc. Requiere ALERT_EMAIL.
export async function sendOpsAlertEmail(input: {
  subject: string
  lines: string[]
}): Promise<void> {
  const to = getAlertEmail()
  if (!to) {
    console.warn(`[ops-alert] ALERT_EMAIL no configurado — alerta solo en logs: ${input.subject}`)
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

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
