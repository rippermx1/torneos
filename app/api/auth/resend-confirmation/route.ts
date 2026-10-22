import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getAppUrl, getSupabaseBrowserKey, getSupabaseServerUrl } from '@/lib/env'
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit'
import { getOnboardingPath } from '@/lib/auth/redirect'
import { RESEND_PKCE_COOKIE, createResendPkceFlow, encodeResendPkceCookie, resendPkceCookieOptions } from '@/lib/auth/confirmation-resend'

const MAX_BODY_BYTES = 2048
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const message = 'Si hay una cuenta pendiente para ese correo, enviaremos un enlace de confirmación. Revisa también spam.'
const failure = (error: string, status: number, retryAfterSeconds?: number) => Response.json(
  { error, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) },
  { status, headers: { ...headers, ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}) } },
)

async function readBody(req: Request): Promise<{ email: string; next?: string } | Response> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure('Se requiere application/json.', 415)
  const length = req.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return failure('Solicitud inválida.', /^\d+$/.test(length) ? 413 : 400)
  if (!req.body) return failure('Solicitud inválida.', 400)
  const reader = req.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return failure('Solicitud demasiado grande.', 413) }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['email', 'next'].includes(key))
      || typeof body.email !== 'string' || (body.next !== undefined && (typeof body.next !== 'string' || body.next.length > 1024))) return failure('Solicitud inválida.', 400)
    const email = body.email.trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email)) return failure('Ingresa un correo válido.', 400)
    return { email, next: body.next }
  } catch { return failure('Solicitud inválida.', 400) }
  finally { reader.releaseLock() }
}

export async function POST(req: Request): Promise<Response> {
  let origin: string
  try {
    origin = new URL(getAppUrl(new URL(req.url).origin)!).origin
    if (req.headers.get('origin') !== origin || req.headers.get('sec-fetch-site') === 'cross-site') return failure('Origen no permitido.', 403)
  } catch { return failure('Origen no permitido.', 403) }
  try {
    const ip = createHash('sha256').update(getRequestIp(req)).digest('hex')
    const ipRate = await checkRateLimit({ key: `confirm-resend:ip:${ip}`, limit: 3, windowMs: 5 * 60_000, onError: 'deny' })
    if (!ipRate.ok) return failure(ipRate.unavailable ? 'No se pudo procesar la solicitud. Intenta más tarde.' : 'Espera antes de solicitar otro enlace.', ipRate.unavailable ? 503 : 429, Math.max(1, ipRate.retryAfterSeconds))
    const body = await readBody(req)
    if (body instanceof Response) return body
    const emailHash = createHash('sha256').update(body.email).digest('hex')
    for (const rule of [{ suffix: 'minute', limit: 1, windowMs: 60_000 }, { suffix: 'hour', limit: 5, windowMs: 60 * 60_000 }]) {
      const rate = await checkRateLimit({ key: `confirm-resend:email:${emailHash}:${rule.suffix}`, limit: rule.limit, windowMs: rule.windowMs, onError: 'deny' })
      if (!rate.ok) return failure(rate.unavailable ? 'No se pudo procesar la solicitud. Intenta más tarde.' : 'Espera antes de solicitar otro enlace.', rate.unavailable ? 503 : 429, Math.max(1, rate.retryAfterSeconds))
    }
    const url = getSupabaseServerUrl(), key = getSupabaseBrowserKey()
    if (!url || !key) return failure('No se pudo procesar la solicitud. Intenta más tarde.', 503)
    const flow = createResendPkceFlow()
    const redirectTo = new URL('/auth/confirm', origin)
    redirectTo.searchParams.set('next', getOnboardingPath(body.next))
    redirectTo.searchParams.set('resend_id', flow.id)
    const endpoint = new URL('/auth/v1/resend', url)
    endpoint.searchParams.set('redirect_to', redirectTo.toString())
    const response = await fetch(endpoint, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'signup', email: body.email, code_challenge: flow.challenge, code_challenge_method: 's256' }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' })
    // Provider account-specific cooldowns must not reveal whether an email exists.
    // Public 429 responses come only from the existence-independent app quotas.
    if (response.status === 429) return Response.json({ message, retryAfterSeconds: 60 }, { status: 202, headers })
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      if (!['user_not_found', 'email_exists', 'email_already_confirmed'].includes(detail?.code)) return failure('No se pudo procesar la solicitud. Intenta más tarde.', 503)
    }
    const store = await cookies()
    store.set(RESEND_PKCE_COOKIE, encodeResendPkceCookie(flow), resendPkceCookieOptions(origin))
    return Response.json({ message, retryAfterSeconds: 60 }, { status: 202, headers })
  } catch { return failure('No se pudo procesar la solicitud. Intenta más tarde.', 503) }
}
