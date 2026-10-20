import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Game2048, type Direction } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'

interface RuleCase {
  id: string; direction: Direction; before: number[]; initialScore: number
  after: number[]; moved: boolean; scoreGained: number
  canMoveBefore: boolean; canMoveAfterSlide: boolean
}
const corpus: { schema: number; cases: RuleCase[] } = JSON.parse(readFileSync(
  'games/2048/UnityProject/Assets/Torneos/2048/Tests/EditMode/Fixtures/rule-cases.json', 'utf8'))
const rows = (cells: number[]) => Array.from({ length: 4 }, (_, row) => cells.slice(row * 4, row * 4 + 4))

describe('shared Unity/server 2048 rule corpus', () => {
  it('covers independently specified anchors, every direction and terminal boards', () => {
    expect(corpus.schema).toBe(1)
    expect(corpus.cases).toHaveLength(2936)
    expect(new Set(corpus.cases.map(c => c.id)).size).toBe(2936)
    expect(corpus.cases.filter(c => c.id.startsWith('anchor-'))).toHaveLength(40)
    expect(new Set(corpus.cases.map(c => c.direction))).toEqual(new Set(['left', 'right', 'up', 'down']))
  })
  it.each(corpus.cases)('$id: slide, score, terminal state and spawn contract', c => {
    const input = rows(c.before), original = structuredClone(input)
    const game = new Game2048(input, c.initialScore)
    expect(game.canMove()).toBe(c.canMoveBefore)
    let draws = 0
    const result = game.applyMove(c.direction, { next: () => { draws++; return 0 }, spawnValue: () => { draws++; return 2 } })
    const after = result.boardAfter.flat()
    if (result.spawnedTile) {
      const index = result.spawnedTile.row * 4 + result.spawnedTile.col
      expect(c.after[index]).toBe(0)
      expect(after[index]).toBe(2)
      after[index] = 0
    }
    expect(after).toEqual(c.after)
    expect(result.moved).toBe(c.moved)
    expect(result.scoreGained).toBe(c.scoreGained)
    expect(game.score).toBe(c.initialScore + c.scoreGained)
    expect(new Game2048(rows(after)).canMove()).toBe(c.canMoveAfterSlide)
    expect(draws).toBe(c.moved ? 2 : 0)
    expect(input).toEqual(original)
    expect(result.spawnedTile !== null).toBe(c.moved)
    if (c.id === 'horizontal-only-left' || c.id === 'vertical-only-up') {
      // The spawn fills the last empty cell and leaves no legal move.
      expect(game.emptyCells()).toHaveLength(0)
      expect(game.canMove()).toBe(false)
    }
    result.boardAfter[0]![0] = -1
    expect(game.board[0]![0]).not.toBe(-1)
  })
})

describe('competitive randomness remains server-owned', () => {
  it.each([0, 0.25, 0.999999999])('selects the expected empty cell at position draw %s', draw => {
    const game = new Game2048(rows([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 0, 0, 0, 0]))
    const result = game.spawnTile({ next: () => draw, spawnValue: () => 4 })
    expect(result).toEqual({ row: 3, col: Math.floor(draw * 4), value: 4 })
  })
  it('does not consume competitive RNG on a no-op', () => {
    const a = new DeterministicRNG('public-test-fixture-only', 10), b = new DeterministicRNG('public-test-fixture-only', 10)
    const game = new Game2048(rows([2, 0, 0, 0, ...Array(12).fill(0)]))
    expect(game.applyMove('left', a).moved).toBe(false)
    expect(a.next()).toBe(b.next())
  })
  it('does not draw randomness when the board has no empty cell', () => {
    const game = new Game2048(rows(Array(16).fill(2)))
    const fail = () => { throw new Error('Full board must not draw RNG') }
    expect(game.spawnTile({ next: fail, spawnValue: fail })).toBeNull()
  })
})
