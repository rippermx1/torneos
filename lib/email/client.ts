import { Resend } from 'resend'

// Cliente Resend. Si RESEND_API_KEY no está configurado, las funciones
// de envío loguean una advertencia y retornan sin lanzar error.
// Así el flujo de negocio nunca falla por un problema de email.

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
