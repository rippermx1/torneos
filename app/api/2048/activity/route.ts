import { getAppUrl } from '@/lib/env'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'
import { parsePlayer2048ActivityBody, recordPlayer2048Activity, type Player2048RetentionRpcClient } from '@/lib/game/player-2048-retention'

const MAX_BODY_BYTES = 256
const headers = { 'Cache-Control': 'private, no-store' }
const failure = (error: string, status: number) => Response.json({ error }, { status, headers })

function sameOrigin(req: Request) {
  try {
    const expected = new URL(getAppUrl(new URL(req.url).origin)!).origin
    return req.headers.get('origin') === expected && req.headers.get('sec-fetch-site') !== 'cross-site'
  } catch { return false }
}

async function readBody(req: Request) {
  const declared = req.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return { error: failure('Cuerpo demasiado grande o longitud inválida.', /^\d+$/.test(declared) ? 413 : 400) }
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return { error: failure('Se requiere application/json.', 415) }
  if (!req.body) return { error: failure('Cuerpo inválido.', 400) }
  const reader = req.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY_BYTES) { try { await reader.cancel() } catch { /* Already rejected. */ } return { error: failure('Cuerpo demasiado grande.', 413) } }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const mode = parsePlayer2048ActivityBody(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    return mode ? { mode } : { error: failure('Sólo se admite mode practice o daily.', 400) }
  } catch { return { error: failure('Cuerpo inválido.', 400) } }
  finally { reader.releaseLock() }
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return failure('Origen no permitido.', 403)
  const body = await readBody(req)
  if (body.error) return body.error
  try {
    const session = await createClient()
    const { data, error } = await session.auth.getUser()
    if (error) {
      if (error.name === 'AuthSessionMissingError') return failure('Se requiere una cuenta autenticada.', 401)
      return failure('No se pudo comprobar la sesión.', 503)
    }
    if (!data.user || data.user.is_anonymous) return failure('Se requiere una cuenta autenticada.', 401)
    const rate = await checkRateLimit({ key: `2048:activity:${data.user.id}`, limit: 30, windowMs: 60_000, onError: 'deny' })
    if (!rate.ok) return rateLimitResponse(rate)
    const activity = await recordPlayer2048Activity(createAdminClient() as unknown as Player2048RetentionRpcClient, data.user.id, body.mode!)
    return Response.json({ ok: true, ...activity }, { headers })
  } catch { return failure('No se pudo confirmar la actividad de la cuenta.', 503) }
}
