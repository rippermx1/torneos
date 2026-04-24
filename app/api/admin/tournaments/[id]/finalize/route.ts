import { createClient, createAdminClient } from '@/lib/supabase/server'
import { forceFinalizeTournament } from '@/lib/tournament/lifecycle'
import type { Profile } from '@/types/database'

// Trigger manual de finalización para el admin.
// Útil para cerrar torneos antes de que el cron los procese,
// o para testing sin esperar el cron.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  // Verificar que el usuario es admin
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()

  const profile = data as Profile | null
  if (!profile?.is_admin) {
    return Response.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const { id: tournamentId } = await params

  try {
    const result = await forceFinalizeTournament(tournamentId)
    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 400 })
  }
}
