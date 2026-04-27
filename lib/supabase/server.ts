import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseBrowserKey, getSupabaseServiceKey, getSupabaseUrl } from '@/lib/env'
import type { Database } from '@/types/database'

// Tipo genérico omitido hasta generar tipos con `supabase gen types typescript`.
// Usar los helpers de tipos de /types/database.ts para tipiear resultados.

export async function createClient() {
  const supabaseUrl = getSupabaseUrl()
  const supabaseBrowserKey = getSupabaseBrowserKey()

  if (!supabaseUrl || !supabaseBrowserKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient<Database, 'public'>(
    supabaseUrl,
    supabaseBrowserKey,
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
  const supabaseUrl = getSupabaseUrl()
  const supabaseServiceKey = getSupabaseServiceKey()

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createServerClient<Database, 'public'>(
    supabaseUrl,
    supabaseServiceKey,
    {
      db: { schema: 'public' },
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false },
    }
  )
}
