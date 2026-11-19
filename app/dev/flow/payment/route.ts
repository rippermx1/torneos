import { confirmLocalPayment, readLocalPayment } from '@/lib/dev/local-flow'
import { isLocalEnvironment } from '@/lib/dev/local-environment'

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export async function GET(req: Request) {
  if (!isLocalEnvironment()) return new Response(null, { status: 404 })
  try {
    const payment = await readLocalPayment(new URL(req.url).searchParams.get('token') ?? '')
    return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/local-flow.css"><title>Pago simulado — Torneos</title></head><body><main><h1>Simulador local de pagos</h1><p>Datos de prueba. Sin cargos reales. No ingreses tarjetas ni datos bancarios.</p><h2>${escape(payment.subject)}</h2><p>Monto simulado: $${payment.amount.toLocaleString('es-CL')} CLP</p><p>Estado: ${payment.status === 1 ? 'Pendiente' : payment.status === 2 ? 'Pagado (simulado)' : 'No completado'}</p><form method="post"><input type="hidden" name="token" value="${payment.token}"><button name="status" value="2">Simular pago aprobado</button> <button name="status" value="3">Simular rechazo</button> <button name="status" value="4">Simular cancelación</button></form><p>La aprobación confirma la inscripción usando las validaciones de la plataforma. Puedes reintentar la confirmación del mismo pago.</p><a href="/tournaments">Volver a torneos</a></main></body></html>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  } catch { return new Response('Pago local no encontrado', { status: 404 }) }
}

export async function POST(req: Request) {
  if (!isLocalEnvironment()) return new Response(null, { status: 404 })
  if (req.headers.get('origin') !== new URL(process.env.APP_URL!).origin) return new Response(null, { status: 403 })
  const body = await req.text()
  if (body.length > 4096) return new Response(null, { status: 413 })
  const params = new URLSearchParams(body)
  const status = Number(params.get('status'))
  if (status !== 2 && status !== 3 && status !== 4) return new Response(null, { status: 400 })
  try {
    const destination = await confirmLocalPayment(params.get('token') ?? '', status)
    return Response.redirect(destination, 303)
  } catch { return new Response('No terminó la confirmación. Vuelve atrás y reintenta el mismo pago.', { status: 502 }) }
}
