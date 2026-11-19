import { getAppUrl } from '@/lib/env'

export function sameOrigin(req: Request): Response | null {
  const origin = req.headers.get('origin')
  if (!origin || origin !== getAppUrl(req.url)) return Response.json({ error: 'Origen inválido' }, { status: 403 })
  return null
}
export async function boundedJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (Buffer.byteLength(text) > 16_384) throw new Error('Solicitud demasiado grande')
  const body: unknown = JSON.parse(text)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Solicitud inválida')
  return body as Record<string, unknown>
}
export function accountError(error: { code?: string; message?: string }): Response {
  const status = /^PT(400|403|404|409|423)$/.test(error.code ?? '') ? Number(error.code!.slice(2)) : error.code === '23505' ? 409 : 503
  return Response.json({ error: status === 503 ? 'No se pudo confirmar la operación. Consulta su estado antes de repetir.' : status === 409 ? 'Ya existe una solicitud pendiente o el caso cambió de estado.' : error.message }, { status })
}
