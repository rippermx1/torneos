type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Returns a copy of `base` where only text leaves that exist in `base` are
 * replaced by `overrides`. Unknown keys and values of another type are ignored.
 */
export function mergeContent<T>(base: T, overrides: unknown): T {
  if (typeof base === 'string') return (typeof overrides === 'string' ? overrides : base) as T
  if (!isPlainObject(base)) return base
  const source = isPlainObject(overrides) ? overrides : {}
  const merged: PlainObject = {}
  for (const [key, value] of Object.entries(base)) {
    merged[key] = Object.hasOwn(source, key) ? mergeContent(value, source[key]) : value
  }
  return merged as T
}
