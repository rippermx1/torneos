import { Resend } from 'resend'
import { isLocalEnvironment } from '@/lib/dev/local-environment'

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
  if (isLocalEnvironment()) {
    const url = new URL(process.env.LOCAL_EMAIL_API_URL ?? 'http://127.0.0.1:54324/api/v1/send')
    const internalMailpit = url.hostname === 'supabase_inbucket_torneos' && url.port === '8025'
    if (url.protocol !== 'http:' || (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(url.hostname) && !internalMailpit) ||
        url.pathname !== '/api/v1/send') throw new Error('Correo local mal configurado')
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ From: { Email: 'system@torneos.local', Name: 'Torneos local' },
        To: [{ Email: params.to }], Subject: `[LOCAL] ${params.subject}`, HTML: params.html, Text: params.text }),
    })
    if (!response.ok) throw new Error(`Mailpit respondió ${response.status}`)
    return
  }
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
  if (isLocalEnvironment()) {
    // Provider-hosted templates are unavailable offline. Preserve their variables in a local preview.
    const text = `Plantilla local: ${params.templateId}\n${JSON.stringify(params.data, null, 2)}`
    const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    return sendEmail({ to: params.to, subject: params.templateId, text, html: `<pre>${escaped}</pre>` })
  }
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
