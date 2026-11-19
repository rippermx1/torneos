import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { recordAdminAction } from '@/lib/admin/audit'
import { sendWithdrawalApprovedEmail } from '@/lib/email/withdrawal-notifications'
import { storePayoutProof } from '@/lib/payouts/proof-storage'
import { financialError } from '@/lib/payouts/review'

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

  if (notes.length > 2000) return Response.json({ error: 'Notas demasiado extensas' }, { status: 400 })

  if (transferReference.length < 3 || transferReference.length > 120) {
    return Response.json({ error: 'Ingresa una referencia bancaria válida' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: payout } = await admin
    .from('withdrawal_requests')
    .select('user_id, amount_cents, bank_name, account_holder, account_rut, status, claimed_by')
    .eq('id', requestId)
    .single()

  if (!payout) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (!['transferring', 'paid'].includes(payout.status) || payout.claimed_by !== auth.access.userId) {
    return Response.json({ error: 'Transferencia no iniciada por este operador. Consulta o concilia el pago; no lo repitas' }, { status: 409 })
  }

  const proof = await storePayoutProof(admin, requestId, evidence)
  if (proof.response) return proof.response
  const storagePath = proof.path!

  const { data: receiptNumber, error: completeError } = await Promise.resolve(admin.rpc('complete_withdrawal', {
    p_request_id: requestId,
    p_admin_id: auth.access.userId,
    p_bank_transfer_reference: transferReference,
    p_proof_storage_path: storagePath,
    p_notes: notes || null,
  })).catch(() => ({ data: null, error: { message: 'Respuesta perdida' } }))

  if (completeError) {
    // A lost response may follow a committed payment; retain immutable proof.
    return financialError(completeError)
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

  if (payout.status !== 'paid') after(async () => {
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
