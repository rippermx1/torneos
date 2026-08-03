import { describe, expect, it } from 'vitest'
import { buildPayoutReceiptHtml, maskBankAccount } from '@/lib/payouts/receipt'

describe('payout receipt', () => {
  it('enmascara la cuenta bancaria salvo sus últimos cuatro caracteres', () => {
    expect(maskBankAccount('00 1234 5678')).toBe('•••• 5678')
    expect(maskBankAccount('1234')).toBe('1234')
  })

  it('escapa datos externos y muestra el folio y monto', () => {
    const html = buildPayoutReceiptHtml({
      receiptNumber: 'TP-PREM-20260803-ABC12345DE67',
      paidAt: '2026-08-03T16:00:00.000Z',
      winnerName: '<script>alert(1)</script>',
      winnerRut: '12.345.678-5',
      amountCents: 50_000_00,
      bankName: 'Banco Estado',
      bankAccount: '1234567890',
      transferReference: 'TRX-123',
      companyName: 'TorneosPlay SpA',
      companyRut: '76.000.000-0',
    })

    expect(html).toContain('TP-PREM-20260803-ABC12345DE67')
    expect(html).toContain('$50.000')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('•••• 7890')
  })
})
