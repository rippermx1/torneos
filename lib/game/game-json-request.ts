import { parseGameSnapshot } from './game-snapshot'

export async function requestGameJson(url: string, body?: unknown) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(12000) })
  const data = await response.json() as Record<string, unknown>
  if (!response.ok) {
    // A rejected direction can still carry the confirmed result of that same game.
    if ((response.status === 400 || response.status === 409) && parseGameSnapshot(data)?.gameOver) return data
    throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo completar la solicitud.')
  }
  return data
}
