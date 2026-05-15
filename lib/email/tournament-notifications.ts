import { sendTemplateEmail } from './client'

function formatCLPPesos(pesos: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(pesos)
}

function formatChileDate(iso: string) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export async function sendTournamentRegistrationEmail({
  to,
  username,
  tournamentName,
  playWindowStart,
  playWindowEnd,
  entryFeeCents,
}: {
  to: string
  username: string
  tournamentName: string
  playWindowStart: string
  playWindowEnd: string
  entryFeeCents: number
}) {
  await sendTemplateEmail({
    to,
    templateId: 'ca527eb0-3c59-4e93-9c4f-3be00e7975d9',
    data: {
      username,
      tournamentName,
      startLabel: formatChileDate(playWindowStart),
      endLabel: formatChileDate(playWindowEnd),
      entryLabel: entryFeeCents === 0 ? 'Gratuito' : formatCLPPesos(Math.ceil(entryFeeCents / 100)),
    },
  })
}

export async function sendTournamentPrizeEmail({
  to,
  username,
  tournamentName,
  rank,
  prizeCents,
  finalScore,
}: {
  to: string
  username: string
  tournamentName: string
  rank: number
  prizeCents: number
  finalScore: number
}) {
  const rankLabel = rank === 1 ? '1.er lugar' : rank === 2 ? '2.º lugar' : `${rank}.º lugar`

  await sendTemplateEmail({
    to,
    templateId: 'b8ecd8b6-0a39-4b0d-8163-03dfe2a9a9e0',
    data: {
      username,
      tournamentName,
      rankLabel,
      prizeLabel: formatCLPPesos(Math.ceil(prizeCents / 100)),
      finalScore: finalScore.toLocaleString('es-CL'),
      isWinner: rank === 1,
    },
  })
}
