export const MAX_PAYOUT_PROOF_BYTES = 6 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

export function getVerifiedPayoutEvidenceExtension(
  contentType: string,
  bytes: Uint8Array
): string | null {
  if (!EXTENSIONS[contentType]) return null

  const valid =
    (contentType === 'image/jpeg' && startsWith(bytes, [0xff, 0xd8, 0xff])) ||
    (contentType === 'image/png' && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (contentType === 'image/webp' &&
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) ||
    (contentType === 'application/pdf' && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))

  return valid ? EXTENSIONS[contentType] : null
}
