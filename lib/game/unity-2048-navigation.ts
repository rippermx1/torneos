import { UNITY_2048_BUILD, UNITY_2048_CHANNEL } from './unity-2048-session'

export function parseUnity2048Navigation(data: unknown): { key: 'Escape' | 'Tab'; shift: boolean } | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  if (value.channel !== UNITY_2048_CHANNEL || value.version !== 1 || value.build_id !== UNITY_2048_BUILD || value.type !== 'game.navigation') return null
  if (value.key !== 'Escape' && value.key !== 'Tab' || typeof value.shift !== 'boolean') return null
  return { key: value.key, shift: value.shift }
}

export function focusUnity2048(frame: HTMLIFrameElement | null) {
  frame?.focus()
  frame?.contentWindow?.postMessage({ channel: UNITY_2048_CHANNEL, version: 1, type: 'platform.focus' }, location.origin)
}

// Query again on every Tab: recovery, retry and ranking controls can change mid-session.
export function moveUnity2048Focus(root: HTMLElement, from: Element | null, backwards: boolean, cycle: boolean) {
  const scope = cycle ? root : root.ownerDocument
  const controls = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, iframe, [tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0)
  const index = controls.indexOf(from as HTMLElement)
  const next = index + (backwards ? -1 : 1)
  const target = controls[cycle ? (next + controls.length) % controls.length : next]
  if (target?.tagName === 'IFRAME') focusUnity2048(target as HTMLIFrameElement)
  else target?.focus()
}

// Keep the existing iframe mounted. Isolate sibling branches instead of moving the game into a portal.
export function isolateUnity2048(root: HTMLElement): () => void {
  const previous: [HTMLElement, boolean][] = []
  let branch: HTMLElement = root
  while (branch.parentElement && branch !== root.ownerDocument.body) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        previous.push([sibling, sibling.inert]); sibling.inert = true
      }
    }
    branch = branch.parentElement
  }
  return () => { for (const [element, inert] of previous) element.inert = inert }
}
