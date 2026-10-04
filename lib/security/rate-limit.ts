import { createAdminClient } from '@/lib/supabase/server'

interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
  onError?: 'allow' | 'deny'
}

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  unavailable?: boolean
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
// Existing callers allow requests during an outage. Competitive game routes
// explicitly deny them: a missing quota cannot authorize another mutation.
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('rate_limit_consume', {
      p_key: options.key,
      p_limit: options.limit,
      p_window_ms: options.windowMs,
    })

    if (error || !data) {
      console.error('[rate-limit] RPC unavailable', { key: options.key, error })
      return unavailable(options, now)
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
    if (typeof payload.ok !== 'boolean' || !Number.isSafeInteger(payload.limit) || payload.limit !== options.limit
      || !Number.isSafeInteger(payload.remaining) || payload.remaining < 0 || payload.remaining > options.limit
      || !Number.isFinite(resetAt) || !Number.isSafeInteger(payload.retry_after_seconds) || payload.retry_after_seconds < 0) {
      return unavailable(options, now)
    }

    return {
      ok: payload.ok,
      limit: payload.limit,
      remaining: payload.remaining,
      resetAt: Number.isFinite(resetAt) ? resetAt : now + options.windowMs,
      retryAfterSeconds: payload.retry_after_seconds,
    }
  } catch (err) {
    console.error('[rate-limit] unexpected error', { key: options.key, err })
    return unavailable(options, now)
  }
}

function unavailable(options: RateLimitOptions, now: number): RateLimitResult {
  const deny = options.onError === 'deny'
  return {
    ok: !deny,
    unavailable: deny,
    limit: options.limit,
    remaining: options.limit,
    resetAt: now + options.windowMs,
    retryAfterSeconds: Math.ceil(options.windowMs / 1000),
  }
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    {
      error: result.unavailable ? 'No se pudo comprobar el límite de solicitudes. Intenta nuevamente más tarde.'
        : 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
      ...(result.unavailable ? { code: 'RATE_LIMIT_UNAVAILABLE' } : {}),
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: result.unavailable ? 503 : 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}
