import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseBrowserKey, getSupabaseServerUrl } from '@/lib/env'

export const RESEND_PKCE_COOKIE = 'tp-confirm-resend-v1'
const FLOW_TTL_MS = 60 * 60_000
interface ResendPkceFlow { id: string; verifier: string; challenge: string; expiresAt: number }

export function createResendPkceFlow(now = Date.now()): ResendPkceFlow {
  const verifier = randomBytes(32).toString('base64url')
  return { id: randomBytes(16).toString('hex'), verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'), expiresAt: now + FLOW_TTL_MS }
}

export function encodeResendPkceCookie(flow: ResendPkceFlow): string {
  return Buffer.from(JSON.stringify({ id: flow.id, verifier: flow.verifier, expiresAt: flow.expiresAt })).toString('base64url')
}

export function readResendPkceCookie(value: string | undefined, id: string, now = Date.now()): string | null {
  if (!value || value.length > 512 || !/^[a-f0-9]{32}$/.test(id)) return null
  try {
    const flow = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    return flow && flow.id === id && typeof flow.verifier === 'string' && /^[A-Za-z0-9_-]{43}$/.test(flow.verifier)
      && Number.isSafeInteger(flow.expiresAt) && flow.expiresAt > now && flow.expiresAt <= now + FLOW_TTL_MS
      ? flow.verifier : null
  } catch { return null }
}

export function resendPkceCookieOptions(origin: string) {
  return { httpOnly: true, secure: new URL(origin).protocol === 'https:', sameSite: 'lax' as const,
    path: '/auth/confirm', maxAge: FLOW_TTL_MS / 1000 }
}

// The installed resend() omits PKCE. Keep this verifier separate from the
// browser SDK's signup/password-recovery storage; no internal SDK imports.
export async function exchangeResendConfirmationCode(code: string, verifier: string) {
  const url = getSupabaseServerUrl(), key = getSupabaseBrowserKey()
  if (!url || !key) throw new Error('Auth configuration unavailable')
  const storageKey = 'tp-confirm-resend'
  const values = new Map([[`${storageKey}-code-verifier`, JSON.stringify(verifier)]])
  const client = createClient(url, key, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey, storage: { getItem: name => values.get(name) ?? null,
        setItem: (name, value) => { values.set(name, value) }, removeItem: name => { values.delete(name) } } },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  })
  try { return await client.auth.exchangeCodeForSession(code) }
  finally { values.clear(); client.auth.stopAutoRefresh() }
}
