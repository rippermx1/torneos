import { createHmac } from 'crypto'
import { getFlowApiBase, getFlowApiKey, getFlowApiSecret } from '@/lib/env'

// ───────────────────────────────────────────────────────────────
// Cliente Flow.cl REST.
//
// Auth: cada request lleva apiKey + un parámetro `s` con la firma
// HMAC-SHA256 sobre la concatenación de los demás parámetros
// ordenados alfabéticamente (nombre+valor sin separadores).
//
// Spec: https://www.flow.cl/docs/api.html
// ───────────────────────────────────────────────────────────────

export interface FlowParams {
  [key: string]: string | number | undefined | null
}

/**
 * Construye el string a firmar: ordena las llaves alfabéticamente,
 * concatena `clave + valor`. Excluye llaves con valor null/undefined.
 */
export function buildSignString(params: FlowParams): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && k !== 's')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
}

/**
 * Firma los parámetros con HMAC-SHA256 usando el secretKey del comercio.
 */
export function signParams(params: FlowParams, secretKey: string): string {
  const toSign = buildSignString(params)
  return createHmac('sha256', secretKey).update(toSign).digest('hex')
}

function getCredentials() {
  const apiKey = getFlowApiKey()
  const secret = getFlowApiSecret()
  if (!apiKey || !secret) {
    throw new Error('Flow no configurado: falta FLOW_API_KEY o FLOW_API_SECRET')
  }
  return { apiKey, secret, base: getFlowApiBase() }
}

interface FlowErrorBody {
  code?: number | string
  message?: string
}

export class FlowApiError extends Error {
  constructor(
    public status: number,
    public code: number | string | undefined,
    message: string
  ) {
    super(message)
    this.name = 'FlowApiError'
  }
}

async function parseError(res: Response): Promise<FlowApiError> {
  const text = await res.text()
  let body: FlowErrorBody = {}
  try {
    body = JSON.parse(text) as FlowErrorBody
  } catch {
    // no-op, dejamos body vacío
  }
  return new FlowApiError(
    res.status,
    body.code,
    body.message ?? text ?? `Flow API ${res.status}`
  )
}

/**
 * POST a Flow API con application/x-www-form-urlencoded.
 * Inyecta apiKey y firma s automáticamente.
 */
export async function flowPost<T>(
  endpoint: string,
  params: FlowParams
): Promise<T> {
  const { apiKey, secret, base } = getCredentials()
  const fullParams: FlowParams = { ...params, apiKey }
  const s = signParams(fullParams, secret)
  fullParams.s = s

  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fullParams)) {
    if (value !== undefined && value !== null) body.append(key, String(value))
  }

  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw await parseError(res)
  return (await res.json()) as T
}

/**
 * GET a Flow API. Inyecta apiKey y firma s automáticamente.
 */
export async function flowGet<T>(
  endpoint: string,
  params: FlowParams
): Promise<T> {
  const { apiKey, secret, base } = getCredentials()
  const fullParams: FlowParams = { ...params, apiKey }
  const s = signParams(fullParams, secret)
  fullParams.s = s

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(fullParams)) {
    if (value !== undefined && value !== null) search.append(key, String(value))
  }

  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}?${search.toString()}`
  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) throw await parseError(res)
  return (await res.json()) as T
}
