import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { ensureProfileExists } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirect'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = getSafeAuthRedirectPath(searchParams.get('next'))

  const redirectTo = new URL(next, request.url)

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await ensureProfileExists(user)
      }
      return NextResponse.redirect(redirectTo)
    }
  }

  redirectTo.pathname = '/sign-in'
  redirectTo.searchParams.set('error', 'auth_confirm')
  return NextResponse.redirect(redirectTo)
}
