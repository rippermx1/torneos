import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

loadEnvConfig(rootDir)

const issues = []
const warnings = []

function firstNonEmpty(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function requireOne(label, ...names) {
  const value = firstNonEmpty(...names)
  if (!value) {
    issues.push(`${label}: falta configurar ${names.join(' o ')}`)
  }
  return value
}

function isLocalUrl(value) {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

const appUrl = requireOne('APP_URL', 'APP_URL', 'NEXT_PUBLIC_APP_URL')
const clerkPublishableKey = requireOne(
  'Clerk publishable key',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
)
const clerkSecretKey = requireOne('Clerk secret key', 'CLERK_SECRET_KEY')
const supabaseUrl = requireOne('Supabase URL', 'NEXT_PUBLIC_SUPABASE_URL')
requireOne('Supabase anon key', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
requireOne('Supabase service role key', 'SUPABASE_SERVICE_ROLE_KEY')
const mercadoPagoAccessToken = requireOne(
  'Mercado Pago access token',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MP_API_TOKEN'
)
requireOne(
  'Mercado Pago webhook secret',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'MP_SECRET_WEBHOOK'
)
const cronSecret = requireOne('CRON_SECRET', 'CRON_SECRET')

if (appUrl) {
  try {
    const url = new URL(appUrl)
    if (url.protocol !== 'https:') {
      issues.push('APP_URL debe usar https en produccion')
    }
    if (isLocalUrl(appUrl)) {
      issues.push('APP_URL no puede apuntar a localhost en produccion')
    }
  } catch {
    issues.push('APP_URL no es una URL valida')
  }
}

if (clerkPublishableKey?.startsWith('pk_test_')) {
  issues.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY sigue usando una key de desarrollo')
}

if (clerkSecretKey?.startsWith('sk_test_')) {
  issues.push('CLERK_SECRET_KEY sigue usando una key de desarrollo')
}

if (supabaseUrl && isLocalUrl(supabaseUrl)) {
  issues.push('NEXT_PUBLIC_SUPABASE_URL sigue apuntando a localhost')
}

if (mercadoPagoAccessToken?.startsWith('TEST-')) {
  issues.push('Mercado Pago sigue usando access token de prueba')
}

if (cronSecret && cronSecret.length < 32) {
  issues.push('CRON_SECRET debe tener al menos 32 caracteres')
}

if (!firstNonEmpty('SENTRY_DSN')) {
  warnings.push('SENTRY_DSN no esta configurado')
}

if (!firstNonEmpty('NEXT_PUBLIC_POSTHOG_KEY')) {
  warnings.push('NEXT_PUBLIC_POSTHOG_KEY no esta configurado')
}

if (issues.length > 0) {
  console.error('Production env check failed:')
  issues.forEach((issue) => console.error(`- ${issue}`))
  if (warnings.length > 0) {
    console.error('')
    console.error('Warnings:')
    warnings.forEach((warning) => console.error(`- ${warning}`))
  }
  process.exit(1)
}

console.log('Production env check passed.')
if (warnings.length > 0) {
  console.log('Warnings:')
  warnings.forEach((warning) => console.log(`- ${warning}`))
}
