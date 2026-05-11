import { readFlowToken, settleFlowPayment } from '@/lib/flow/settlement'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'

// ───────────────────────────────────────────────────────────────
// Webhook de Flow para confirmación de pago.
//
// Spec:
// - Flow llama a urlConfirmation vía POST application/x-www-form-urlencoded
//   con un único parámetro: token.
// - Debemos consultar payment/getStatus para obtener el estado real.
//   Esto evita falsificación: el atacante no puede simular un pago
//   exitoso con solo un token, porque consultamos a Flow directamente.
// - Status: 1=pendiente, 2=pagado, 3=rechazado, 4=anulado.
// - Solo si status=2 liquidamos el intento segun su intent.
// - tournament_registration crea la inscripcion de forma idempotente.
//
// Endurecimiento:
// - Rate limit por IP: cualquiera puede POSTear tokens basura y forzar
//   llamadas a getFlowPaymentStatus. El RL acota el abuso.
// - Body size cap: rechazamos payloads > 4 KiB antes de leer/parsear.
// - Content-Type allowlist: Flow envia x-www-form-urlencoded; el query
//   string tambien es valido para reintentos manuales. Cualquier otro
//   content-type no proviene de Flow.
// ───────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 4096

const ALLOWED_CONTENT_TYPE_PREFIXES = [
  'application/x-www-form-urlencoded',
  'application/json', // tolerado por compat: readFlowToken acepta JSON
  'text/plain',       // algunos reintentos llegan sin content-type explicito
]

function hasAcceptableContentType(req: Request): boolean {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!ct) return true // permitido: Flow no siempre envia el header
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => ct.includes(p))
}

export async function POST(req: Request): Promise<Response> {
  const rl = await checkRateLimit({
    key: `webhook:flow:${getRequestIp(req)}`,
    limit: 60,
    windowMs: 60_000,
  })
  if (!rl.ok) return rateLimitResponse(rl)

  if (!hasAcceptableContentType(req)) {
    return new Response('Unsupported Media Type', { status: 415 })
  }

  const declared = req.headers.get('content-length')
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return new Response('Payload Too Large', { status: 413 })
  }

  const token = await readFlowToken(req, MAX_BODY_BYTES)
  if (!token) {
    return new Response('Token faltante', { status: 400 })
  }

  try {
    await settleFlowPayment(token)
    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Error procesando webhook Flow:', err)
    return new Response('Error acreditando pago', { status: 500 })
  }
}
