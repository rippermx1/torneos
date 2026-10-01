import { expect, it, vi } from 'vitest'
import { Unity2048Session } from '../unity-2048-session'

const config = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }
const initial = { stateConfirmed: true, gameId: 'g1', status: 'active',
  board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], score: 0, moveNumber: 2, moveCount: 0,
  gameOver: false, endReason: null, endedAt: null, deadlineAt: '2026-10-01T16:01:00Z', serverNow: '2026-10-01T16:00:00Z' }

it('offers recovery after an unknown move, hides it during requests, and removes it after confirmation', async () => {
  let reject!: (error: Error) => void, resolve!: (data: Record<string, unknown>) => void
  const request = vi.fn().mockResolvedValueOnce(initial)
    .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    .mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const session = new Unity2048Session(vi.fn(), request, config, () => 0)
  await session.start()
  const moving = session.move('left')
  expect(session.snapshot()).toMatchObject({ locked: true, can_recover: false })
  reject(new Error('lost response')); await moving
  expect(session.snapshot().can_recover).toBe(true)
  const recovering = session.recover()
  expect(session.snapshot().can_recover).toBe(false)
  resolve(initial); await recovering
  expect(session.snapshot()).toMatchObject({ locked: false, can_recover: false })
})

it('offers recovery when a server time check fails', async () => {
  const request = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('lost closure'))
  const session = new Unity2048Session(vi.fn(), request, config, () => 0)
  await session.start(); await session.resynchronizeTime()
  expect(session.snapshot()).toMatchObject({ locked: true, can_recover: true })
})

it('allows retry of an unread existing game after the automatic recovery fails', async () => {
  const session = new Unity2048Session(vi.fn(), vi.fn().mockRejectedValue(new Error('unavailable')), { ...config, existingGameId: 'g1' }, () => 0)
  await session.recover()
  expect(session.snapshot()).toMatchObject({ started: false, can_recover: true })
  session.destroy(); expect(session.snapshot().can_recover).toBe(false)
})

it('never offers recovery in practice or after a confirmed terminal result', async () => {
  const practice = new Unity2048Session(vi.fn(), vi.fn())
  await practice.start('gui-test'); expect(practice.snapshot().can_recover).toBe(false)
  const session = new Unity2048Session(vi.fn(), vi.fn().mockResolvedValue({ ...initial,
    status: 'completed', gameOver: true, endReason: 'timeout', endedAt: initial.deadlineAt }), config, () => 0)
  await session.start(); expect(session.snapshot().can_recover).toBe(false)
})
