import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const { id: requestId } = await params
  const admin = createAdminClient()
  const { data: payout } = await admin
    .from('withdrawal_requests')
    .select('proof_storage_path, receipt_number')
    .eq('id', requestId)
    .single()

  if (!payout?.proof_storage_path) {
    return Response.json({ error: 'Este pago no tiene comprobante almacenado' }, { status: 404 })
  }

  const { data, error } = await admin.storage
    .from('payout-proofs')
    .download(payout.proof_storage_path)

  if (error || !data) {
    return Response.json({ error: 'No se pudo recuperar el comprobante' }, { status: 404 })
  }

  const extension = payout.proof_storage_path.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin'
  const filename = `${payout.receipt_number ?? requestId}-evidencia.${extension}`

  return new Response(await data.arrayBuffer(), {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  })
}
