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
  // Hubo un período con la variable mal escrita ("FLOW_APÏ_KEY"); aceptamos ambos
  // hasta que todos los entornos estén normalizados, luego se elimina el fallback.
  return firstNonEmpty(
    process.env.FLOW_API_KEY,
    process.env['FLOW_APÏ_KEY']
  )
}

export function getFlowApiSecret() {
  return firstNonEmpty(process.env.FLOW_API_SECRET)
}

export function getFlowApiBase() {
  const value = firstNonEmpty(process.env.FLOW_API_BASE)
  return value ? normalizeUrl(value) : 'https://sandbox.flow.cl/api'
}
