import { sendOpsAlertEmail } from '@/lib/email/ops-notifications'

// Invocado por los workflows de GitHub Actions cuando un job FALLA
// (step `if: failure()`): alerta inmediata, sin esperar al watchdog diario.

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const job = new URL(req.url).searchParams.get('job') ?? 'desconocido'

  await sendOpsAlertEmail({
    subject: `Workflow fallido: ${job}`,
    lines: [
      `El workflow de GitHub Actions "${job}" terminó en error.`,
      'El endpoint del cron respondió con fallo o no respondió.',
      'Revisar: GitHub → Actions → última corrida, y logs de Vercel.',
    ],
  })

  return Response.json({ ok: true })
}
