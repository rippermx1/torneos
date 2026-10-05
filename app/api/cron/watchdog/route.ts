import { recordHeartbeat } from '@/lib/ops/heartbeat'
import { runOperationalMonitor } from '@/lib/ops/monitor'

// Source configuration: every 5 min. Activation and independent monitoring require staging verification.
export const maxDuration = 60

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'No autorizado' }, { status: 401 })
  try {
    await recordHeartbeat('watchdog', 'started')
    const result = await runOperationalMonitor()
    await recordHeartbeat('watchdog', result.failed ? 'error' : 'ok', result.failed ? `${result.failed} avisos fallaron` : undefined)
    const ok = result.snapshot.active_incidents === 0 && result.unresolvedNotifications === 0
    return Response.json({ ok, checkedAt: result.snapshot.observed_at, activeIncidents: result.snapshot.active_incidents,
      notificationAcceptance: { acceptedThisRun: result.accepted, failedThisRun: result.failed, unresolved: result.unresolvedNotifications },
      bankCashVerified: false }, { status: ok ? 200 : 503 })
  } catch (error) {
    console.error('[watchdog] Comprobación incompleta', error)
    await recordHeartbeat('watchdog', 'error', 'Comprobación operativa incompleta').catch(error => console.error('[watchdog] No se pudo registrar el fallo', error))
    return Response.json({ ok: false, error: 'Comprobación operativa incompleta' }, { status: 503 })
  }
}
