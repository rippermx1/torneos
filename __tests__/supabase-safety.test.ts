import { describe, expect, it } from 'vitest'
import {
  getSupabaseProjectRef,
  requireDestructiveReset,
  requireExplicitProjectTarget,
  requireNonProductionProject,
} from '../scripts/supabase-safety.mjs'

const productionUrl = 'https://baeylvoipmazcthnwxmz.supabase.co'
const stagingUrl = 'https://stagingproject123.supabase.co'

describe('Supabase script safety', () => {
  it('extracts hosted and local project references', () => {
    expect(getSupabaseProjectRef(stagingUrl)).toBe('stagingproject123')
    expect(getSupabaseProjectRef('http://127.0.0.1:54321')).toBe('local')
  })

  it('requires the exact destination project reference', () => {
    expect(() => requireExplicitProjectTarget(stagingUrl, 'Prueba', {})).toThrow(
      'CONFIRM_SUPABASE_PROJECT_REF=stagingproject123'
    )
    expect(
      requireExplicitProjectTarget(stagingUrl, 'Prueba', {
        CONFIRM_SUPABASE_PROJECT_REF: 'stagingproject123',
      })
    ).toBe('stagingproject123')
  })

  it('permits test data in an explicitly confirmed development project', () => {
    expect(
      requireNonProductionProject(productionUrl, 'Simulación', {
        CONFIRM_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz',
      })
    ).toBe('baeylvoipmazcthnwxmz')
  })

  it('never permits test data in a project marked as production', () => {
    expect(() =>
      requireNonProductionProject(productionUrl, 'Simulación', {
        CONFIRM_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz',
        PRODUCTION_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz',
      })
    ).toThrow('es un proyecto productivo')
  })

  it('supports protecting more than one project', () => {
    expect(() =>
      requireNonProductionProject(stagingUrl, 'Simulación', {
        CONFIRM_SUPABASE_PROJECT_REF: 'stagingproject123',
        PROTECTED_SUPABASE_PROJECT_REFS: 'anotherproject, stagingproject123',
      })
    ).toThrow('es un proyecto productivo')
  })

  it('requires a second exact confirmation for a destructive reset', () => {
    const target = { CONFIRM_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz' }
    expect(() => requireDestructiveReset(productionUrl, target)).toThrow(
      'CONFIRM_SUPABASE_RESET=DELETE_ALL_DATA_baeylvoipmazcthnwxmz'
    )
    expect(
      requireDestructiveReset(productionUrl, {
        ...target,
        CONFIRM_SUPABASE_RESET: 'DELETE_ALL_DATA_baeylvoipmazcthnwxmz',
      })
    ).toBe('baeylvoipmazcthnwxmz')
  })
})
