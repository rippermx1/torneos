import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export function validateCloudDevelopment(env, config) {
  const fail = message => { throw new Error(`Ambiente cloud de desarrollo: ${message}`) }
  if (env.TORNEOS_ENV !== 'cloud-development') fail('identificación requerida')
  const ref = config.supabaseProjectRef
  if (!/^[a-z]{20}$/.test(ref) || config.protectedSupabaseProjectRefs.includes(ref)) fail('proyecto no permitido')
  if (env.DEVELOPMENT_SUPABASE_PROJECT_REF !== ref || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) fail('Supabase debe ser el proyecto de desarrollo')
  if (env.SUPABASE_SERVER_URL && env.SUPABASE_SERVER_URL !== env.NEXT_PUBLIC_SUPABASE_URL) fail('URL interna debe coincidir con desarrollo')
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) fail('falta clave pública')
  if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) fail('falta clave de servidor')
  const app = new URL(env.APP_URL)
  if (app.protocol !== 'https:' || !app.hostname.endsWith('.vercel.app') || app.hostname.includes('torneosplay') || app.username || app.password || app.pathname !== '/' || app.search || app.hash) fail('APP_URL debe ser el dominio Vercel de desarrollo')
  if (env.NEXT_PUBLIC_SITE_URL !== app.origin) fail('URL pública debe coincidir con APP_URL')
  if (env.FLOW_API_BASE !== 'https://sandbox.flow.cl/api') fail('Flow debe usar sandbox')
  if (!!env.FLOW_API_KEY !== !!env.FLOW_API_SECRET) fail('credenciales sandbox incompletas')
  if (env.RESEND_API_KEY) fail('correo transaccional externo no configurado para desarrollo')
  if (env.TORNEOS_LOCAL_MODE === '1') fail('el simulador local no funciona en cloud')
  if (env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== 'false') fail('Google requiere configurar un proveedor propio de desarrollo')
  if (!/^[a-f0-9]{64}$/.test(env.CRON_SECRET ?? '')) fail('CRON_SECRET requiere 64 caracteres hexadecimales')
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NEXT_PUBLIC_') && /sb_secret_/.test(value)) fail(`secreto en ${key}`)
  }
  return { environment: env.TORNEOS_ENV, supabaseProjectRef: ref, appUrl: app.origin, flow: env.FLOW_API_KEY ? 'sandbox' : 'unconfigured', email: 'disabled' }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(fs.readFileSync(new URL('../config/cloud-development.json', import.meta.url), 'utf8'))
  console.log(JSON.stringify(validateCloudDevelopment(process.env, config)))
}
