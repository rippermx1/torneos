import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { getAppUrl } from '@/lib/env'
import { createGovernedTournament } from '@/lib/tournament/create-tournament'
import { COMMUNITY_FREE_PRESET_KEY } from '@/lib/tournament/community-free'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'

const headers = { 'Cache-Control': 'private, no-store' }
const failure = (error: string, status: number) => Response.json({ error }, { status, headers })

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(getAppUrl()!).origin || request.headers.get('sec-fetch-site') === 'cross-site') return failure('Origen no permitido.', 403)
  } catch { return failure('Origen no permitido.', 403) }
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure('Se requiere JSON.', 415)
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096)) return failure('Cuerpo inválido o demasiado grande.', 413)
  const reader = request.body?.getReader()
  if (!reader) return failure('Cuerpo inválido.', 400)
  let body: Record<string, unknown>
  try {
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const part = await reader.read(); if (part.done) break
      size += part.value.byteLength
      if (size > 4096) { await reader.cancel(); return failure('Cuerpo demasiado grande.', 413) }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { return failure('Cuerpo inválido.', 400) }
  finally { reader.releaseLock() }
  const allowed = new Set(['name', 'description', 'presetKey', 'registrationOpensAt', 'playWindowStart', 'playWindowEnd', 'skillTier'])
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key))
    || body.presetKey !== COMMUNITY_FREE_PRESET_KEY || typeof body.name !== 'string'
    || body.description !== undefined && typeof body.description !== 'string'
    || body.skillTier !== undefined && body.skillTier !== null
    || !['registrationOpensAt', 'playWindowStart', 'playWindowEnd'].every(key => typeof body[key] === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(body[key] as string))) {
    return failure('Sólo se admite el formato comunitario y sus fechas, nombre y descripción.', 400)
  }
  const rate = await checkRateLimit({ key: `community:create:${auth.access.userId}`, limit: 10, windowMs: 60000, onError: 'deny' })
  if (!rate.ok) return rateLimitResponse(rate)
  try {
    const result = await createGovernedTournament({ name: body.name, description: body.description as string | undefined,
      presetKey: COMMUNITY_FREE_PRESET_KEY, skillTier: null, registrationOpensAt: body.registrationOpensAt as string,
      playWindowStart: body.playWindowStart as string, playWindowEnd: body.playWindowEnd as string }, auth.access.userId)
    return Response.json({ ok: true, ...result }, { status: 201, headers })
  } catch { return failure('No se pudo crear el reto. Revisa nombre, fechas, categoría y disponibilidad del formato.', 400) }
}
