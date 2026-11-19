import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCloudDevelopment } from './check-cloud-development.mjs'
import { getFlowApiBase } from '../lib/env.ts'
const config = { supabaseProjectRef: 'jnoyjewsqbooqaiighcs', protectedSupabaseProjectRefs: ['baeylvoipmazcthnwxmz'] }
const env = { TORNEOS_ENV: 'cloud-development', DEVELOPMENT_SUPABASE_PROJECT_REF: config.supabaseProjectRef, NEXT_PUBLIC_SUPABASE_URL: `https://${config.supabaseProjectRef}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test', APP_URL: 'https://torneos-dev.vercel.app', NEXT_PUBLIC_SITE_URL: 'https://torneos-dev.vercel.app', FLOW_API_BASE: 'https://sandbox.flow.cl/api', NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CRON_SECRET: 'a'.repeat(64) }
test('admite recursos de desarrollo y pagos no configurados', () => assert.equal(validateCloudDevelopment(env, config).flow, 'unconfigured'))
for (const [name, patch] of Object.entries({ productionDatabase: { NEXT_PUBLIC_SUPABASE_URL: 'https://baeylvoipmazcthnwxmz.supabase.co' }, productionFlow: { FLOW_API_BASE: 'https://www.flow.cl/api' }, internalDatabase: { SUPABASE_SERVER_URL: 'https://baeylvoipmazcthnwxmz.supabase.co' }, publicSecret: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_accidental' }, productionDomain: { APP_URL: 'https://www.torneosplay.cl' }, externalEmail: { RESEND_API_KEY: 'unexpected' }, localSimulator: { TORNEOS_LOCAL_MODE: '1' }, incompleteFlow: { FLOW_API_KEY: 'only-key' } })) {
  test(`rechaza ${name}`, () => assert.throws(() => validateCloudDevelopment({ ...env, ...patch }, config)))
}
test('rechaza un proyecto protegido aun si las URLs coinciden', () => assert.throws(() => validateCloudDevelopment({ ...env, DEVELOPMENT_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz', NEXT_PUBLIC_SUPABASE_URL: 'https://baeylvoipmazcthnwxmz.supabase.co' }, { ...config, supabaseProjectRef: 'baeylvoipmazcthnwxmz' })))
test('runtime bloquea Flow productivo en desarrollo', () => {
  const previous = { TORNEOS_ENV: process.env.TORNEOS_ENV, FLOW_API_BASE: process.env.FLOW_API_BASE }
  try {
    process.env.TORNEOS_ENV = 'cloud-development'
    process.env.FLOW_API_BASE = 'https://www.flow.cl/api'
    assert.throws(() => getFlowApiBase(), /sandbox/)
    process.env.FLOW_API_BASE = 'https://sandbox.flow.cl/api'
    assert.equal(getFlowApiBase(), 'https://sandbox.flow.cl/api')
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
