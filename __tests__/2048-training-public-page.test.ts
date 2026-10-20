import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => state.user }))
vi.mock('@/lib/tournament/public-catalog', () => ({ getPublicTournaments: async () => ({ tournaments: [], error: null, asOf: 0 }) }))
vi.mock('@/components/game/unity-2048', () => ({ Unity2048: () => null }))
import Page from '@/app/(public)/play/page'
import { Unity2048 } from '@/components/game/unity-2048'
const marker = { runId: '11111111-1111-4111-8111-111111111111' }
function unityProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null
  const element = node as ReactElement<{ children?: unknown }>
  if (element.type === Unity2048) return element.props
  for (const child of [element.props?.children].flat()) { const found = unityProps(child); if (found) return found }
  return null
}
const props = async () => unityProps(await Page({ searchParams: Promise.resolve({}) }))
beforeEach(() => { vi.stubEnv('TORNEOS_ENV', 'cloud-development'); state.user = null })
afterEach(() => vi.unstubAllEnvs())
describe('development training QA observations stay separate without changing gameplay', () => {
  it('uses synthetic measurements only for server-managed development fixtures', async () => {
    state.user = { is_anonymous: false, app_metadata: { qa_2048_training_development: marker } }
    expect(await props()).toMatchObject({ observationCategory: 'synthetic', measureAccountActivity: false })
  })
  it('does not accept editable user metadata as a QA marker', async () => {
    state.user = { is_anonymous: false, user_metadata: { qa_2048_training_development: marker } }
    expect(await props()).toMatchObject({ observationCategory: 'observed_browser', measureAccountActivity: true })
  })
  it('does not apply development behavior in production', async () => {
    vi.stubEnv('TORNEOS_ENV', 'production')
    state.user = { is_anonymous: false, app_metadata: { qa_2048_training_development: marker } }
    expect(await props()).toMatchObject({ observationCategory: 'observed_browser', measureAccountActivity: true })
  })
  it('keeps malformed or absent markers on the ordinary measurement path', async () => {
    for (const app_metadata of [{}, { qa_2048_training_development: { runId: 'invalid' } }]) {
      state.user = { is_anonymous: false, app_metadata }
      expect(await props()).toMatchObject({ observationCategory: 'observed_browser', measureAccountActivity: true })
    }
  })
  it('keeps guest and anonymous play available without account activity', async () => {
    for (const user of [null, { is_anonymous: true }]) { state.user = user
      expect(await props()).toMatchObject({ observationCategory: 'observed_browser', measureAccountActivity: false }) }
  })
})
