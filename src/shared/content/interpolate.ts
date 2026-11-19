const PLACEHOLDER = /\{(\w+)\}/g

export class MissingContentValueError extends Error {
  readonly key: string

  constructor(key: string) {
    super(`Missing value for content placeholder {${key}}`)
    this.name = 'MissingContentValueError'
    this.key = key
  }
}

/** Replaces `{key}` placeholders; a missing key throws instead of showing the raw marker. */
export function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new MissingContentValueError(key)
    return String(values[key])
  })
}
