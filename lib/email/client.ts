import { Resend } from 'resend'

let _client: Resend | null = null

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[email] RESEND_API_KEY no configurado — emails omitidos')
    return null
  }
  if (!_client) _client = new Resend(key)
  return _client
}

export function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL ?? 'Torneos <pagos@torneosplay.cl>'
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const client = getClient()
  if (!client) return

  const { error } = await client.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  })

  if (error) {
    console.error('[email] Error enviando email a', params.to, error)
  }
}

export async function sendTemplateEmail(params: {
  to: string
  templateId: string
  data: Record<string, unknown>
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[email] RESEND_API_KEY no configurado — emails omitidos')
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: params.to,
      template_id: params.templateId,
      data: params.data,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error('[email] Error enviando template email a', params.to, body)
  }
}
