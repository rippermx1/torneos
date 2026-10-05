import { effectiveConfig, firstNonEmpty, normalizeUrl } from './effective.mjs'
import { isValidRut } from '../identity/rut.mjs'

const placeholder = value => !value || /REEMPLAZAR|CHANGEME|YOUR[_ -]|PLACEHOLDER/i.test(value)
const email = value => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
function httpsOrigin(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && !url.port && url.hostname.includes('.') && !/^\d+\./.test(url.hostname) && !/\.localhost$|\.local$|\.internal$/.test(url.hostname) ? url.origin : null } catch { return null }
}
function jwtClaims(value) {
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')) } catch { return null }
}
export function validateEnvironment(env, { phase = 'runtime', builtPublic } = {}) {
  const c = effectiveConfig(env), issues = [], warnings = []
  const requireValue = name => { const value = firstNonEmpty(env[name]); if (placeholder(value)) issues.push(`${name}: requerido sin placeholders`); return value }
  if (!['production', 'staging', 'local', 'development'].includes(c.environment)) issues.push('TORNEOS_ENVIRONMENT: valor inválido')
  if (env.VERCEL_ENV === 'production' && env.TORNEOS_ENVIRONMENT && env.TORNEOS_ENVIRONMENT !== 'production') issues.push('TORNEOS_ENVIRONMENT contradice VERCEL_ENV')
  const local = ['local', 'development'].includes(c.environment)
  if (local) {
    if (phase === 'runtime' && env.NODE_ENV === 'production') {
      const loop = value => { try { const u = new URL(value); return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(u.hostname) } catch { return false } }
      if (c.environment !== 'local' || env.TORNEOS_LOCAL_MODE !== '1' || ![c.appUrl, c.publicUrl, c.serverUrl, c.flowBase].every(loop)) issues.push('Runtime productivo solo permite modo local en loopback con simulador aislado')
    }
  } else {
    if (!httpsOrigin(c.appUrl)) issues.push('APP_URL efectivo: origen HTTPS canónico requerido')
    if (!firstNonEmpty(env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL)) issues.push('Origen público NEXT_PUBLIC_APP_URL o NEXT_PUBLIC_SITE_URL requerido para congelar callbacks')
    for (const name of ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL']) {
      const value = firstNonEmpty(env[name]); if (value && (!httpsOrigin(value) || normalizeUrl(value) !== normalizeUrl(c.appUrl ?? ''))) issues.push(`${name}: origen contradictorio o inválido`)
    }
    const refName = c.environment === 'production' ? 'PRODUCTION_SUPABASE_PROJECT_REF' : 'STAGING_SUPABASE_PROJECT_REF'
    const ref = requireValue(refName)
    if (!/^[a-z0-9]{20}$/.test(ref ?? '')) issues.push(`${refName}: formato inválido`)
    if (!httpsOrigin(c.publicUrl) || c.publicUrl !== `https://${ref}.supabase.co`) issues.push('NEXT_PUBLIC_SUPABASE_URL no coincide con el proyecto destino')
    if (c.serverUrl !== c.publicUrl) issues.push('SUPABASE_SERVER_URL no coincide con la URL pública destino')
    if (c.environment === 'staging' && !/^[a-z0-9]{20}$/.test(requireValue('PRODUCTION_SUPABASE_PROJECT_REF') ?? '')) issues.push('Proyecto productivo protegido requerido para aislar staging')
    if (c.environment === 'staging' && ref === env.PRODUCTION_SUPABASE_PROJECT_REF) issues.push('Staging no puede usar el proyecto productivo protegido')
    const key = (value, kind) => {
      if (placeholder(value)) { issues.push(`Supabase ${kind}: clave requerida sin placeholders`); return }
      const modern = kind === 'browser' ? /^sb_publishable_[A-Za-z0-9_-]{20,}$/ : /^sb_secret_[A-Za-z0-9_-]{20,}$/
      if (modern.test(value)) return
      const claims = jwtClaims(value)
      if (claims?.role !== (kind === 'browser' ? 'anon' : 'service_role') || claims.ref !== ref || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) issues.push(`Supabase ${kind}: tipo, proyecto o vigencia de clave inválidos`)
      else warnings.push(`Supabase ${kind}: JWT legacy; validar credencial en staging, no solo claims decodificados`)
    }
    key(c.browserKey, 'browser')
    if (phase === 'runtime') {
      key(c.serverKey, 'server')
      if (c.serverKey && c.serverKey === c.browserKey) issues.push('Las claves pública y privada deben ser distintas')
      const flowBases = c.environment === 'production' ? ['https://www.flow.cl/api'] : ['https://sandbox.flow.cl/api', 'https://www.flow.cl/api']
      if (!firstNonEmpty(env.FLOW_API_BASE) || !flowBases.includes(c.flowBase)) issues.push('FLOW_API_BASE: endpoint explícito incorrecto para destino')
      if (c.environment === 'staging' && c.flowBase === 'https://www.flow.cl/api') warnings.push('Flow productivo en staging: los cobros y devoluciones son reales; requiere ensayo acotado y autorizado')
      for (const name of ['FLOW_API_KEY', 'FLOW_API_SECRET', 'COMPANY_LEGAL_NAME']) requireValue(name)
      if (!isValidRut(requireValue('COMPANY_RUT'))) issues.push('COMPANY_RUT: dígito verificador inválido')
      if ((requireValue('CRON_SECRET') ?? '').length < 32) issues.push('CRON_SECRET: mínimo 32 caracteres')
      if (!/^re_[A-Za-z0-9_-]{20,}$/.test(requireValue('RESEND_API_KEY') ?? '')) issues.push('RESEND_API_KEY: formato inválido')
      const from = requireValue('RESEND_FROM_EMAIL'), address = from?.match(/<([^<>]+)>$/)?.[1] ?? from
      if (!email(address)) issues.push('RESEND_FROM_EMAIL: remitente inválido')
      const primary = requireValue('ALERT_EMAIL'), backup = requireValue('OPS_ESCALATION_EMAIL')
      if (!email(primary) || !email(backup) || primary?.toLowerCase() === backup?.toLowerCase()) issues.push('Alertas: titular y suplente distintos y válidos requeridos')
      for (const name of ['TORNEOS_LOCAL_MODE', 'LOCAL_EMAIL_API_URL', 'LOCAL_FLOW_DATA_DIR', 'SUPABASE_E2E_PASSWORD']) if (firstNonEmpty(env[name])) issues.push(`${name}: configuración local/sintética prohibida fuera de local`)
    }
  }
  if (builtPublic && (builtPublic.url !== c.publicUrl || builtPublic.key !== c.browserKey)) issues.push('Supabase público congelado en build contradice runtime; reconstruir artefacto')
  if (builtPublic?.environment && builtPublic.environment !== c.environment) issues.push('Destino congelado en build contradice runtime')
  for (const [name, value] of Object.entries(builtPublic?.aliases ?? {})) if ((firstNonEmpty(env[name]) ?? null) !== value) issues.push(`${name}: alias público congelado contradice runtime`)
  // Inspect every public variable, not only known aliases; values never enter error output.
  const privateValues = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'FLOW_API_KEY', 'FLOW_API_SECRET', 'CRON_SECRET', 'RESEND_API_KEY', 'SUPABASE_E2E_PASSWORD'].map(name => firstNonEmpty(env[name])).filter(Boolean)
  for (const [name, value] of Object.entries(env)) if (name.startsWith('NEXT_PUBLIC_') && value && (/SECRET|SERVICE_ROLE|PASSWORD|FLOW_API|CRON_SECRET|RESEND_API/.test(name) || privateValues.includes(firstNonEmpty(value)) || /^sb_secret_/.test(value) || jwtClaims(value)?.role === 'service_role')) issues.push(`${name}: credencial privada expuesta al navegador`)
  return { ok: issues.length === 0, environment: c.environment, phase, issues, warnings }
}
export function assertEnvironment(env, options) {
  const result = validateEnvironment(env, options)
  if (!result.ok) throw new Error(`Configuración rechazada (${result.environment}/${result.phase}): ${result.issues.join('; ')}`)
  return result
}
