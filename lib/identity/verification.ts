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
  const normalizedLeft = normalizePersonName(left)
  const normalizedRight = normalizePersonName(right)
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight
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
