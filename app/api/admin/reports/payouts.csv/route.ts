import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import type { WithdrawalRequest } from '@/types/database'

const PAGE_SIZE = 1_000

function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value)
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export async function GET(): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const payouts: WithdrawalRequest[] = []

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await admin
      .from('withdrawal_requests')
      .select('*')
      .order('created_at', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    const page = (data ?? []) as WithdrawalRequest[]
    payouts.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  const userIds = [...new Set(payouts.map((payout) => payout.user_id))]
  const profileMap = new Map<string, { username: string; full_name: string | null; rut: string | null }>()

  for (let start = 0; start < userIds.length; start += PAGE_SIZE) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, username, full_name, rut')
      .in('id', userIds.slice(start, start + PAGE_SIZE))

    if (error) return Response.json({ error: error.message }, { status: 500 })
    for (const profile of data ?? []) profileMap.set(profile.id, profile)
  }

  const headers = [
    'folio_comprobante',
    'estado',
    'usuario_id',
    'usuario',
    'nombre_beneficiario',
    'rut_beneficiario',
    'monto_clp',
    'banco',
    'cuenta_bancaria',
    'solicitado_en',
    'autorizado_en',
    'pagado_en',
    'referencia_bancaria',
    'wallet_transaction_id',
    'revisado_por',
    'pagado_por',
    'evidencia_almacenada',
    'notas_revision',
    'notas_pago',
  ]

  const lines = [headers.join(',')]
  for (const payout of payouts) {
    const profile = profileMap.get(payout.user_id)
    lines.push([
      payout.receipt_number,
      payout.status,
      payout.user_id,
      profile?.username,
      payout.account_holder || profile?.full_name,
      payout.account_rut || profile?.rut,
      Math.round(payout.amount_cents / 100),
      payout.bank_name,
      payout.bank_account ? `'${payout.bank_account}` : '',
      payout.created_at,
      payout.reviewed_at,
      payout.paid_at,
      payout.bank_transfer_reference,
      payout.wallet_transaction_id,
      payout.reviewed_by,
      payout.paid_by,
      payout.proof_storage_path ? 'si' : 'no',
      payout.admin_notes,
      payout.payment_notes,
    ].map(csvCell).join(','))
  }

  const today = new Date().toISOString().slice(0, 10)
  return new Response(`\uFEFF${lines.join('\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payout-ledger-${today}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
