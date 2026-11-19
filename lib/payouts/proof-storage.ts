import { createHash } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/server'
import { getVerifiedPayoutEvidenceExtension, MAX_PAYOUT_PROOF_BYTES } from '@/lib/payouts/evidence'

export async function storePayoutProof(admin: ReturnType<typeof createAdminClient>, requestId: string, evidence: FormDataEntryValue | null) {
  if (!(evidence instanceof File) || evidence.size === 0 || evidence.size > MAX_PAYOUT_PROOF_BYTES) {
    return { response: Response.json({ error: 'Adjunta un comprobante válido de hasta 6 MB' }, { status: 400 }) }
  }
  const bytes = new Uint8Array(await evidence.arrayBuffer())
  const extension = getVerifiedPayoutEvidenceExtension(evidence.type, bytes)
  if (!extension) return { response: Response.json({ error: 'Comprobante inválido' }, { status: 400 }) }
  const path = `${requestId}/${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  try {
    const { error } = await admin.storage.from('payout-proofs').upload(path, bytes, { contentType: evidence.type, upsert: false })
    // Content-addressed immutable object: reusing identical proof is safe.
    if (error && String(error.statusCode) !== '409' && error.message !== 'The resource already exists') {
      return { response: Response.json({ error: 'No se pudo confirmar el comprobante. Conserva el archivo y consulta el pago; no transfieras nuevamente.' }, { status: 503 }) }
    }
    return { path }
  } catch { return { response: Response.json({ error: 'Comprobante con resultado incierto. Consulta el estado y conserva el archivo.' }, { status: 503 }) } }
}
