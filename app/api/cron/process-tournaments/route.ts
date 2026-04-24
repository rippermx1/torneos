import { processTournamentTransitions } from '@/lib/tournament/lifecycle'

// Endpoint llamado por un scheduler externo o por Vercel Cron.
// También puede invocarse manualmente con el header Authorization correcto.
//
// El scheduler debe enviar:
//   Authorization: Bearer {CRON_SECRET}

export const maxDuration = 60 // segundos — permite finalizar torneos grandes

export async function GET(req: Request): Promise<Response> {
  // Verificar que la llamada viene del cron de Vercel o de un admin autorizado
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron] CRON_SECRET no configurado')
    return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const results = await processTournamentTransitions()

    const acted = results.filter((r) => r.action !== 'skipped' && !r.error)
    const errors = results.filter((r) => r.error)

    if (errors.length > 0) {
      console.error('[cron] Errores en process-tournaments:', errors)
    }

    return Response.json({
      ok: true,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      total: results.length,
      acted: acted.length,
      errors: errors.length,
      results: results.map((r) => ({
        tournamentId: r.tournamentId,
        name: r.name,
        action: r.action,
        ...(r.detail ? { detail: r.detail } : {}),
        ...(r.error ? { error: r.error } : {}),
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron] Error fatal en process-tournaments:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
