export function calculateGameDeadline(
  startedAt: string,
  playWindowEnd: string,
  maxGameDurationSeconds: number
) {
  const startedAtMs = Date.parse(startedAt)
  const playWindowEndMs = Date.parse(playWindowEnd)
  const durationEndMs = startedAtMs + maxGameDurationSeconds * 1000

  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(playWindowEndMs) ||
    !Number.isFinite(maxGameDurationSeconds) ||
    maxGameDurationSeconds <= 0
  ) {
    throw new Error('Fechas de partida invalidas')
  }

  return new Date(Math.min(durationEndMs, playWindowEndMs)).toISOString()
}

export function isPastGameDeadline(
  startedAt: string,
  playWindowEnd: string,
  maxGameDurationSeconds: number,
  nowMs = Date.now()
) {
  return nowMs >= Date.parse(calculateGameDeadline(startedAt, playWindowEnd, maxGameDurationSeconds))
}
