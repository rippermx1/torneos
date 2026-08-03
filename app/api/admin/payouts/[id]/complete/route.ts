import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { recordAdminAction } from '@/lib/admin/audit'
import { sendWithdrawalApprovedEmail } from '@/lib/email/withdrawal-notifications'
import {
  getVerifiedPayoutEvidenceExtension,
  MAX_PAYOUT_PROOF_BYTES,
} from '@/lib/payouts/evidence'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const { id: requestId } = await params
  const formData = await req.formData().catch(() => null)
  if (!formData) return Response.json({ error: 'Formulario inválido' }, { status: 400 })

  const transferReference = String(formData.get('transferReference') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const evidence = formData.get('evidence')

  if (transferReference.length < 3 || transferReference.length > 120) {
    return Response.json({ error: 'Ingresa una referencia bancaria válida' }, { status: 400 })
  }

  if (!(evidence instanceof File) || evidence.size === 0) {
    return Response.json({ error: 'Adjunta el comprobante de la transferencia' }, { status: 400 })
  }

  if (evidence.size > MAX_PAYOUT_PROOF_BYTES) {
    return Response.json({ error: 'El comprobante no puede superar 6 MB' }, { status: 400 })
  }

  const bytes = new Uint8Array(await evidence.arrayBuffer())
  const extension = getVerifiedPayoutEvidenceExtension(evidence.type, bytes)
  if (!extension) {
    return Response.json({ error: 'El archivo no es un PDF, JPG, PNG o WebP válido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: payout } = await admin
    .from('withdrawal_requests')
    .select('user_id, amount_cents, bank_name, account_holder, account_rut, status')
    .eq('id', requestId)
    .single()

  if (!payout) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (payout.status !== 'approved') {
    return Response.json({ error: 'El pago debe estar autorizado antes de registrar la transferencia' }, { status: 409 })
  }

  const storagePath = `${requestId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await admin.storage
    .from('payout-proofs')
    .upload(storagePath, bytes, { contentType: evidence.type, upsert: false })

  if (uploadError) {
    return Response.json({ error: `No se pudo guardar el comprobante: ${uploadError.message}` }, { status: 500 })
  }

  const { data: receiptNumber, error: completeError } = await admin.rpc('complete_withdrawal', {
    p_request_id: requestId,
    p_admin_id: auth.access.userId,
    p_bank_transfer_reference: transferReference,
    p_proof_storage_path: storagePath,
    p_notes: notes || null,
  })

  if (completeError) {
    await admin.storage.from('payout-proofs').remove([storagePath]).catch(console.error)
    return Response.json({ error: completeError.message }, { status: 400 })
  }

  await recordAdminAction(admin, {
    adminId: auth.access.userId,
    action: 'payout.complete',
    targetType: 'withdrawal_request',
    targetId: requestId,
    summary: `Registró transferencia ${transferReference} por ${payout.amount_cents} centavos`,
    payload: {
      target_user_id: payout.user_id,
      amount_cents: payout.amount_cents,
      account_holder: payout.account_holder,
      account_rut: payout.account_rut,
      bank_name: payout.bank_name,
      transfer_reference: transferReference,
      receipt_number: receiptNumber,
      proof_storage_path: storagePath,
      notes: notes || null,
    },
  })

  after(async () => {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(payout.user_id)
      const email = authUser?.user?.email
      const username = authUser?.user?.user_metadata?.username ?? payout.account_holder ?? email
      if (email) {
        await sendWithdrawalApprovedEmail({
          to: email,
          username,
          amountCents: payout.amount_cents,
          bankName: payout.bank_name,
          accountHolder: payout.account_holder,
        })
      }
    } catch (error) {
      console.error('[payout.complete] Error enviando email:', error)
    }
  })

  return Response.json({ ok: true, receiptNumber })
}
