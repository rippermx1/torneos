import { expect, it, vi } from 'vitest'
import { Unity2048Session, type Practice2048Event } from '../unity-2048-session'

it('observes valid moves, an actual end and explicit restart without counting no-ops or clock refreshes', async () => {
  const events: Practice2048Event[] = []
  const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, event => events.push(event))
  await session.start('personal-progress-integration')
  expect(events[0]).toMatchObject({ type: 'start', score: 0, moves: 0 })
  let noOps = 0
  for (let i = 0; i < 4000 && !session.snapshot().game_over; i++) {
    const before = session.snapshot().move_number
    const count = events.filter(event => event.type === 'move').length
    await session.move((['left', 'up', 'right', 'down'] as const)[i % 4])
    const changed = session.snapshot().move_number > before
    if (!changed) noOps++
    expect(events.filter(event => event.type === 'move')).toHaveLength(count + Number(changed))
  }
  expect(noOps).toBeGreaterThan(0)
  expect(session.snapshot().game_over).toBe(true)
  expect(events.filter(event => event.type === 'end')).toHaveLength(1)
  const count = events.length
  await session.tick(); await session.resynchronizeTime(); await session.move('up')
  expect(events).toHaveLength(count)
  await session.start('second')
  expect(events.at(-1)?.type).toBe('start')
  expect(events.filter(event => event.type === 'interrupted')).toHaveLength(0)
  await session.start('third')
  expect(events.slice(-2).map(event => event.type)).toEqual(['interrupted', 'start'])
  session.destroy()
  expect(events.at(-1)?.type).toBe('start')
  for (const event of events) {
    expect(Object.keys(event).sort()).toEqual(event.type === 'training'
      ? ['assisted', 'highestTile', 'moves', 'practiceId', 'score', 'training', 'type']
      : ['highestTile', 'moves', 'practiceId', 'score', 'type'])
    expect(event.practiceId).toEqual(expect.any(String))
    expect(event).not.toHaveProperty('board'); expect(event).not.toHaveProperty('seed')
    if (event.type === 'training') expect(event.assisted).toBe(true)
  }
})

it('keeps optional observation/storage failures from stopping gameplay', async () => {
  const observer = vi.fn(() => { throw new Error('Storage unavailable') })
  const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, observer)
  await session.start('storage-denied')
  await session.move('left'); await session.move('down')
  expect(session.snapshot().started).toBe(true)
  expect(session.snapshot().move_number).toBeGreaterThan(2)
  expect(observer).toHaveBeenCalled()
})

it('does not observe competitive scores in the practice channel', async () => {
  const observer = vi.fn()
  const request = vi.fn().mockResolvedValue({ gameId: 'server-game', board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
    score: 0, moveNumber: 2, deadlineAt: new Date(Date.now() + 300000).toISOString(), serverNow: new Date().toISOString() })
  const session = new Unity2048Session(vi.fn(), request, { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }, undefined, observer)
  await session.start(); await session.move('left')
  expect(observer).not.toHaveBeenCalled()
  expect(request.mock.calls[1][1]).toMatchObject({ gameId: 'server-game', direction: 'left', moveNumber: 2 })
  expect(request.mock.calls[1][1]).not.toHaveProperty('score')
})
