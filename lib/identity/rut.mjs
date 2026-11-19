export function normalizeRut(value) {
  return (value ?? '').replace(/[^0-9kK]/g, '').toUpperCase()
}

export function isValidRut(value) {
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
