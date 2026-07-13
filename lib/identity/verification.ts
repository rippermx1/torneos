export type KycDocumentType = 'cedula_chilena' | 'passport' | 'other'

export const KYC_DOCUMENT_TYPES: KycDocumentType[] = ['cedula_chilena', 'passport', 'other']

export function isKycDocumentType(value: unknown): value is KycDocumentType {
  return typeof value === 'string' && KYC_DOCUMENT_TYPES.includes(value as KycDocumentType)
}

export function normalizeRut(value: string | null | undefined): string {
  return (value ?? '').replace(/[^0-9kK]/g, '').toUpperCase()
}

export function isValidRut(value: string | null | undefined): boolean {
  const rut = normalizeRut(value)
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false

  const body = rut.slice(0, -1)
  const expectedCheckDigit = rut.slice(-1)
  let factor = 2
  let sum = 0

  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }

  const remainder = 11 - (sum % 11)
  const actualCheckDigit =
    remainder === 11 ? '0' :
    remainder === 10 ? 'K' :
    String(remainder)

  return actualCheckDigit === expectedCheckDigit
}

export function sameRut(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const normalizedLeft = normalizeRut(left)
  const normalizedRight = normalizeRut(right)
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight
}

export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function samePersonName(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const tokensLeft = normalizePersonName(left).split(' ').filter(Boolean)
  const tokensRight = normalizePersonName(right).split(' ').filter(Boolean)
  if (tokensLeft.length === 0 || tokensRight.length === 0) return false
  // All tokens of the shorter name must appear in the longer name.
  // This handles common Chilean cases where banks store a subset of the full name
  // (e.g. dropping a second first name). RUT validation is the primary fraud control.
  const shorter = tokensLeft.length <= tokensRight.length ? tokensLeft : tokensRight
  const longer  = tokensLeft.length <= tokensRight.length ? tokensRight : tokensLeft
  return shorter.every(token => longer.includes(token))
}

// Edad cumplida a partir de una fecha de nacimiento. Acepta 'YYYY-MM-DD' (como
// viene la columna date de Supabase) o Date. Para el string parsea los
// componentes directamente, sin pasar por UTC, evitando el off-by-one de
// `new Date('YYYY-MM-DD')` en zonas horarias negativas (Chile es UTC-4/-3).
// Retorna null si la fecha es inválida o ausente.
export function getAgeFromBirthDate(
  birthDate: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  if (!birthDate) return null

  let by: number
  let bm: number
  let bd: number
  if (typeof birthDate === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate.trim())
    if (!match) return null
    by = Number(match[1])
    bm = Number(match[2])
    bd = Number(match[3])
  } else {
    if (Number.isNaN(birthDate.getTime())) return null
    by = birthDate.getFullYear()
    bm = birthDate.getMonth() + 1
    bd = birthDate.getDate()
  }
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null

  const calendarDate = new Date(Date.UTC(by, bm - 1, bd))
  if (
    calendarDate.getUTCFullYear() !== by ||
    calendarDate.getUTCMonth() + 1 !== bm ||
    calendarDate.getUTCDate() !== bd
  ) {
    return null
  }

  let age = now.getFullYear() - by
  const nowMonth = now.getMonth() + 1
  const nowDay = now.getDate()
  if (nowMonth < bm || (nowMonth === bm && nowDay < bd)) age -= 1
  return age
}

// true si la persona tiene 18 años cumplidos. Fecha ausente/ inválida ⇒ false.
export function isAdult(
  birthDate: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const age = getAgeFromBirthDate(birthDate, now)
  return age !== null && age >= 18
}

export function isOwnKycDocumentPath(
  path: string | null | undefined,
  userId: string
): path is string {
  if (!path) return false
  const normalizedPath = path.replace(/\\/g, '/').trim()
  return (
    normalizedPath.startsWith(`${userId}/`) &&
    !normalizedPath.includes('..') &&
    normalizedPath.length > userId.length + 1 &&
    normalizedPath.length <= 500
  )
}
