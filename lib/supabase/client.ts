'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseBrowserKey, getSupabaseUrl } from '@/lib/env'

// Tipo genérico omitido intencionalmente hasta generar tipos con `supabase gen types`.
// Usar los helpers de tipos de /types/database.ts para tipiear resultados.
export function createClient() {
  const supabaseUrl = getSupabaseUrl()
  const supabaseBrowserKey = getSupabaseBrowserKey()

  if (!supabaseUrl || !supabaseBrowserKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createBrowserClient<any>(
    supabaseUrl,
    supabaseBrowserKey
  )
}
