import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { ensureProfileExists } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirect'
import { getAppUrl } from '@/lib/env'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = getSafeAuthRedirectPath(searchParams.get('next'))

  const origin = getAppUrl(request.url)!
  const redirectTo = new URL(next, origin)

  if ((tokenHash && type) || code) {
    const supabase = await createClient()
    const { error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await ensureProfileExists(user)
      }
      return NextResponse.redirect(redirectTo)
    }
  }

  const signInUrl = new URL('/sign-in', origin)
  signInUrl.searchParams.set('error', 'auth_confirm')
  signInUrl.searchParams.set('next', next)
  return NextResponse.redirect(signInUrl)
}
