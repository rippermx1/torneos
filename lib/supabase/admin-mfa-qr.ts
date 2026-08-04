export function getAdminMfaQrSource(qrCode: string): string {
  const normalizedQrCode = qrCode.trim()

  if (normalizedQrCode.startsWith('data:')) {
    return normalizedQrCode
  }

  return `data:image/svg+xml;utf-8,${encodeURIComponent(normalizedQrCode)}`
}
