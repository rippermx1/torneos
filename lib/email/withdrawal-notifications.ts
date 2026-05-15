import { sendTemplateEmail, FROM_PAGOS } from './client'

function formatCLPPesos(pesos: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(pesos)
}

export async function sendWithdrawalApprovedEmail({
  to,
  username,
  amountCents,
  bankName,
  accountHolder,
}: {
  to: string
  username: string
  amountCents: number
  bankName: string
  accountHolder: string
}) {
  await sendTemplateEmail({
    to,
    templateId: '9ba1ceda-b0c8-46e7-8721-845d8b506b4a',
    from: FROM_PAGOS,
    data: {
      username,
      amount: formatCLPPesos(Math.ceil(amountCents / 100)),
      bankName,
      accountHolder,
    },
  })
}

export async function sendWithdrawalRejectedEmail({
  to,
  username,
  amountCents,
  reason,
}: {
  to: string
  username: string
  amountCents: number
  reason?: string | null
}) {
  await sendTemplateEmail({
    to,
    templateId: '26ee08d0-1ba8-440b-95e0-0b5798c8ccd2',
    from: FROM_PAGOS,
    data: {
      username,
      amount: formatCLPPesos(Math.ceil(amountCents / 100)),
      reason: reason ?? '',
    },
  })
}
