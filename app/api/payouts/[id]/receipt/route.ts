import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { buildPayoutReceiptHtml } from '@/lib/payouts/receipt'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user', 'admin', 'owner'])
  if (!auth.ok) return auth.response

  const { id: requestId } = await params
  const admin = createAdminClient()
  const { data: payout } = await admin
    .from('withdrawal_requests')
    .select('user_id, amount_cents, status, bank_name, bank_account, account_rut, account_holder, paid_at, bank_transfer_reference, receipt_number')
    .eq('id', requestId)
    .single()

  if (!payout) return Response.json({ error: 'Pago no encontrado' }, { status: 404 })

  if (payout.user_id !== auth.access.userId) {
    if (!auth.access.isAdmin) return Response.json({ error: 'Sin permisos' }, { status: 403 })
    const adminMfa = await requireAdminMfaForApi()
    if (!adminMfa.ok) return adminMfa.response
  }

  if (
    payout.status !== 'paid' ||
    !payout.paid_at ||
    !payout.bank_transfer_reference ||
    !payout.receipt_number
  ) {
    return Response.json({ error: 'El comprobante estará disponible cuando se confirme la transferencia' }, { status: 409 })
  }

  const html = buildPayoutReceiptHtml({
    receiptNumber: payout.receipt_number,
    paidAt: payout.paid_at,
    winnerName: payout.account_holder,
    winnerRut: payout.account_rut,
    amountCents: payout.amount_cents,
    bankName: payout.bank_name,
    bankAccount: payout.bank_account,
    transferReference: payout.bank_transfer_reference,
    companyName: process.env.COMPANY_LEGAL_NAME?.trim() || 'TorneosPlay',
    companyRut: process.env.COMPANY_RUT,
  })

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${payout.receipt_number}.html"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
    },
  })
}
