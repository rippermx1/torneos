// Validate the wire format before passing any client value to privileged queries.
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isGameId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value
}

export function isMoveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 2 && value <= 2_147_483_647
}

export function isClientTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
