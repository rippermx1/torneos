import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { ensureProfileExists } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirect'
import { getAppUrl } from '@/lib/env'
import { cookies } from 'next/headers'
import { RESEND_PKCE_COOKIE, readResendPkceCookie, resendPkceCookieOptions, exchangeResendConfirmationCode } from '@/lib/auth/confirmation-resend'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const resendId = searchParams.get('resend_id')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = getSafeAuthRedirectPath(searchParams.get('next'))

  const origin = getAppUrl(request.url)!
  const redirectTo = new URL(next, origin)

  if (resendId !== null) {
    const store = await cookies()
    const verifier = readResendPkceCookie(store.get(RESEND_PKCE_COOKIE)?.value, resendId)
    if (verifier) {
      // A stale callback must not clear a newer flow's verifier.
      store.set(RESEND_PKCE_COOKIE, '', { ...resendPkceCookieOptions(origin), maxAge: 0 })
      try {
        if (code && !tokenHash) {
          const exchange = await exchangeResendConfirmationCode(code, verifier)
          if (!exchange.error && exchange.data.session) {
            const supabase = await createClient()
            const { error } = await supabase.auth.setSession({ access_token: exchange.data.session.access_token, refresh_token: exchange.data.session.refresh_token })
            if (!error) {
              const { data: { user }, error: userError } = await supabase.auth.getUser()
              if (!userError && user?.email_confirmed_at) {
                await ensureProfileExists(user)
                return NextResponse.redirect(redirectTo, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
              }
            }
          }
        }
      } catch { /* Expired, duplicate or unavailable confirmation stays retryable. */ }
    }
  } else if ((tokenHash && type) || code) {
    const supabase = await createClient()
    const { error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await ensureProfileExists(user)
      }
      return NextResponse.redirect(redirectTo, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
    }
  }

  const signInUrl = new URL('/sign-in', origin)
  signInUrl.searchParams.set('error', 'auth_confirm')
  signInUrl.searchParams.set('next', next)
  return NextResponse.redirect(signInUrl, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
