import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateEnvironment } from '@/lib/config/validate.mjs'
import { flowGet, flowPost } from '@/lib/flow/client'
import { sendEmail, sendTemplateEmail } from '@/lib/email/client'
import { sendOperationalEmail } from '@/lib/email/operational'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const fixture = () => ({ NODE_ENV: 'production', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_dev', STAGING_VERCEL_PROJECT_ID: 'prj_dev', PRODUCTION_VERCEL_PROJECT_ID: 'prj_prod', TORNEOS_ENVIRONMENT: 'staging', STAGING_PHASE: 'preflight', STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', PRODUCTION_SUPABASE_PROJECT_REF: 'zyxwvutsrqponmlkjihg', APP_URL: 'https://dev.example.org', NEXT_PUBLIC_SITE_URL: 'https://dev.example.org', NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(30)}`, SUPABASE_SECRET_KEY: `sb_secret_${'b'.repeat(30)}`, FLOW_API_BASE: 'https://www.flow.cl/api', CRON_SECRET: 'c'.repeat(64) })
describe('isolated staging preflight', () => {
  it('accepts the dev project production channel without provider keys', () => {
    expect(validateEnvironment(fixture()).ok).toBe(true)
  })
  it.each(['prj_prod', 'prj_other', ''])('rejects an unexpected hosting project %s', VERCEL_PROJECT_ID => {
    expect(validateEnvironment({ ...fixture(), VERCEL_PROJECT_ID }).ok).toBe(false)
  })
  it('rejects a production database and forbids provider credentials', () => {
    expect(validateEnvironment({ ...fixture(), PRODUCTION_SUPABASE_PROJECT_REF: fixture().STAGING_SUPABASE_PROJECT_REF }).ok).toBe(false)
    for (const name of ['FLOW_API_KEY', 'FLOW_API_SECRET', 'RESEND_API_KEY']) expect(validateEnvironment({ ...fixture(), [name]: 'accidental-secret' }).ok).toBe(false)
  })
  it('requires rebuild before phase or project changes', () => {
    expect(validateEnvironment(fixture(), { builtPublic: { stagingPhase: 'financial' } }).ok).toBe(false)
    expect(validateEnvironment(fixture(), { builtPublic: { vercelProjectId: 'prj_prod' } }).ok).toBe(false)
  })
  it.each(['preflight', 'configuration'])('blocks every outbound provider entry point in %s before any transport, even with credentials', async phase => {
    vi.stubEnv('STAGING_PHASE', phase)
    vi.stubEnv('FLOW_API_KEY', 'accidental-secret'); vi.stubEnv('FLOW_API_SECRET', 'accidental-secret'); vi.stubEnv('RESEND_API_KEY', 're_accidental-secret')
    const transport = vi.fn(); vi.stubGlobal('fetch', transport)
    const attempts = [() => flowGet('/payment/getStatus', {}), () => flowPost('/payment/create', {}), () => sendEmail({ to: 'test@example.org', subject: 'test', html: '' }), () => sendTemplateEmail({ to: 'test@example.org', templateId: 'test', data: {} }), () => sendOperationalEmail({ id: 'test', recipient: 'test@example.org', subject: 'test', text_body: '' })]
    for (const attempt of attempts) await expect(attempt()).rejects.toThrow('bloqueado')
    expect(transport).not.toHaveBeenCalled()
  })
  it('loads production provider credentials on isolated configuration without alert recipients', () => {
    const env = { ...fixture(), STAGING_PHASE: 'configuration', FLOW_API_KEY: 'actual-source-key', FLOW_API_SECRET: 'actual-source-secret', COMPANY_LEGAL_NAME: 'Empresa de prueba', COMPANY_RUT: '12.345.678-5' }
    expect(validateEnvironment(env).ok).toBe(true)
    expect(validateEnvironment({ ...env, STAGING_PHASE: 'financial' }).ok).toBe(false)
    expect(validateEnvironment({ ...env, TORNEOS_ENVIRONMENT: 'production', VERCEL_PROJECT_ID: 'prj_prod' }).ok).toBe(false)
    expect(validateEnvironment({ ...env, PRODUCTION_SUPABASE_PROJECT_REF: env.STAGING_SUPABASE_PROJECT_REF }).ok).toBe(false)
    expect(validateEnvironment(env, { builtPublic: { stagingPhase: 'preflight' } }).ok).toBe(false)
  })
  it('rejects malformed optional email configuration and missing Flow credentials', () => {
    const env = { ...fixture(), STAGING_PHASE: 'configuration', FLOW_API_KEY: 'actual-source-key', FLOW_API_SECRET: 'actual-source-secret', COMPANY_LEGAL_NAME: 'Empresa de prueba', COMPANY_RUT: '12.345.678-5' }
    for (const change of [{ RESEND_API_KEY: 'invalid' }, { RESEND_FROM_EMAIL: 'invalid' }, { ALERT_EMAIL: 'ops@example.org' }, { FLOW_API_SECRET: '' }]) expect(validateEnvironment({ ...env, ...change }).ok).toBe(false)
    expect(validateEnvironment({ ...env, RESEND_API_KEY: `re_${'d'.repeat(32)}`, RESEND_FROM_EMAIL: 'Torneos <ops@example.org>' }).ok).toBe(true)
  })
})
