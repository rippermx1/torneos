import { createAdminClient } from '@/lib/supabase/server'

interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

export function getRequestIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  )
}

// A1: Rate limiting distribuido. La fuente de verdad es la tabla
// public.rate_limit_buckets accedida via RPC atomica rate_limit_consume.
// Antes habia un Map en memoria por proceso, evadible escalando lambdas.
//
// Fail-open: si la RPC falla (DB caida, latencia extrema), permitimos la
// request pero registramos el incidente. Bloquear todo el trafico durante
// un incidente de DB es peor que tolerar un breve rebase de los limites.
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase.rpc('rate_limit_consume', {
      p_key: options.key,
      p_limit: options.limit,
      p_window_ms: options.windowMs,
    })

    if (error || !data) {
      console.error('[rate-limit] RPC error, fail-open', { key: options.key, error })
      return failOpen(options, now)
    }

    const payload = data as {
      ok: boolean
      limit: number
      count: number
      remaining: number
      expires_at: string
      retry_after_seconds: number
    }

    const resetAt = Date.parse(payload.expires_at)

    return {
      ok: payload.ok,
      limit: payload.limit,
      remaining: payload.remaining,
      resetAt: Number.isFinite(resetAt) ? resetAt : now + options.windowMs,
      retryAfterSeconds: payload.retry_after_seconds,
    }
  } catch (err) {
    console.error('[rate-limit] unexpected error, fail-open', { key: options.key, err })
    return failOpen(options, now)
  }
}

function failOpen(options: RateLimitOptions, now: number): RateLimitResult {
  return {
    ok: true,
    limit: options.limit,
    remaining: options.limit,
    resetAt: now + options.windowMs,
    retryAfterSeconds: Math.ceil(options.windowMs / 1000),
  }
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    {
      error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}
