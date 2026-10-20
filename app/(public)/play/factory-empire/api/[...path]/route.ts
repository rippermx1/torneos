import {referenceCookie, referenceTarget} from '@/lib/game/factory-reference-proxy'

export const runtime = 'nodejs'
async function forward(request: Request, context: {params: Promise<{path: string[]}>}) {
  const path = (await context.params).path.join('/')
  let target: URL | null
  try {target = referenceTarget(path, request.method, process.env.NODE_ENV, process.env.FACTORY_REFERENCE_URL, new URL(request.url).search)} catch {target = null}
  if (!target) return Response.json({detail: 'Factory Empire requiere su entorno de referencia local.'}, {status: 503})
  const origin = `http://${request.headers.get('host')}`
  const local = new URL(origin)
  if (!['127.0.0.1', 'localhost'].includes(local.hostname)) return Response.json({detail: 'Entorno local requerido.'}, {status: 503})
  if (request.method === 'POST' && request.headers.get('origin') !== origin) return Response.json({detail: 'Origen no autorizado.'}, {status: 403})
  const headers = new Headers({'Origin': origin, 'Content-Type': 'application/json'})
  const cookie = referenceCookie(request.headers.get('cookie') ?? '')
  if (cookie) headers.set('Cookie', cookie)
  const csrf = request.headers.get('x-csrf-token')
  if (csrf && /^[a-f0-9]{64}$/.test(csrf)) headers.set('X-CSRF-Token', csrf)
  const body = request.method === 'POST' ? await request.text() : undefined
  if (body && body.length > 2048) return Response.json({detail: 'Solicitud demasiado grande.'}, {status: 413})
  try {
    const upstream = await fetch(target, {method: request.method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000)})
    const response = new Response(await upstream.text(), {status: upstream.status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}})
    const session = upstream.headers.get('set-cookie')?.match(/^fe_session=([A-Za-z0-9_-]{20,100});/)
    if (session) response.headers.set('Set-Cookie', `fe_unity_session=${session[1]}; Path=/play/factory-empire/api; HttpOnly; SameSite=Lax; Max-Age=2592000`)
    return response
  } catch {
    return Response.json({detail: 'Sin conexión con Factory Empire. Inicia el entorno local y reintenta.'}, {status: 502, headers: {'Cache-Control': 'no-store'}})
  }
}
export {forward as GET, forward as POST}
