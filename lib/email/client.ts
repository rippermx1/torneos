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

export const FROM_PAGOS = 'Torneos <pagos@torneosplay.cl>'
export const FROM_SYSTEM = 'Torneos <system@torneosplay.cl>'

export function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL ?? FROM_PAGOS
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
  from?: string
  data: Record<string, string | number | boolean>
}): Promise<void> {
  const client = getClient()
  if (!client) return

  const { error } = await client.emails.send({
    from: params.from ?? getFromAddress(),
    to: params.to,
    template: {
      id: params.templateId,
      variables: params.data as Record<string, string | number>,
    },
  })

  if (error) {
    console.error('[email] Error enviando template email a', params.to, error)
  }
}
