import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirect = vi.hoisted(() => vi.fn((destination: string) => { throw new Error(destination) }))
vi.mock('next/navigation', () => ({ redirect }))
import TournamentAlias from '@/app/(public)/tournaments/[id]/play/unity/page'
import WebAlias from '@/app/(public)/play/web/page'
import UnityAlias from '@/app/(public)/play/unity/page'

const tournament = '/tournaments/12345678-1234-1234-1234-123456789abc'
beforeEach(() => vi.clearAllMocks())

it('preserves the tournament ID at the canonical entry without mounting a client', async () => {
  await expect(TournamentAlias({ params: Promise.resolve({ id: '12345678-1234-1234-1234-123456789abc' }) }))
    .rejects.toThrow(`${tournament}/play`)
  expect(redirect).toHaveBeenCalledExactlyOnceWith(`${tournament}/play`)
})

describe.each([['retired web client', WebAlias], ['Unity bookmark', UnityAlias]] as const)('%s', (_label, page) => {
  it('preserves a valid tournament return destination', async () => {
    const target = '/play?' + new URLSearchParams({ next: tournament })
    await expect(page({ searchParams: Promise.resolve({ next: tournament }) })).rejects.toThrow(target)
    expect(redirect).toHaveBeenCalledExactlyOnceWith(target)
  })

  it.each([undefined, 'https://foreign.test', '//foreign.test', `${tournament}/play`, [tournament]])(
    'drops unsafe or non-detail return destinations: %s', async next => {
      await expect(page({ searchParams: Promise.resolve({ next }) })).rejects.toThrow('/play')
      expect(redirect).toHaveBeenCalledExactlyOnceWith('/play')
    }
  )
})
