export type Factory3dEvent = {type: 'ready' | 'saved' | 'error' | 'intent' | 'prestige-preview' | 'prestige-complete' | 'visit-ready'; payload: string}
export function readFactory3dEvent(data: unknown, build: string): Factory3dEvent | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.channel !== 'torneos.factory-empire' || d.version !== 2 || d.build !== build || typeof d.payload !== 'string' || d.payload.length > 2048 || !['ready', 'saved', 'error', 'intent', 'prestige-preview', 'prestige-complete', 'visit-ready'].includes(String(d.type))) return null
  return {type: d.type as Factory3dEvent['type'], payload: d.payload}
}
