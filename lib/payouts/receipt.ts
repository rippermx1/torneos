import { formatCLP, formatDateTimeCL } from '@/lib/utils'

export interface PayoutReceiptData {
  receiptNumber: string
  paidAt: string
  winnerName: string
  winnerRut: string
  amountCents: number
  bankName: string
  bankAccount: string
  transferReference: string
  companyName: string
  companyRut?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function maskBankAccount(account: string): string {
  const compact = account.replace(/\s+/g, '')
  if (compact.length <= 4) return compact
  return `•••• ${compact.slice(-4)}`
}

export function buildPayoutReceiptHtml(data: PayoutReceiptData): string {
  const companyRut = data.companyRut?.trim()
    ? `<div><span>RUT empresa</span><strong>${escapeHtml(data.companyRut.trim())}</strong></div>`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.receiptNumber)} · Pago de premio</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #171717; }
    body { margin: 0; background: #f5f5f5; }
    main { box-sizing: border-box; max-width: 760px; margin: 32px auto; padding: 40px; background: white; border: 1px solid #ddd; }
    h1 { margin: 0; font-size: 26px; }
    .subtitle { color: #666; margin: 6px 0 28px; }
    .amount { font-size: 34px; font-weight: 700; margin: 24px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
    .grid div { border-bottom: 1px solid #eee; padding-bottom: 10px; }
    span { display: block; color: #666; font-size: 12px; margin-bottom: 4px; }
    strong { font-size: 14px; overflow-wrap: anywhere; }
    .notice { margin-top: 30px; padding-top: 18px; border-top: 1px solid #ddd; color: #555; font-size: 12px; line-height: 1.5; }
    @media print { body { background: white; } main { margin: 0; max-width: none; border: 0; } }
    @media (max-width: 600px) { main { margin: 0; padding: 24px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>Comprobante de pago de premio</h1>
    <p class="subtitle">${escapeHtml(data.receiptNumber)}</p>
    <div class="amount">${escapeHtml(formatCLP(data.amountCents))}</div>
    <section class="grid">
      <div><span>Pagador</span><strong>${escapeHtml(data.companyName)}</strong></div>
      ${companyRut}
      <div><span>Ganador</span><strong>${escapeHtml(data.winnerName)}</strong></div>
      <div><span>RUT ganador</span><strong>${escapeHtml(data.winnerRut)}</strong></div>
      <div><span>Fecha de transferencia</span><strong>${escapeHtml(formatDateTimeCL(data.paidAt))}</strong></div>
      <div><span>Banco de destino</span><strong>${escapeHtml(data.bankName)}</strong></div>
      <div><span>Cuenta de destino</span><strong>${escapeHtml(maskBankAccount(data.bankAccount))}</strong></div>
      <div><span>Referencia bancaria</span><strong>${escapeHtml(data.transferReference)}</strong></div>
      <div><span>Premio bruto</span><strong>${escapeHtml(formatCLP(data.amountCents))}</strong></div>
      <div><span>Retención registrada</span><strong>${escapeHtml(formatCLP(0))}</strong></div>
      <div><span>Total transferido</span><strong>${escapeHtml(formatCLP(data.amountCents))}</strong></div>
    </section>
    <p class="notice">
      Comprobante interno emitido por la plataforma para acreditar el registro del pago del premio.
      No reemplaza el comprobante de la institución bancaria ni constituye un documento tributario electrónico.
    </p>
  </main>
</body>
</html>`
}
