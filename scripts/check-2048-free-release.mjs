import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

const expected = { version: 1, profile: '2048-free-v1', rewarded: 'demo', ticket: 'informational_unavailable', money: 'blocked' }
const nonempty = value => typeof value === 'string' && value.trim().length > 0
function origin(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) throw new Error('Invalid release origin')
  return url.origin
}

// Pure preflight: no dotenv loading, provider calls, mutations or environment values in errors.
export function validateFree2048Release(env, profile, cloud, target = 'development') {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
    || Object.keys(profile).length !== Object.keys(expected).length
    || Object.entries(expected).some(([key, value]) => profile[key] !== value)) throw new Error('Invalid free 2048 release profile')
  if (!['development', 'production'].includes(target)) throw new Error('Invalid free 2048 release target')
  for (const [key, value] of Object.entries(env)) {
    if (nonempty(value) && (/^FLOW_API_(?:KEY|SECRET)$/i.test(key) || key === 'FLOW_APÏ_KEY'
      || /^(?:UNITY_ADS|ADMOB|ADSENSE|AD_MANAGER|GAM|H5_GAMES_ADS|REWARDED_PROVIDER)_/.test(key))) {
      throw new Error('Free release requires payment and advertising provider credentials absent')
    }
    if (key.startsWith('NEXT_PUBLIC_') && nonempty(value)) {
      let privileged = value.includes('sb_secret_')
      if (value.startsWith('eyJ')) {
        try { privileged ||= JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'service_role' } catch { /* Opaque public values are not interpreted as authorization. */ }
      }
      if (privileged) throw new Error('Server credential in public configuration')
    }
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serverKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!nonempty(publicKey) || !nonempty(serverKey) || publicKey === serverKey) throw new Error('Separate public and server credentials required')
  if (target === 'development') {
    const checked = validateCloudDevelopment(env, cloud)
    return { profile: expected.profile, target, appUrl: checked.appUrl, supabaseProjectRef: checked.supabaseProjectRef,
      money: 'blocked', rewarded: 'demo', ticket: expected.ticket, flow: 'unconfigured' }
  }
  if (env.TORNEOS_ENV !== 'production-free-2048') throw new Error('Explicit free production identity required')
  const appUrl = origin(env.APP_URL)
  if (env.NEXT_PUBLIC_SITE_URL !== appUrl || appUrl === cloud.appUrl
    || new URL(appUrl).hostname.endsWith('.vercel.app')) throw new Error('Free production canonical origin required')
  const ref = env.PRODUCTION_SUPABASE_PROJECT_REF
  if (!/^[a-z]{20}$/.test(ref ?? '') || ref === cloud.supabaseProjectRef
    || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`
    || env.SUPABASE_SERVER_URL && env.SUPABASE_SERVER_URL !== env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Separate free production database identity required')
  if (env.DEVELOPMENT_SUPABASE_PROJECT_REF || env.TORNEOS_LOCAL_MODE === '1') throw new Error('Development configuration in free production')
  if (env.FLOW_API_BASE) throw new Error('Flow is not configured in the free production profile')
  if (!/^[a-f0-9]{64}$/.test(env.CRON_SECRET ?? '')) throw new Error('Operational scheduler identity required')
  return { profile: expected.profile, target, appUrl, supabaseProjectRef: ref,
    money: 'blocked', rewarded: 'demo', ticket: expected.ticket, flow: 'unconfigured' }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = process.argv.slice(2)
    if (args.length && (args.length !== 2 || args[0] !== '--target')) throw new Error('Use --target development|production')
    const target = args.length ? args[1] : process.env.TORNEOS_ENV === 'cloud-development' ? 'development'
      : process.env.TORNEOS_ENV === 'production-free-2048' ? 'production' : null
    const profile = JSON.parse(fs.readFileSync(new URL('../config/2048-free-release.json', import.meta.url), 'utf8'))
    const cloud = JSON.parse(fs.readFileSync(new URL('../config/cloud-development.json', import.meta.url), 'utf8'))
    console.log(JSON.stringify(validateFree2048Release(process.env, profile, cloud, target)))
  } catch {
    console.error('Free 2048 preflight failed; check profile, isolated target and absence of payment/advertising credentials.')
    process.exitCode = 1
  }
}
