// Shared golden cases for the real TypeScript engine and Unity's offline PracticeBoard.
// Node 24 runs the engine's TypeScript directly; no second engine implementation.
import { Game2048 } from '../lib/game/engine.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const target = new URL('../games/2048/UnityProject/Assets/Torneos/2048/Tests/EditMode/Fixtures/rule-cases.json', import.meta.url)
const directions = ['left', 'right', 'up', 'down']
const rows = cells => Array.from({ length: 4 }, (_, row) => cells.slice(row * 4, row * 4 + 4))
const lane = (values, direction, line = 0) => {
  const cells = Array(16).fill(0)
  values.forEach((value, offset) => { cells[direction === 'left' || direction === 'right' ? line * 4 + offset : offset * 4 + line] = value })
  return cells
}
function scenario(id, before, direction, initialScore = 256) {
  const game = new Game2048(rows(before), initialScore), canMoveBefore = game.canMove()
  const result = game.applyMove(direction, { next: () => 0, spawnValue: () => 2 })
  const after = result.boardAfter.flat()
  // Remove only the actual engine-reported spawn to compare the deterministic slide.
  if (result.spawnedTile) after[result.spawnedTile.row * 4 + result.spawnedTile.col] = 0
  assert.equal(after.reduce((a, b) => a + b, 0), before.reduce((a, b) => a + b, 0), id)
  return { id, direction, before, initialScore, after, moved: result.moved,
    scoreGained: result.scoreGained, canMoveBefore, canMoveAfterSlide: new Game2048(rows(after)).canMove() }
}
// Independently specified anchors prevent silently blessing an engine rule change.
const anchors = [
  ['empty', [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], 0],
  ['gap', [2, 0, 2, 4], [4, 4, 0, 0], [0, 0, 4, 4], 4],
  ['triple', [2, 2, 2, 0], [4, 2, 0, 0], [0, 0, 2, 4], 4],
  ['four', [2, 2, 2, 2], [4, 4, 0, 0], [0, 0, 4, 4], 8],
  ['no-chain', [2, 2, 4, 0], [4, 4, 0, 0], [0, 0, 4, 4], 4],
  ['distinct', [4, 2, 4, 2], [4, 2, 4, 2], [4, 2, 4, 2], 0],
  ['compress', [0, 2, 0, 4], [2, 4, 0, 0], [0, 0, 2, 4], 0],
  ['large', [1024, 1024, 2048, 2048], [2048, 4096, 0, 0], [0, 0, 2048, 4096], 6144],
  ['beyond-2048', [2048, 2048, 4096, 4096], [4096, 8192, 0, 0], [0, 0, 4096, 8192], 12288],
  ['high', [65536, 65536, 0, 0], [131072, 0, 0, 0], [0, 0, 0, 131072], 131072],
]
const cases = []
for (const [id, before, forward, backward, gain] of anchors) {
  for (const direction of directions) {
    const line = 2, entry = scenario(`anchor-${id}-${direction}`, lane(before, direction, line), direction)
    assert.deepEqual(entry.after, lane(direction === 'left' || direction === 'up' ? forward : backward, direction, line), entry.id)
    assert.equal(entry.scoreGained, gain, entry.id)
    cases.push(entry)
  }
}
const values = [0, 2, 4, 8, 16]
for (let code = 0; code < 625; code++) {
  let value = code
  const line = Array.from({ length: 4 }, () => { const tile = values[value % 5]; value = Math.floor(value / 5); return tile })
  for (const direction of directions) cases.push(scenario(`line-${code}-${direction}`, lane(line, direction, code % 4), direction))
}
// Reproducible whole-board coverage; this PRNG generates test inputs, never game spawns.
let seed = 0x204809
for (let sample = 0; sample < 96; sample++) {
  const before = Array.from({ length: 16 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return values[(seed >>> 16) % values.length] })
  for (const direction of directions) cases.push(scenario(`board-${sample}-${direction}`, before, direction, sample * 8))
}
const fullBoards = [
  ['terminal', [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2], false],
  ['horizontal-only', [2, 2, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536], true],
  ['vertical-only', [2, 8, 16, 32, 2, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536], true],
]
for (const [id, before, canMove] of fullBoards) {
  for (const direction of directions) {
    const entry = scenario(id + '-' + direction, before, direction)
    assert.equal(entry.canMoveBefore, canMove, id)
    cases.push(entry)
  }
}
const output = JSON.stringify({ schema: 1, source: 'Game2048.applyMove with controlled spawn removed; 40 independent anchors', cases }, null, 0) + '\n'
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Use no arguments to generate, or --check to verify without writing')
if (args[0] === '--check') assert.equal(await fs.readFile(target, 'utf8'), output, 'Shared rule corpus changed; review the engine diff before regeneration')
else { await fs.mkdir(new URL('.', target), { recursive: true }); await fs.writeFile(target, output) }
console.log(JSON.stringify({ cases: cases.length, anchors: anchors.length * 4, check: args[0] === '--check', path: target.pathname }))
