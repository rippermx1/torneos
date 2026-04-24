// El webhook de Clerk fue eliminado al migrar a Supabase Auth.
// La creación de perfiles ahora ocurre mediante un trigger PostgreSQL
// en auth.users (ver supabase/migrations/007_supabase_auth.sql).
//
// Este archivo se mantiene como referencia temporal.
// Puede eliminarse una vez confirmada la migración.

export async function POST() {
  return new Response('Webhook de Clerk deprecado', { status: 410 })
}
