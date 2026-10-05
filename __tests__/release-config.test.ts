import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateEnvironment } from '@/lib/config/validate.mjs'
import { effectiveConfig } from '@/lib/config/effective.mjs'
import { getFlowApiBase, getSupabaseBrowserKey, getSupabaseServiceKey, getSupabaseServerUrl, getAppUrl, getAllowedOrigins } from '@/lib/env'

export const deploymentFixture = () => ({ NODE_ENV: 'production', TORNEOS_ENVIRONMENT: 'production', APP_URL: 'https://torneos.example.org', NEXT_PUBLIC_SITE_URL: 'https://torneos.example.org', NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', PRODUCTION_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(30)}`, SUPABASE_SECRET_KEY: `sb_secret_${'b'.repeat(30)}`, FLOW_API_BASE: 'https://www.flow.cl/api', FLOW_API_KEY: 'c'.repeat(32), FLOW_API_SECRET: 'd'.repeat(32), COMPANY_LEGAL_NAME: 'Empresa de prueba limitada', COMPANY_RUT: '12.345.678-5', CRON_SECRET: 'e'.repeat(64), RESEND_API_KEY: `re_${'f'.repeat(32)}`, RESEND_FROM_EMAIL: 'Torneos <ops@example.org>', ALERT_EMAIL: 'owner@example.org', OPS_ESCALATION_EMAIL: 'backup@example.org' })
afterEach(() => vi.unstubAllEnvs())
describe('RM11 one effective configuration contract', () => {
  it('accepts a structurally complete fixture without claiming credentials were authenticated', () => expect(validateEnvironment(deploymentFixture()).ok).toBe(true))
  it.each(['', ' ', 'https://sandbox.flow.cl/api', 'https://evil.example.org/api', 'https://www.flow.cl/api?key=hidden', 'http://www.flow.cl/api', 'https://user:secret@www.flow.cl/api'])('rejects unsafe or missing production Flow endpoint %s', value => {
    const result = validateEnvironment({ ...deploymentFixture(), FLOW_API_BASE: value }); expect(result.ok).toBe(false); expect(result.issues.join()).not.toContain('hidden'); expect(result.issues.join()).not.toContain('user:secret')
  })
  it('effective sandbox fallback can never pass production validation or dispatch getter', () => {
    const fixture = deploymentFixture(); delete (fixture as Partial<typeof fixture>).FLOW_API_BASE
    expect(effectiveConfig(fixture).flowBase).toBe('https://sandbox.flow.cl/api'); expect(validateEnvironment(fixture).ok).toBe(false)
    vi.stubEnv('TORNEOS_ENVIRONMENT', 'production'); vi.stubEnv('FLOW_API_BASE', '')
    expect(() => getFlowApiBase()).toThrow('explícito')
  })
  it('uses the same trimmed precedence as current runtime getters', () => {
    const fixture = deploymentFixture(); for (const [name, value] of Object.entries(fixture)) vi.stubEnv(name, value)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ignored'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ignored'); vi.stubEnv('SUPABASE_SERVER_URL', fixture.NEXT_PUBLIC_SUPABASE_URL)
    const effective = effectiveConfig(process.env)
    expect(getSupabaseBrowserKey()).toBe(effective.browserKey); expect(getSupabaseServiceKey()).toBe(effective.serverKey); expect(getSupabaseServerUrl()).toBe(effective.serverUrl); expect(getAppUrl()).toBe(effective.appUrl); expect(getFlowApiBase()).toBe(effective.flowBase)
  })
  it.each(['APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PRODUCTION_SUPABASE_PROJECT_REF', 'SUPABASE_SECRET_KEY', 'FLOW_API_KEY', 'FLOW_API_SECRET', 'COMPANY_LEGAL_NAME', 'COMPANY_RUT', 'CRON_SECRET', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'ALERT_EMAIL', 'OPS_ESCALATION_EMAIL'])('rejects missing/placeholder %s', name => {
    expect(validateEnvironment({ ...deploymentFixture(), [name]: 'REEMPLAZAR' }).ok).toBe(false)
  })
  it.each(['http://localhost:3000', 'https://127.0.0.1', 'https://ops:password@torneos.example.org', 'https://torneos.example.org/prefix', 'https://torneos.example.org?secret=hidden'])('rejects wrong callback origin %s', url => expect(validateEnvironment({ ...deploymentFixture(), APP_URL: url }).ok).toBe(false))
  it('rejects conflicting browser URL, server URL, origins and frozen public keys', () => {
    const fixture = deploymentFixture()
    for (const change of [{ SUPABASE_SERVER_URL: 'http://host.docker.internal:54321' }, { NEXT_PUBLIC_APP_URL: 'https://other.example.org' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixture.SUPABASE_SECRET_KEY }]) expect(validateEnvironment({ ...fixture, ...change }).ok).toBe(false)
    expect(validateEnvironment(fixture, { builtPublic: { url: fixture.NEXT_PUBLIC_SUPABASE_URL, key: 'different' } }).ok).toBe(false)
  })
  it('validates public build separately without requiring private build secrets', () => {
    const fixture = deploymentFixture(); const publicOnly = Object.fromEntries(Object.entries(fixture).filter(([name]) => name.startsWith('NEXT_PUBLIC_') || ['APP_URL', 'TORNEOS_ENVIRONMENT', 'PRODUCTION_SUPABASE_PROJECT_REF'].includes(name)))
    expect(validateEnvironment(publicOnly, { phase: 'public-build' }).ok).toBe(true); expect(validateEnvironment(publicOnly).ok).toBe(false)
  })
  it('requires distinct protected staging project and explicit sandbox', () => {
    const staging = { ...deploymentFixture(), TORNEOS_ENVIRONMENT: 'staging', STAGING_SUPABASE_PROJECT_REF: 'zyxwvutsrqponmlkjihg', NEXT_PUBLIC_SUPABASE_URL: 'https://zyxwvutsrqponmlkjihg.supabase.co', FLOW_API_BASE: 'https://sandbox.flow.cl/api' }
    expect(validateEnvironment(staging).ok).toBe(true); expect(validateEnvironment({ ...staging, STAGING_SUPABASE_PROJECT_REF: staging.PRODUCTION_SUPABASE_PROJECT_REF }).ok).toBe(false)
  })
  it.each(['TORNEOS_LOCAL_MODE', 'LOCAL_FLOW_DATA_DIR', 'LOCAL_EMAIL_API_URL', 'SUPABASE_E2E_PASSWORD'])('rejects local/synthetic runtime setting %s', name => expect(validateEnvironment({ ...deploymentFixture(), [name]: '1' }).ok).toBe(false))
  it('permits standalone local simulation only with all endpoints on loopback', () => {
    const local = { NODE_ENV: 'production', TORNEOS_ENVIRONMENT: 'local', TORNEOS_LOCAL_MODE: '1', APP_URL: 'http://127.0.0.1:3081', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVER_URL: 'http://host.docker.internal:54321', FLOW_API_BASE: 'http://127.0.0.1:3081/api/dev/flow' }
    expect(validateEnvironment(local).ok).toBe(true); expect(validateEnvironment({ ...local, VERCEL_ENV: 'production' }).ok).toBe(false); expect(validateEnvironment({ ...local, SUPABASE_SERVER_URL: 'https://abcdefghijklmnopqrst.supabase.co' }).ok).toBe(false)
  })
  it('rejects same alert recipient and invalid company checksum', () => {
    const fixture = deploymentFixture(); expect(validateEnvironment({ ...fixture, OPS_ESCALATION_EMAIL: fixture.ALERT_EMAIL }).ok).toBe(false); expect(validateEnvironment({ ...fixture, COMPANY_RUT: '12.345.678-0' }).ok).toBe(false)
  })
  it('never prints credential values even when public leakage is detected', () => {
    const fixture = deploymentFixture(); const result = validateEnvironment({ ...fixture, NEXT_PUBLIC_UNKNOWN: fixture.SUPABASE_SECRET_KEY })
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(fixture.SUPABASE_SECRET_KEY)
  })
  it.each(['FLOW_API_KEY', 'FLOW_API_SECRET'] as const)('rejects %s hidden behind an innocuous public variable name', name => {
    const fixture = deploymentFixture(); expect(validateEnvironment({ ...fixture, NEXT_PUBLIC_TITLE: fixture[name] }).ok).toBe(false)
  })
  it('requires the protected production reference to validate staging isolation', () => {
    const fixture = deploymentFixture()
    expect(validateEnvironment({ ...fixture, TORNEOS_ENVIRONMENT: 'staging', STAGING_SUPABASE_PROJECT_REF: fixture.PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_PROJECT_REF: undefined }).ok).toBe(false)
  })
  it('rejects frozen target and absent alias changes even with identical Supabase', () => {
    const fixture = deploymentFixture()
    const builtPublic = { url: fixture.NEXT_PUBLIC_SUPABASE_URL, key: fixture.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, environment: 'staging' }
    expect(validateEnvironment(fixture, { builtPublic }).ok).toBe(false)
    expect(validateEnvironment(fixture, { builtPublic: { ...builtPublic, environment: 'production', aliases: { NEXT_PUBLIC_APP_URL: null } } }).ok).toBe(true)
    expect(validateEnvironment({ ...fixture, NEXT_PUBLIC_APP_URL: fixture.APP_URL }, { builtPublic: { ...builtPublic, environment: 'production', aliases: { NEXT_PUBLIC_APP_URL: null } } }).ok).toBe(false)
  })
  it('does not allow local origins in commercial staging or production', () => {
    vi.stubEnv('TORNEOS_ENVIRONMENT', 'production'); vi.stubEnv('APP_URL', 'https://torneos.example.org')
    expect(getAllowedOrigins()).toEqual(['https://torneos.example.org'])
  })

})
