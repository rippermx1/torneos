function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, '')
}

export function getAppUrl(fallback?: string) {
  const value = firstNonEmpty(
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    fallback
  )

  return value ? normalizeUrl(value) : undefined
}

export function getSupabaseUrl() {
  return firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function getSupabaseBrowserKey() {
  return firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export function getSupabaseServiceKey() {
  return firstNonEmpty(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export function getAllowedOrigins() {
  return Array.from(
    new Set(
      [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        getAppUrl(),
      ].filter((origin): origin is string => Boolean(origin))
    )
  )
}

export function getFlowApiKey() {
  return firstNonEmpty(process.env.FLOW_API_KEY)
}

export function getFlowApiSecret() {
  return firstNonEmpty(process.env.FLOW_API_SECRET)
}

export function getFlowApiBase() {
  const value = firstNonEmpty(process.env.FLOW_API_BASE)
  return value ? normalizeUrl(value) : 'https://sandbox.flow.cl/api'
}

// A3: Umbrales del detector anticheat configurables por env. Permite
// endurecer o relajar sin redeploy. Si la variable no parsea, se usa el
// default conservador (no se rompe el detector).
function parseIntEnv(name: string, fallback: number, min = 1) {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= min ? n : fallback
}

export function getAnticheatConfig() {
  return {
    minHumanMoveMs: parseIntEnv('ANTICHEAT_MIN_HUMAN_MOVE_MS', 80),
    botBurstThreshold: parseIntEnv('ANTICHEAT_BOT_BURST_THRESHOLD', 5, 2),
    maxAvgPtsPerMove: parseIntEnv('ANTICHEAT_MAX_AVG_PTS_PER_MOVE', 350),
    minMovesForScoreCheck: parseIntEnv('ANTICHEAT_MIN_MOVES_FOR_SCORE_CHECK', 20),
  }
}
