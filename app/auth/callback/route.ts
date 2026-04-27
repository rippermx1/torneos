import { createClient } from '@/lib/supabase/server'
import { ensureProfileExists } from '@/lib/supabase/profile'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Supabase OAuth callback — intercambia el `code` por una sesión.
// Google (y cualquier otro provider) redirige aquí tras autenticar.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await ensureProfileExists(user)
      }
      // Redirigir a la página destino (onboarding para nuevos usuarios)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Si falla, mandar al sign-in con mensaje de error
  return NextResponse.redirect(`${origin}/sign-in?error=oauth`)
}
