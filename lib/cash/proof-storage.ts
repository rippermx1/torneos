import { CashInputError } from './model'
import { createHash } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/server'
import { getVerifiedPayoutEvidenceExtension, MAX_PAYOUT_PROOF_BYTES } from '@/lib/payouts/evidence'

export async function storeCashProof(admin: ReturnType<typeof createAdminClient>, id: string, file: FormDataEntryValue | null): Promise<string> {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PAYOUT_PROOF_BYTES) throw new CashInputError('Adjunta evidencia de hasta 6 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const extension = getVerifiedPayoutEvidenceExtension(file.type, bytes)
  if (!extension) throw new CashInputError('Evidencia inválida: PDF, PNG, JPEG o WebP requerido')
  const path = `${id}/${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  const { error } = await admin.storage.from('cash-proofs').upload(path, bytes, { contentType: file.type, upsert: false })
  if (error && String(error.statusCode) !== '409') throw new Error('Carga de evidencia sin confirmar; conserva el archivo y el identificador')
  // Immutable uploads survive response loss. Never delete proof when an RPC may have committed.
  return path
}
