import { afterEach, expect, it, vi } from 'vitest'
import { isolateUnity2048, moveUnity2048Focus } from '../unity-2048-navigation'

afterEach(() => vi.unstubAllGlobals())
function control(name: string, visible = true, inert = false) {
  return { name, tabIndex: 0, tagName: 'BUTTON', focus: vi.fn(), closest: () => inert ? {} : null,
    getClientRects: () => visible ? [{}] : [] } as unknown as HTMLElement & { name: string }
}
it('cycles within the expanded game, skips hidden controls and includes newly available recovery', () => {
  const start = control('start'), view = control('view'), hidden = control('hidden', false), covered = control('covered', true, true)
  const controls = [start, hidden, covered, view]
  const root = { querySelectorAll: () => controls } as unknown as HTMLElement
  moveUnity2048Focus(root, view, false, true); expect(start.focus).toHaveBeenCalledTimes(1)
  moveUnity2048Focus(root, start, true, true); expect(view.focus).toHaveBeenCalledTimes(1)
  const recovery = control('recovery'); controls.splice(1, 0, recovery)
  moveUnity2048Focus(root, start, false, true); expect(recovery.focus).toHaveBeenCalledTimes(1)
  expect(hidden.focus).not.toHaveBeenCalled(); expect(covered.focus).not.toHaveBeenCalled()
})
it('allows Tab to reach the surrounding page in normal view', () => {
  const previous = control('previous'), game = control('game'), next = control('next')
  const root = { ownerDocument: { querySelectorAll: () => [previous, game, next] } } as unknown as HTMLElement
  moveUnity2048Focus(root, game, false, false); expect(next.focus).toHaveBeenCalledTimes(1)
  moveUnity2048Focus(root, game, true, false); expect(previous.focus).toHaveBeenCalledTimes(1)
})
it('focuses the canvas through the bridge when the keyboard enters the iframe', () => {
  const start = control('start'), frame = Object.assign(control('frame'), { tagName: 'IFRAME', contentWindow: { postMessage: vi.fn() } })
  const root = { querySelectorAll: () => [start, frame] } as unknown as HTMLElement
  vi.stubGlobal('location', { origin: 'http://local.test' })
  moveUnity2048Focus(root, start, false, true)
  expect(frame.focus).toHaveBeenCalledTimes(1)
  expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'platform.focus' }), 'http://local.test')
})
it('isolates every outside branch and restores pre-existing inert values on exit', () => {
  class Branch {
    inert = false; children: Branch[] = []; parentElement: Branch | null = null
    ownerDocument!: { body: Branch }
    append(...children: Branch[]) { this.children.push(...children); children.forEach(child => { child.parentElement = this }) }
  }
  vi.stubGlobal('HTMLElement', Branch)
  const body = new Branch(), main = new Branch(), header = new Branch(), footer = new Branch()
  const game = new Branch(), otherGame = new Branch(), alreadyInert = new Branch()
  alreadyInert.inert = true; body.append(header, main, footer); main.append(game, otherGame, alreadyInert)
  game.ownerDocument = { body }
  const restore = isolateUnity2048(game as unknown as HTMLElement)
  expect([header.inert, footer.inert, otherGame.inert, alreadyInert.inert]).toEqual([true,true,true,true])
  expect(game.inert).toBe(false); expect(main.inert).toBe(false)
  restore()
  expect([header.inert, footer.inert, otherGame.inert, alreadyInert.inert]).toEqual([false,false,false,true])
})
