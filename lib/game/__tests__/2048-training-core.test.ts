import { describe, expect, it, vi } from 'vitest'
import { applyLocalPracticeMove, createLocalPracticeGame, type LocalPracticeState } from '../local-practice'
import type { Direction } from '../engine'
import { copyLocal2048Practice, usefulTraining2048Directions } from '../2048-training'
import { Unity2048Session, type Practice2048Event } from '../unity-2048-session'

const cycle = ['left', 'up', 'right', 'down'] as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** A real, deterministic game: no board injection or private session access. */
function referenceGame(seed: string) {
  let state = createLocalPracticeGame(seed)
  let beforeLast: LocalPracticeState | undefined
  let lastDirection: Direction | undefined
  const inputs: Direction[] = []
  let noOps = 0
  for (let input = 0; input < 4000; input++) {
    const direction = cycle[input % cycle.length]
    const before = copyLocal2048Practice(state)
    const next = applyLocalPracticeMove(state, direction)
    inputs.push(direction)
    if (next.moved) { beforeLast = before; lastDirection = direction }
    else noOps++
    state = { ...state, ...next }
    if (next.gameOver) {
      if (!beforeLast || !lastDirection) throw new Error('Fixture has no valid terminal move')
      return { final: state, beforeLast, lastDirection, inputs, noOps }
    }
  }
  throw new Error('Fixture did not end')
}

async function offeredGame() {
  const events: Practice2048Event[] = []
  const request = vi.fn()
  const publish = vi.fn()
  const session = new Unity2048Session(publish, request, undefined, undefined, event => events.push(event))
  const reference = referenceGame('training-demo-0')
  await session.start('training-demo-0')
  for (const direction of reference.inputs) await session.move(direction)
  const training = session.snapshot().training!
  expect(training?.phase).toBe('offered')
  return { session, events, request, publish, reference, sourceId: training.sourceId }
}

describe('one local 2048 training demonstration', () => {
  it('offers once after a real end and restores the exact prior valid move including deterministic RNG', async () => {
    const { session, events, request, reference, sourceId } = await offeredGame()
    expect(reference.noOps).toBeGreaterThan(0)
    expect(reference.inputs).toHaveLength(184)
    expect(reference.final.score).toBe(1756)
    expect(sourceId).toMatch(uuid)
    expect(events.filter(event => event.type === 'end')).toHaveLength(1)
    expect(events.filter(event => event.training?.stage === 'offered')).toHaveLength(1)
    expect(events.slice(-2).map(event => event.type === 'training' ? event.training?.stage : event.type)).toEqual(['end', 'offered'])
    expect(events.every(event => event.practiceId === sourceId)).toBe(true)
    const original = session.snapshot()
    expect(original.training).toEqual({ phase: 'offered', sourceId, continuationId: null,
      originalScore: reference.final.score, originalHighestTile: Math.max(...reference.final.board.flat()),
      originalMoves: reference.final.moveNumber - 2, originalDirection: reference.lastDirection,
      alternativeDirections: ['left'], awaitingAlternative: false, demonstration: true })
    expect(session.beginTrainingDemo('stale-source')).toBe(false)
    expect(session.snapshot()).toEqual(original)
    expect(session.beginTrainingDemo(sourceId)).toBe(true)
    const restored = session.snapshot()
    expect(restored).toMatchObject({ cells: reference.beforeLast.board.flat(), score: reference.beforeLast.score,
      move_number: reference.beforeLast.moveNumber, game_over: false, locked: false, mode: 'practice' })
    expect(restored.training).toMatchObject({ phase: 'active', awaitingAlternative: true, originalScore: original.score,
      originalMoves: original.move_number - 2 })
    expect(restored.training?.continuationId).toMatch(uuid)
    expect(restored.training?.continuationId).not.toBe(sourceId)
    expect(events.at(-1)).toMatchObject({ type: 'training', assisted: true, training: {
      stage: 'started', sourceId, continuationId: restored.training?.continuationId, validMoves: 0 } })
    expect(session.beginTrainingDemo(sourceId)).toBe(false)

    const count = events.length
    await session.move('down'); await session.move('up'); await session.move('right')
    expect(session.snapshot()).toEqual(restored)
    expect(events).toHaveLength(count)
    const alternate = applyLocalPracticeMove(reference.beforeLast, 'left')
    expect(alternate.moved).toBe(true); expect(alternate.gameOver).toBe(false)
    await session.move('left')
    expect(session.snapshot()).toMatchObject({ cells: alternate.board.flat(), score: alternate.score, move_number: alternate.moveNumber,
      training: { awaitingAlternative: false, originalScore: original.score, originalHighestTile: original.training?.originalHighestTile } })
    expect(events.at(-1)).toMatchObject({ type: 'training', assisted: true,
      training: { stage: 'move', sourceId, validMoves: 1 } })
    expect(request).not.toHaveBeenCalled()
  })

  it('deep copies published/snapshot cells and alternatives so callers cannot alter the saved opportunity', async () => {
    const { session, publish, reference, sourceId } = await offeredGame()
    const exposed = session.snapshot()
    exposed.cells.fill(8192); exposed.training!.alternativeDirections.splice(0, 1, 'down')
    const published = publish.mock.calls.at(-1)![0]
    published.cells.fill(16384); published.training.alternativeDirections.length = 0
    expect(session.snapshot().cells).toEqual(reference.final.board.flat())
    expect(session.snapshot().training?.alternativeDirections).toEqual(['left'])
    expect(session.beginTrainingDemo(sourceId)).toBe(true)
    const restored = session.snapshot()
    restored.cells.fill(32768); restored.training!.alternativeDirections.push('down')
    await session.move('down')
    expect(session.snapshot().cells).toEqual(reference.beforeLast.board.flat())
    expect(session.snapshot().training?.awaitingAlternative).toBe(true)
    await session.move('left')
    expect(session.snapshot().training?.awaitingAlternative).toBe(false)
  })

  it('keeps the original result immutable throughout assisted play and never offers a second continuation', async () => {
    const { session, events, sourceId } = await offeredGame()
    const original = session.snapshot().training!
    expect(session.beginTrainingDemo(sourceId)).toBe(true)
    const startIndex = events.length - 1
    await session.move('left')
    for (let input = 0; input < 4000 && !session.snapshot().game_over; input++) await session.move(cycle[input % 4])
    expect(session.snapshot().game_over).toBe(true)
    expect(session.snapshot().training).toMatchObject({ phase: 'ended', originalScore: original.originalScore,
      originalHighestTile: original.originalHighestTile, originalMoves: original.originalMoves,
      originalDirection: original.originalDirection, sourceId })
    const assisted = events.slice(startIndex)
    expect(assisted.every(event => event.type === 'training' && event.assisted === true)).toBe(true)
    expect(assisted.filter(event => event.training?.stage === 'ended')).toHaveLength(1)
    const moves = assisted.filter(event => event.training?.stage === 'move')
    expect(moves.map(event => event.training?.validMoves)).toEqual(moves.map((_, index) => index + 1))
    expect(assisted.at(-1)?.training?.validMoves).toBe(moves.length)
    expect(events.filter(event => event.training?.stage === 'offered')).toHaveLength(1)
    expect(events.filter(event => event.type === 'end')).toHaveLength(1)
    expect(session.beginTrainingDemo(sourceId)).toBe(false)
    const count = events.length
    await session.move('left'); session.destroy()
    expect(events).toHaveLength(count)
    await session.start('new-original')
    expect(events).toHaveLength(count) // Destroyed hosts cannot revive either branch.
  })

  it('interrupts an active demonstration once when restarting and discards stale offers', async () => {
    const { session, events, sourceId } = await offeredGame()
    expect(session.beginTrainingDemo(sourceId)).toBe(true)
    await session.start('fresh-original')
    expect(events.slice(-2).map(event => event.type === 'training' ? event.training?.stage : event.type)).toEqual(['interrupted', 'start'])
    expect(events.at(-2)).toMatchObject({ assisted: true, training: { sourceId, validMoves: 0 } })
    expect(events.at(-1)?.practiceId).not.toBe(sourceId)
    expect(session.snapshot().training).toBeUndefined()
    expect(session.beginTrainingDemo(sourceId)).toBe(false)
    await session.move('left')
    expect(events.at(-1)?.type).toBe('move')
    expect(events.at(-1)?.assisted).toBeUndefined()

    const offered = await offeredGame()
    await offered.session.start('replacement')
    expect(offered.session.snapshot().training).toBeUndefined()
    expect(offered.session.beginTrainingDemo(offered.sourceId)).toBe(false)
    expect(offered.events.filter(event => event.training?.stage === 'interrupted')).toHaveLength(0)
  })

  it('marks active cleanup as interrupted, never as another normal end, and rejects stopped offers', async () => {
    const { session, events, sourceId, publish } = await offeredGame()
    expect(session.beginTrainingDemo(sourceId)).toBe(true)
    await session.move('left')
    const publishes = publish.mock.calls.length
    session.destroy(); session.destroy()
    expect(events.filter(event => event.training?.stage === 'interrupted')).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'training', assisted: true, training: { stage: 'interrupted', validMoves: 1 } })
    expect(events.filter(event => event.type === 'end')).toHaveLength(1)
    expect(publish).toHaveBeenCalledTimes(publishes)
    expect(session.beginTrainingDemo(sourceId)).toBe(false)

    const offered = await offeredGame()
    offered.session.destroy()
    expect(offered.session.beginTrainingDemo(offered.sourceId)).toBe(false)
    expect(offered.session.snapshot().training).toBeUndefined()
  })

  it('offers nothing if every alternative is a no-op or still terminal, and daily never receives training', async () => {
    const reference = referenceGame('training-demo-4')
    expect(usefulTraining2048Directions(reference.beforeLast, reference.lastDirection)).toEqual([])
    const events: Practice2048Event[] = []
    const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, event => events.push(event))
    await session.start('training-demo-4')
    for (const direction of reference.inputs) await session.move(direction)
    expect(session.snapshot().game_over).toBe(true)
    expect(session.snapshot().training).toBeUndefined()
    expect(events.some(event => event.type === 'training')).toBe(false)
    expect(session.beginTrainingDemo(events[0].practiceId!)).toBe(false)

    events.length = 0
    await session.start('training-demo-0', { freeMode: 'daily' })
    for (const direction of referenceGame('training-demo-0').inputs) await session.move(direction)
    expect(session.snapshot().game_over).toBe(true)
    expect(session.snapshot().training).toBeUndefined()
    expect(events.filter(event => event.type === 'end')).toHaveLength(1)
    expect(events.some(event => event.type === 'training')).toBe(false)
    expect(session.beginTrainingDemo(events[0].practiceId!)).toBe(false)
  })

  it('never trains competitive games and preserves their direction-only request', async () => {
    const observe = vi.fn()
    const request = vi.fn().mockResolvedValue({ gameId: 'server-game', board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
      score: 0, moveNumber: 2, deadlineAt: new Date(Date.now() + 300000).toISOString(), serverNow: new Date().toISOString() })
    const session = new Unity2048Session(vi.fn(), request, { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }, undefined, observe)
    expect(session.beginTrainingDemo('anything')).toBe(false)
    await session.start('ignored', { freeMode: 'practice' })
    expect(session.beginTrainingDemo('anything')).toBe(false)
    await session.move('left')
    expect(request.mock.calls[1][1]).toMatchObject({ gameId: 'server-game', direction: 'left', moveNumber: 2 })
    expect(request.mock.calls[1][1]).not.toHaveProperty('score')
    expect(observe).not.toHaveBeenCalled()
    expect(session.snapshot().training).toBeUndefined()
  })

  it('simulates alternatives without mutating checkpoint state or retaining auxiliary engine fields', () => {
    const reference = referenceGame('training-demo-0')
    const before = structuredClone(reference.beforeLast)
    expect(usefulTraining2048Directions(reference.beforeLast, reference.lastDirection)).toEqual(['left'])
    expect(reference.beforeLast).toEqual(before)
    const auxiliary = { ...reference.beforeLast, spawnedTile: { row: 0, col: 0, value: 2 } }
    const copy = copyLocal2048Practice(auxiliary)
    expect(Object.keys(copy).sort()).toEqual(['board', 'moveNumber', 'score', 'seed'])
    copy.board[0][0] = 65536
    expect(auxiliary.board).toEqual(before.board)
  })

  it('keeps training optional observation failures from blocking restoration and play', async () => {
    const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, () => { throw new Error('Storage denied') })
    await session.start('training-demo-0')
    for (const direction of referenceGame('training-demo-0').inputs) await session.move(direction)
    const sourceId = session.snapshot().training!.sourceId
    expect(session.beginTrainingDemo(sourceId)).toBe(true)
    await session.move('left')
    expect(session.snapshot().training).toMatchObject({ phase: 'active', awaitingAlternative: false })
  })
})
