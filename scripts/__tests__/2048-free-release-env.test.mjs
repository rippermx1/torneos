import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateFree2048Release } from '../check-2048-free-release.mjs'

const profile = { version: 1, profile: '2048-free-v1', rewarded: 'demo', ticket: 'informational_unavailable', money: 'blocked' }
const cloud = { supabaseProjectRef: 'jnoyjewsqbooqaiighcs', appUrl: 'https://torneos-dev.vercel.app', protectedSupabaseProjectRefs: ['baeylvoipmazcthnwxmz'] }
const dev = () => ({ TORNEOS_ENV: 'cloud-development', DEVELOPMENT_SUPABASE_PROJECT_REF: cloud.supabaseProjectRef,
  APP_URL: cloud.appUrl, NEXT_PUBLIC_SITE_URL: cloud.appUrl, NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.supabaseProjectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-key', SUPABASE_SECRET_KEY: 'sb_secret_private-test',
  FLOW_API_BASE: 'https://sandbox.flow.cl/api', NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CRON_SECRET: 'a'.repeat(64) })
const prod = () => ({ TORNEOS_ENV: 'production-free-2048', APP_URL: 'https://free.example.com', NEXT_PUBLIC_SITE_URL: 'https://free.example.com',
  PRODUCTION_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-key', SUPABASE_SECRET_KEY: 'sb_secret_private-test',
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', CRON_SECRET: 'b'.repeat(64) })

test('development identifies its own database, free profile and no provider', () => {
  assert.deepEqual(validateFree2048Release(dev(), profile, cloud), { profile: '2048-free-v1', target: 'development', appUrl: cloud.appUrl,
    supabaseProjectRef: cloud.supabaseProjectRef, money: 'blocked', rewarded: 'demo', ticket: 'informational_unavailable', flow: 'unconfigured' })
})
test('free production preflight needs no Flow credentials or commercial company fields and performs no IO', () => {
  assert.equal(validateFree2048Release(prod(), profile, cloud, 'production').target, 'production')
})
test('profile cannot enable money, ads, a purchasable ticket or unknown capabilities', () => {
  for (const patch of [{ money: 'enabled' }, { money: false }, { rewarded: 'real' }, { ticket: 'available' }, { enablePayments: true }, { profile: 'commercial-v1' }]) {
    assert.throws(() => validateFree2048Release(dev(), { ...profile, ...patch }, cloud))
  }
})
test('payment and ad credentials stop both targets, including inherited credentials and legacy alias', () => {
  for (const key of ['FLOW_API_KEY', 'FLOW_API_SECRET', 'FLOW_APÏ_KEY', 'UNITY_ADS_KEY', 'ADMOB_ID', 'REWARDED_PROVIDER_SECRET',
    'MP_ACCESS_TOKEN', 'MP_PUBLIC_KEY', 'MP_WEBHOOK_SECRET', 'MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_FUTURE_CREDENTIAL',
    'MERCADOPAGO_ACCESS_TOKEN', 'MERCADO_PAGO_ACCESS_TOKEN', 'NEXT_PUBLIC_MP_PUBLIC_KEY', 'NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY',
    'NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY', 'mp_access_token', 'rewarded_provider_secret']) {
    for (const [env, target] of [[dev(), 'development'], [prod(), 'production']]) {
      assert.throws(() => validateFree2048Release({ ...env, [key]: 'private-value' }, profile, cloud, target), error => {
        assert.equal(error.message, 'Free release requires payment and advertising provider credentials absent')
        assert.equal(error.message.includes('private-value'), false)
        return true
      })
    }
  }
})
test('both targets require Google authentication explicitly false', () => {
  for (const [env, target] of [[dev(), 'development'], [prod(), 'production']]) {
    for (const value of [undefined, '', 'true', 'FALSE', '0', false]) {
      assert.throws(() => validateFree2048Release({ ...env, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: value }, profile, cloud, target))
    }
    assert.equal(validateFree2048Release(env, profile, cloud, target).target, target)
  }
})
test('empty provider variables are absent while credentials cannot hide in surrounding whitespace', () => {
  for (const [env, target] of [[dev(), 'development'], [prod(), 'production']]) {
    for (const key of ['FLOW_API_KEY', 'FLOW_API_SECRET', 'MP_ACCESS_TOKEN', 'NEXT_PUBLIC_MP_PUBLIC_KEY', 'REWARDED_PROVIDER_SECRET']) {
      assert.equal(validateFree2048Release({ ...env, [key]: '' }, profile, cloud, target).target, target)
      assert.throws(() => validateFree2048Release({ ...env, [key]: '  private-value  ' }, profile, cloud, target))
    }
    assert.equal(validateFree2048Release({ ...env, MP_ACCESS_TOKEN: '  ' }, profile, cloud, target).target, target)
  }
})
test('production cannot accidentally reuse development URL, project, simulator or provider', () => {
  for (const patch of [{ TORNEOS_ENV: 'cloud-development' }, { APP_URL: cloud.appUrl, NEXT_PUBLIC_SITE_URL: cloud.appUrl },
    { PRODUCTION_SUPABASE_PROJECT_REF: cloud.supabaseProjectRef, NEXT_PUBLIC_SUPABASE_URL: `https://${cloud.supabaseProjectRef}.supabase.co` },
    { DEVELOPMENT_SUPABASE_PROJECT_REF: cloud.supabaseProjectRef }, { TORNEOS_LOCAL_MODE: '1' },
    { SUPABASE_SERVER_URL: 'https://other.supabase.co' }, { FLOW_API_BASE: 'https://sandbox.flow.cl/api' }, { CRON_SECRET: '' }]) {
    assert.throws(() => validateFree2048Release({ ...prod(), ...patch }, profile, cloud, 'production'))
  }
})
test('public credentials and canonical origins are checked without disclosing values', () => {
  const serviceJwt = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.test'
  for (const patch of [{ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_leaked' }, { NEXT_PUBLIC_CUSTOM: serviceJwt },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'same', SUPABASE_SECRET_KEY: 'same' },
    { APP_URL: 'https://user:password@free.example.com' }, { APP_URL: 'http://localhost:3000' },
    { APP_URL: 'https://free.example.com/path' }, { NEXT_PUBLIC_SITE_URL: 'https://other.example.com' }]) {
    assert.throws(() => validateFree2048Release({ ...prod(), ...patch }, profile, cloud, 'production'), error => {
      assert.equal(error.message.includes('password'), false); assert.equal(error.message.includes('leaked'), false); return true
    })
  }
})
test('the deployment CLI infers development from identity and reports only public status', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../check-2048-free-release.mjs', import.meta.url))],
    { env: dev(), encoding: 'utf8', windowsHide: true })
  assert.equal(JSON.parse(output).target, 'development')
  assert.equal(output.includes('private-test'), false)
})
test('the free production CLI validates configuration without credentials for Flow or network access', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../check-2048-free-release.mjs', import.meta.url)), '--target', 'production'],
    { env: prod(), encoding: 'utf8', windowsHide: true })
  assert.equal(JSON.parse(output).money, 'blocked')
})
test('production CLI fails closed for inherited MP credentials or enabled Google without revealing configuration', () => {
  for (const patch of [{ MP_ACCESS_TOKEN: 'private-payment-token' }, { NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'true' }]) {
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('../check-2048-free-release.mjs', import.meta.url)), '--target', 'production'],
      { env: { ...prod(), ...patch }, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }), error => {
      assert.equal(error.status, 1)
      assert.equal(error.stdout, '')
      assert.equal(error.stderr.includes('private-payment-token'), false)
      assert.equal(error.stderr.includes('private-test'), false)
      return true
    })
  }
})
test('unknown deployment identity cannot silently skip the preflight', () => {
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('../check-2048-free-release.mjs', import.meta.url))],
    { env: { ...dev(), TORNEOS_ENV: 'unexpected' }, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }), error => {
    assert.equal(error.status, 1); assert.equal(error.stderr.includes('private-test'), false); return true
  })
})
