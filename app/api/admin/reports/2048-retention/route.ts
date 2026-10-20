import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { PLAYER_2048_RETENTION_LIMITATIONS, player2048RetentionRange, readPlayer2048Retention, type Player2048RetentionRpcClient } from '@/lib/game/player-2048-retention'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const query = new URL(req.url).searchParams
  const range = player2048RetentionRange(query.get('from'), query.get('to'))
  if (!range || query.getAll('from').length !== 1 || query.getAll('to').length !== 1
    || [...query.keys()].some(key => key !== 'from' && key !== 'to')) {
    return Response.json({ error: 'Indica from y to como fechas ISO, en un rango inclusivo de hasta 90 días.' }, { status: 400, headers })
  }
  try {
    const report = await readPlayer2048Retention(createAdminClient() as unknown as Player2048RetentionRpcClient, range.from, range.to)
    return Response.json({ ...report, limitations: PLAYER_2048_RETENTION_LIMITATIONS }, { headers })
  } catch {
    return Response.json({ error: 'No se pudo confirmar el reporte de retorno de cuentas.' }, { status: 503, headers })
  }
}
