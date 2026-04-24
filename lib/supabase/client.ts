'use client'

import { createBrowserClient } from '@supabase/ssr'

// Tipo genérico omitido intencionalmente hasta generar tipos con `supabase gen types`.
// Usar los helpers de tipos de /types/database.ts para tipiear resultados.
export function createClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
