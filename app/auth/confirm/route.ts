import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { ensureProfileExists } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith('/')) {
    return '/onboarding'
  }

  return next
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = getSafeNext(searchParams.get('next'))

  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = next
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')
  redirectTo.searchParams.delete('next')

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
