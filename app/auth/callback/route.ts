import { createClient } from '@/lib/supabase/server'
import { ensureProfileExists } from '@/lib/supabase/profile'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirect'
import { getAppUrl } from '@/lib/env'

// Supabase OAuth callback — intercambia el `code` por una sesión.
// Google (y cualquier otro provider) redirige aquí tras autenticar.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const origin = getAppUrl(req.url)!
  const code = searchParams.get('code')
  const next = getSafeAuthRedirectPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await ensureProfileExists(user)
      }
      // Redirigir a la página destino (onboarding para nuevos usuarios)
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  // Si falla, mandar al sign-in con mensaje de error
  const signInUrl = new URL('/sign-in', origin)
  signInUrl.searchParams.set('error', 'oauth')
  signInUrl.searchParams.set('next', next)
  return NextResponse.redirect(signInUrl)
}
