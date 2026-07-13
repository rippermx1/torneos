import { describe, expect, it } from 'vitest'
import {
  buildSchedulerSql,
  sqlLiteral,
  validateSchedulerConfig,
} from '../scripts/configure-scheduler.mjs'

const baseEnv = {
  APP_URL: 'https://www.torneosplay.cl',
  NEXT_PUBLIC_SUPABASE_URL: 'https://baeylvoipmazcthnwxmz.supabase.co',
  CRON_SECRET: 'a'.repeat(64),
  CONFIRM_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz',
}

describe('scheduler configuration', () => {
  it('requires an explicit project confirmation and HTTPS app URL', () => {
    expect(() => validateSchedulerConfig({ ...baseEnv, CONFIRM_SUPABASE_PROJECT_REF: '' }))
      .toThrow('CONFIRM_SUPABASE_PROJECT_REF=baeylvoipmazcthnwxmz')
    expect(() => validateSchedulerConfig({ ...baseEnv, APP_URL: 'http://localhost:3000' }))
      .toThrow('debe usar HTTPS')
  })

  it('normalizes the public origin and identifies the target project', () => {
    expect(validateSchedulerConfig({ ...baseEnv, APP_URL: 'https://www.torneosplay.cl/' }))
      .toEqual({
        appUrl: 'https://www.torneosplay.cl',
        cronSecret: baseEnv.CRON_SECRET,
        projectRef: 'baeylvoipmazcthnwxmz',
      })
  })

  it('escapes SQL literals and installs only the expected jobs', () => {
    expect(sqlLiteral("token'privado")).toBe("'token''privado'")

    const sql = buildSchedulerSql({
      appUrl: baseEnv.APP_URL,
      cronSecret: "x'.".repeat(20),
    })

    expect(sql).toContain("vault.create_secret('x''.")
    expect(sql).toContain('torneos-process-tournaments')
    expect(sql).toContain('torneos-flow-reconcile')
    expect(sql).toContain('torneos-reconcile-refunds')
    expect(sql).toContain('torneos-watchdog')
    expect(sql).toContain("private.invoke_app_cron(''/api/cron/process-tournaments'')")
  })
})
