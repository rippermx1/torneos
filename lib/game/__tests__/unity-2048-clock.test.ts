import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerGameClock } from '../server-game-clock'
import { Unity2048Session } from '../unity-2048-session'

const config = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }
const serverNow = '2026-10-01T16:00:00.000Z'
const deadlineAt = '2026-10-01T16:01:00.000Z'
const initial = { gameId: 'g1', board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
  score: 0, moveNumber: 2, serverNow, deadlineAt }
const active = { timedOut: false, score: 0, serverNow: '2026-10-01T16:00:15.000Z', deadlineAt }
afterEach(() => vi.useRealTimers())

describe('server time and monotonic elapsed time', () => {
  it.each(['2026-10-01T17:00:00Z','2026-10-01T15:00:00Z'])('ignores a skewed browser clock %s', async wallTime => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(wallTime))
    let elapsed = 0
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ moved: false })
    const session = new Unity2048Session(vi.fn(), request, config, () => elapsed)
    await session.start(); expect(session.snapshot().time_left_seconds).toBe(60)
    elapsed = 15000; await session.tick(); expect(session.snapshot().time_left_seconds).toBe(45)
    await session.move('left'); expect(request.mock.calls.map(call => call[0])).toEqual(['/start','/move'])
    expect(session.snapshot().locked).toBe(false)
  })
  it('ignores wall-clock corrections in both directions during play', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(serverNow))
    let elapsed = 0
    const request = vi.fn().mockResolvedValue(initial)
    const session = new Unity2048Session(vi.fn(), request, config, () => elapsed)
    await session.start(); elapsed = 10000
    vi.setSystemTime(new Date('2026-10-02T16:00:00Z')); await session.tick()
    expect(session.snapshot().time_left_seconds).toBe(50)
    elapsed = 20000; vi.setSystemTime(new Date('2026-09-01T16:00:00Z')); await session.tick()
    expect(session.snapshot().time_left_seconds).toBe(40); expect(request).toHaveBeenCalledTimes(1)
  })
  it('anchors a recovered session to server time rather than creating a fresh duration', async () => {
    const request = vi.fn().mockResolvedValue({ ...initial, resuming: true, serverNow: active.serverNow })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); expect(session.snapshot().time_left_seconds).toBe(45)
    expect(session.snapshot().locked).toBe(false)
  })
  it('resynchronizes after suspension even if the monotonic clock did not advance', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(active)
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.resynchronizeTime()
    expect(session.snapshot().time_left_seconds).toBe(45); expect(session.snapshot().locked).toBe(false)
    expect(request.mock.calls[1]).toEqual(['/timeout', { gameId: 'g1' }])
  })
  it('confirms server expiration after suspension even when the local estimate is positive', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ timedOut: true, score: 128 })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.resynchronizeTime()
    expect(session.snapshot()).toMatchObject({ game_over: true, locked: true, score: 128, time_left_seconds: 0 })
    await session.move('left'); await session.resynchronizeTime(); expect(request).toHaveBeenCalledTimes(2)
  })
  it('refreshes the anchor from a confirmed move response', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ moved: false, ...active })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.move('left')
    expect(session.snapshot().time_left_seconds).toBe(45); expect(session.snapshot().locked).toBe(false)
  })
  it('supports an older host by sampling wall time once', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(serverNow))
    let elapsed = 0
    const clock = new ServerGameClock(() => elapsed); clock.synchronize({ deadlineAt })
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z')); elapsed = 15000
    expect(clock.remainingSeconds()).toBe(45)
  })
  it.each([null, 'invalid', 42])('rejects malformed server time %s instead of unlocking', async malformed => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ ...active, serverNow: malformed })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.resynchronizeTime(); await session.resynchronizeTime()
    expect(session.snapshot()).toMatchObject({ locked: true, game_over: false })
    expect(request).toHaveBeenCalledTimes(2)
  })
})

describe('separate move, closure and in-flight locks', () => {
  it('does not unlock or overwrite an unknown move when time is confirmed active', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce({ ...active, score: 256 })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.move('left'); await session.resynchronizeTime(); await session.move('right')
    expect(session.snapshot()).toMatchObject({ locked: true, game_over: false, score: 0, time_left_seconds: 45, move_number: 2 })
    expect(session.snapshot().message).toContain('No se confirmó el movimiento')
    expect(request.mock.calls.map(call => call[0])).toEqual(['/start','/move','/timeout'])
  })
  it('waits for an in-flight move and coalesces background returns without duplicate input', async () => {
    let elapsed = 0, resolve!: (data: Record<string, unknown>) => void
    const request = vi.fn().mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValueOnce(active)
    const session = new Unity2048Session(vi.fn(), request, config, () => elapsed)
    await session.start(); const moving = session.move('left'); elapsed = 61000
    await session.tick(); await session.resynchronizeTime(); await session.resynchronizeTime(); await session.move('right')
    expect(request).toHaveBeenCalledTimes(2)
    resolve({ board: [[4,2,0,0],...initial.board.slice(1)], score: 4, moveNumber: 3 }); await moving
    expect(request.mock.calls.map(call => call[0])).toEqual(['/start','/move','/timeout'])
    expect(session.snapshot()).toMatchObject({ score: 4, move_number: 3, locked: false, time_left_seconds: 45 })
  })
  it('does not duplicate an in-flight timeout query', async () => {
    let elapsed = 0, resolve!: (data: Record<string, unknown>) => void
    const request = vi.fn().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const session = new Unity2048Session(vi.fn(), request, config, () => elapsed)
    await session.start(); elapsed = 61000; const checking = session.tick()
    await session.tick(); await session.resynchronizeTime(); await session.move('left')
    expect(request).toHaveBeenCalledTimes(2); resolve(active); await checking
    expect(session.snapshot().locked).toBe(false); expect(request).toHaveBeenCalledTimes(2)
  })
  it('does not retry a query with unknown closure outcome after returning from background', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('network'))
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.resynchronizeTime(); await session.resynchronizeTime(); await session.tick()
    expect(session.snapshot()).toMatchObject({ locked: true, game_over: false }); expect(request).toHaveBeenCalledTimes(2)
  })
  it('does not poll zero remaining time faster when wall time jumps', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(serverNow))
    let elapsed = 0
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue({ ...active, serverNow: deadlineAt })
    const session = new Unity2048Session(vi.fn(), request, config, () => elapsed)
    await session.start(); elapsed = 60000; await session.tick()
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z')); elapsed = 64999; await session.tick()
    expect(request).toHaveBeenCalledTimes(2); expect(session.snapshot().locked).toBe(true)
    elapsed = 65000; await session.tick(); expect(request).toHaveBeenCalledTimes(3)
  })
  it('does not query time for practice or before explicit competitive start', async () => {
    const request = vi.fn(), practice = new Unity2048Session(vi.fn(), request), tournament = new Unity2048Session(vi.fn(), request, config)
    await practice.start('clock'); await practice.resynchronizeTime(); await tournament.resynchronizeTime()
    expect(request).not.toHaveBeenCalled()
  })
  it('discards a time response and queued recovery after unmount', async () => {
    let resolve!: (data: Record<string, unknown>) => void
    const publish = vi.fn(), request = vi.fn().mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const session = new Unity2048Session(publish, request, config, () => 0)
    await session.start(); const checking = session.resynchronizeTime(); session.destroy(); publish.mockClear()
    resolve(active); await checking; await session.resynchronizeTime()
    expect(publish).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(2)
  })
})
