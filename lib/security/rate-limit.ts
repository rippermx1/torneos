interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

const buckets = new Map<string, Bucket>()
let lastSweepAt = 0

export function getRequestIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  )
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now()

  if (now - lastSweepAt > 60_000) {
    lastSweepAt = now
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  const existing = buckets.get(options.key)
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + options.windowMs }
    : existing

  bucket.count += 1
  buckets.set(options.key, bucket)

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  const remaining = Math.max(0, options.limit - bucket.count)

  return {
    ok: bucket.count <= options.limit,
    limit: options.limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
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
