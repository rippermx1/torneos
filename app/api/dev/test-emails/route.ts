import { sendWelcomeEmail, sendAccountBannedEmail } from '@/lib/email/account-notifications'
import { sendKycReceivedEmail, sendKycApprovedEmail, sendKycRejectedEmail } from '@/lib/email/kyc-notifications'
import { sendTournamentRegistrationEmail, sendTournamentPrizeEmail } from '@/lib/email/tournament-notifications'
import { sendTournamentCancelledEmail, sendRefundCompletedEmail } from '@/lib/email/refund-notifications'
import { sendWithdrawalApprovedEmail, sendWithdrawalRejectedEmail } from '@/lib/email/withdrawal-notifications'

// Solo disponible en desarrollo
export const dynamic = 'force-dynamic'

const EMAILS: Record<string, (to: string) => Promise<void>> = {
  welcome: (to) =>
    sendWelcomeEmail({ to, username: 'TestUser' }),

  'kyc-received': (to) =>
    sendKycReceivedEmail({ to, username: 'TestUser' }),

  'kyc-approved': (to) =>
    sendKycApprovedEmail({ to, username: 'TestUser' }),

  'kyc-rejected': (to) =>
    sendKycRejectedEmail({ to, username: 'TestUser', reason: 'El documento presentado está borroso. Por favor reenvía una foto más clara.' }),

  'tournament-registration': (to) =>
    sendTournamentRegistrationEmail({
      to,
      username: 'TestUser',
      tournamentName: 'Torneo de Prueba #1',
      playWindowStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      playWindowEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      entryFeeCents: 500_00,
    }),

  'tournament-registration-free': (to) =>
    sendTournamentRegistrationEmail({
      to,
      username: 'TestUser',
      tournamentName: 'Torneo Gratuito de Prueba',
      playWindowStart: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      playWindowEnd: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
      entryFeeCents: 0,
    }),

  'tournament-prize-winner': (to) =>
    sendTournamentPrizeEmail({
      to,
      username: 'TestUser',
      tournamentName: 'Torneo de Prueba #1',
      rank: 1,
      prizeCents: 45_000_00,
      finalScore: 123456,
    }),

  'tournament-prize-second': (to) =>
    sendTournamentPrizeEmail({
      to,
      username: 'TestUser',
      tournamentName: 'Torneo de Prueba #1',
      rank: 2,
      prizeCents: 20_000_00,
      finalScore: 98765,
    }),

  'tournament-cancelled': (to) =>
    sendTournamentCancelledEmail({
      to,
      username: 'TestUser',
      tournamentName: 'Torneo de Prueba #1',
      amountPesos: 5000,
    }),

  'refund-completed': (to) =>
    sendRefundCompletedEmail({
      to,
      username: 'TestUser',
      tournamentName: 'Torneo de Prueba #1',
      amountPesos: 5000,
    }),

  'withdrawal-approved': (to) =>
    sendWithdrawalApprovedEmail({
      to,
      username: 'TestUser',
      amountCents: 50_000_00,
      bankName: 'Banco de Chile',
      accountHolder: 'Test User Apellido',
    }),

  'withdrawal-rejected': (to) =>
    sendWithdrawalRejectedEmail({
      to,
      username: 'TestUser',
      amountCents: 50_000_00,
      reason: 'Los datos bancarios no coinciden con tu KYC aprobado.',
    }),

  'account-banned': (to) =>
    sendAccountBannedEmail({
      to,
      username: 'TestUser',
      reason: 'Uso de herramientas automatizadas detectado durante el torneo.',
    }),
}

export async function GET(req: Request): Promise<Response> {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Solo disponible en desarrollo' }, { status: 403 })
  }

  const url = new URL(req.url)
  const to = url.searchParams.get('to')
  const type = url.searchParams.get('type')

  if (!to) {
    return Response.json({
      error: 'Falta el parámetro ?to=tu@email.com',
      tipos: Object.keys(EMAILS),
      ejemplos: [
        `/api/dev/test-emails?to=tu@email.com`,
        `/api/dev/test-emails?to=tu@email.com&type=welcome`,
        `/api/dev/test-emails?to=tu@email.com&type=kyc-approved`,
      ],
    }, { status: 400 })
  }

  const targets = type
    ? [type]
    : Object.keys(EMAILS)

  const unknown = targets.filter((t) => !EMAILS[t])
  if (unknown.length) {
    return Response.json({
      error: `Tipo desconocido: ${unknown.join(', ')}`,
      tipos: Object.keys(EMAILS),
    }, { status: 400 })
  }

  const results: Record<string, 'ok' | string> = {}

  for (const t of targets) {
    try {
      await EMAILS[t](to)
      results[t] = 'ok'
    } catch (err) {
      results[t] = err instanceof Error ? err.message : String(err)
    }
  }

  const failed = Object.entries(results).filter(([, v]) => v !== 'ok')

  return Response.json({
    to,
    sent: targets.length - failed.length,
    failed: failed.length,
    results,
  })
}
