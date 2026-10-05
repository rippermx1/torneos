export const firstNonEmpty = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim()
export const normalizeUrl = value => value.replace(/\/+$/, '')
export function deploymentEnvironment(env) {
  if (env.VERCEL_ENV === 'production') return 'production'
  return firstNonEmpty(env.TORNEOS_ENVIRONMENT) ?? (env.NODE_ENV === 'production' ? 'production' : 'development')
}
export function resolveFlowBase(env) {
  const value = firstNonEmpty(env.FLOW_API_BASE)
  if (deploymentEnvironment(env) === 'production' && (!value || normalizeUrl(value) !== 'https://www.flow.cl/api')) throw new Error('FLOW_API_BASE requiere el endpoint productivo explícito')
  return value ? normalizeUrl(value) : 'https://sandbox.flow.cl/api'
}
export function effectiveConfig(env) {
  return {
    environment: deploymentEnvironment(env),
    appUrl: firstNonEmpty(env.APP_URL, env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL),
    publicUrl: firstNonEmpty(env.NEXT_PUBLIC_SUPABASE_URL),
    serverUrl: firstNonEmpty(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
    browserKey: firstNonEmpty(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serverKey: firstNonEmpty(env.SUPABASE_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY),
    flowBase: firstNonEmpty(env.FLOW_API_BASE) ? normalizeUrl(firstNonEmpty(env.FLOW_API_BASE)) : 'https://sandbox.flow.cl/api',
  }
}
