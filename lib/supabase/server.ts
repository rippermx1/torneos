import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// Tipo genérico omitido hasta generar tipos con `supabase gen types typescript`.
// Usar los helpers de tipos de /types/database.ts para tipiear resultados.

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'public' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookies de solo lectura, ignorar
          }
        },
      },
    }
  )
}

// Cliente con service role — bypasea RLS.
// NUNCA exponer este cliente al browser ni a inputs del usuario.
export function createAdminClient() {
  return createServerClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: 'public' },
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false },
    }
  )
}
