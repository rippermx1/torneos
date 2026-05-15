import { sendTemplateEmail, FROM_PAGOS } from './client'

function formatCLPPesos(pesos: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(pesos)
}

export async function sendTournamentCancelledEmail({
  to,
  username,
  tournamentName,
  amountPesos,
}: {
  to: string
  username: string
  tournamentName: string
  amountPesos: number
}) {
  await sendTemplateEmail({
    to,
    templateId: '85efbb55-12ef-4956-bb83-0025da6adadf',
    from: FROM_PAGOS,
    data: {
      username,
      tournamentName,
      amount: formatCLPPesos(amountPesos),
    },
  })
}

export async function sendRefundCompletedEmail({
  to,
  username,
  tournamentName,
  amountPesos,
}: {
  to: string
  username: string
  tournamentName: string
  amountPesos: number
}) {
  await sendTemplateEmail({
    to,
    templateId: 'fdd57241-c20c-43fd-9276-fc543d4151e1',
    from: FROM_PAGOS,
    data: {
      username,
      tournamentName,
      amount: formatCLPPesos(amountPesos),
    },
  })
}
