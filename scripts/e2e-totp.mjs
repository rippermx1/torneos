import { createHmac } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(value) {
  let bits = ''

  for (const character of value.toUpperCase().replace(/=+$/, '')) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('El secreto TOTP no es Base32 válido.')
    bits += index.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }

  return Buffer.from(bytes)
}

export function generateTotpCode(secret, timestampMs = Date.now()) {
  const counter = Math.floor(timestampMs / 30_000)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const value = digest.readUInt32BE(offset) & 0x7fffffff

  return String(value % 1_000_000).padStart(6, '0')
}
