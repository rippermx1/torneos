import { FROM_SYSTEM } from '@/lib/email/client'
import { assertProviderDispatchAllowed } from '@/lib/config/provider-dispatch.mjs'
import { isLocalEnvironment } from '@/lib/dev/local-environment'
import type { OpsNotification } from '@/lib/ops/monitor'

export class OperationalEmailError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}

// Durable queue owns retries. Frozen recipient/body and a stable key survive response loss.
// Acceptance means the provider accepted this message, never delivery or operator acknowledgement.
export async function sendOperationalEmail(notification: Pick<OpsNotification, 'id' | 'recipient' | 'subject' | 'text_body'>): Promise<string> {
  assertProviderDispatchAllowed()
  if (!notification.recipient) throw new OperationalEmailError('Destinatario operativo no configurado', false)
  const text = notification.text_body
  const html = `<pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>`
  if (isLocalEnvironment()) {
    const url = new URL(process.env.LOCAL_EMAIL_API_URL ?? 'http://127.0.0.1:54324/api/v1/send')
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', 'host.docker.internal'].includes(url.hostname) || url.pathname !== '/api/v1/send') {
      throw new OperationalEmailError('Correo local mal configurado', false)
    }
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ From: { Email: 'system@torneos.local' }, To: [{ Email: notification.recipient }],
        Subject: `[LOCAL] ${notification.subject}`, HTML: html, Text: text }) })
    if (!response.ok) throw new OperationalEmailError(`Mailpit respondió ${response.status}`, response.status >= 500 || response.status === 429)
    return `local:${notification.id}`
  }
  const key = process.env.RESEND_API_KEY
  if (!key) throw new OperationalEmailError('RESEND_API_KEY no configurado', true)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10_000), headers: {
      Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `ops/${notification.id}`,
    }, body: JSON.stringify({ from: FROM_SYSTEM, to: [notification.recipient], subject: notification.subject, html, text }),
  })
  if (!response.ok) throw new OperationalEmailError(`Proveedor de correo respondió ${response.status}`, response.status >= 500 || response.status === 429)
  const data = await response.json()
  if (typeof data.id !== 'string' || !data.id) throw new OperationalEmailError('Aceptación de correo sin identificador', true)
  return data.id
}
