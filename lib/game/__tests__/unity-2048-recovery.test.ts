import { afterEach, describe, expect, it, vi } from 'vitest'
import { Unity2048Session } from '../unity-2048-session'
import { parseGameSnapshot } from '../game-snapshot'
import { requestGameJson } from '../game-json-request'

const config = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }
const initial = { stateConfirmed: true, gameId: 'g1', status: 'active',
  board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], score: 0, moveNumber: 2, moveCount: 0,
  gameOver: false, endReason: null, endedAt: null, deadlineAt: '2026-10-01T16:01:00Z', serverNow: '2026-10-01T16:00:00Z' }
const final = { ...initial, status: 'completed', gameOver: true, endReason: 'no_moves', score: 128,
  board: [[4,8,16,2],[8,16,32,64],[16,32,64,128],[32,64,128,256]], moveCount: 1, moveNumber: 3,
  endedAt: '2026-10-01T16:00:10Z', deadlineAt: null }
afterEach(() => vi.unstubAllGlobals())

describe('full Unity result recovery', () => {
  it.each([['completed','no_moves'],['completed','timeout'],['abandoned','self_ended']])('restores %s/%s at start without offering restart', async (status, endReason) => {
    const request = vi.fn().mockResolvedValue({ ...final, status, endReason })
    const session = new Unity2048Session(vi.fn(), request, { ...config, existingGameId: 'g1' }, () => 0)
    await session.recover()
    expect(session.snapshot()).toMatchObject({ started: true, locked: true, game_over: true,
      score: 128, cells: final.board.flat(), move_number: 3, can_restart: false, result_status: status, end_reason: endReason })
    await session.start(); await session.move('left'); await session.recover()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]).toEqual(['/start', { recoverOnly: true, gameId: 'g1' }])
  })
  it('interprets no_moves on timeout as a terminal result even with timedOut=false and no deadline', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ ...final, timedOut: false })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.resynchronizeTime()
    expect(session.snapshot()).toMatchObject({ game_over: true, score: 128, cells: final.board.flat() })
    expect(session.snapshot().message).toContain('Sin movimientos')
  })
  it('recovers a lost move and sends only the next direction with the recovered moveNumber', async () => {
    const recovered = { ...initial, board: [[4,2,0,0],...initial.board.slice(1)], score: 4, moveCount: 1, moveNumber: 3 }
    const request = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(recovered).mockResolvedValueOnce({ moved: false })
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.move('left'); await session.recover(); await session.move('right')
    expect(session.snapshot()).toMatchObject({ locked: false, score: 4, move_number: 3, cells: recovered.board.flat() })
    expect(request.mock.calls[2]).toEqual(['/start', { recoverOnly: true, gameId: 'g1' }])
    expect(request.mock.calls[3][1]).toMatchObject({ direction: 'right', moveNumber: 3 })
    expect(request.mock.calls.filter(call => call[0] === '/move')).toHaveLength(2)
  })
  it('recovers an unknown closure through an explicit read of the terminal state', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('lost closure')).mockResolvedValueOnce(final)
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.resynchronizeTime(); await session.recover()
    expect(session.snapshot()).toMatchObject({ game_over: true, locked: true, score: 128 })
    expect(request.mock.calls.map(call => call[0])).toEqual(['/start','/timeout','/start'])
  })
  it('keeps an unknown move locked on automatic background recovery until explicitly recovered', async () => {
    const request = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('lost move')).mockResolvedValueOnce(initial)
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.move('left'); await session.resynchronizeTime(); await session.move('right')
    expect(session.snapshot().locked).toBe(true); expect(request).toHaveBeenCalledTimes(3)
  })
  it.each([{ ...final, board: null }, { ...final, gameId: 'another-game' }, { ...final, moveNumber: 2, moveCount: 0 }])('rejects incomplete, foreign or regressing recovery', async invalid => {
    const request = vi.fn().mockResolvedValueOnce({ ...initial, score: 4, moveNumber: 3, moveCount: 1 }).mockResolvedValueOnce(invalid)
    const session = new Unity2048Session(vi.fn(), request, config, () => 0)
    await session.start(); await session.recover()
    expect(session.snapshot()).toMatchObject({ locked: true, game_over: false, score: 4, move_number: 3 })
  })
  it('serializes recovery behind in-flight requests and ignores late recovery after unmount', async () => {
    let resolve!: (data: Record<string, unknown>) => void
    const publish = vi.fn(), request = vi.fn().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const session = new Unity2048Session(publish, request, config, () => 0)
    await session.start(); const recovering = session.recover(); await session.recover(); await session.move('left')
    expect(request).toHaveBeenCalledTimes(2); session.destroy(); publish.mockClear(); resolve(final); await recovering
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('snapshot and HTTP contract', () => {
  it.each([{}, { timedOut: false, score: 128 }, { gameOver: true, score: 128 }])('does not treat partial legacy data as a complete recovery', data => {
    expect(parseGameSnapshot(data)).toBeNull()
  })
  it.each([{ ...final, status: 'invalid' }, { ...final, score: undefined }, { ...final, score: -1 },
    { ...final, moveCount: -1 }, { ...final, board: [[2]] }, { ...final, gameOver: false }, { ...initial, deadlineAt: null }])('rejects malformed confirmed state', data => {
    expect(() => parseGameSnapshot(data)).toThrow()
  })
  it('accepts a final score of zero only when the full result confirms it', () => {
    expect(parseGameSnapshot({ ...final, score: 0 })?.score).toBe(0)
  })
  it.each([400,409])('receives a confirmed terminal snapshot on rejected direction HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(final, { status })))
    expect(await requestGameJson('/move', { direction: 'left' })).toEqual(final)
  })
  it.each([401,403,503])('does not bypass HTTP %s with a terminal-shaped payload', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(final, { status })))
    await expect(requestGameJson('/move')).rejects.toThrow()
  })
  it('keeps a failed closure distinct from a confirmed final result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Cierre no confirmado', code: 'GAME_CLOSURE_UNCONFIRMED' }, { status: 503 })))
    await expect(requestGameJson('/timeout')).rejects.toThrow('Cierre no confirmado')
  })
})
