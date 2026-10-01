import { handleLocalFlow } from '@/lib/dev/local-flow'
import { isLocalEnvironment } from '@/lib/dev/local-environment'

async function handle(req: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!isLocalEnvironment()) return new Response(null, { status: 404 })
  const { path } = await context.params
  const endpoint = path.join('/')
  const allowed = req.method === 'GET' ? ['payment/getStatus', 'refund/getStatus'] : ['payment/create', 'refund/create', 'refund/cancel']
  if (!allowed.includes(endpoint)) return new Response(null, { status: 405 })
  try {
    const body = req.method === 'GET' ? new URL(req.url).search.slice(1) : await req.text()
    if (body.length > 16_384) return new Response(null, { status: 413 })
    const result = await handleLocalFlow(endpoint, Object.fromEntries(new URLSearchParams(body)))
    result.headers.set('Cache-Control', 'no-store')
    return result
  } catch {
    return Response.json({ message: 'Solicitud local inválida' }, { status: 400 })
  }
}
export const GET = handle
export const POST = handle
