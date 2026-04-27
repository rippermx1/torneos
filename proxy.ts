import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAllowedOrigins, getSupabaseBrowserKey, getSupabaseUrl } from '@/lib/env'

// ── CORS ────────────────────────────────────────────────────
const ALLOWED_ORIGINS = getAllowedOrigins()

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-signature',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
}

function getCorsOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin')
  if (!origin) return null
  return ALLOWED_ORIGINS.includes(origin) ? origin : null
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const origin = getCorsOrigin(req)
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
  }
  return res
}

// ── Rutas públicas (no requieren sesión) ─────────────────────
const PUBLIC_PREFIXES = [
  '/',
  '/tournaments',
  '/legal',
  '/sign-in',
  '/sign-up',
  '/auth/callback', // OAuth callback de Supabase (Google, etc.)
  '/auth/confirm', // Confirmación por email / magic link
  '/api/webhooks',
  '/api/cron',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
  )
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

export async function proxy(req: NextRequest) {
  // ── Preflight OPTIONS ────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    const origin = getCorsOrigin(req)
    const res = new NextResponse(null, { status: 204 })
    if (origin) {
      res.headers.set('Access-Control-Allow-Origin', origin)
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    }
    return res
  }

  // ── Supabase session refresh ─────────────────────────────────
  // El cliente de Supabase en el middleware refresca la cookie de sesión
  // y propaga los headers correctamente a la respuesta.
  let res = NextResponse.next({ request: req })
  res.headers.set('Cache-Control', 'private, no-store')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')

  const supabaseUrl = getSupabaseUrl()
  const supabaseBrowserKey = getSupabaseBrowserKey()

  if (!supabaseUrl || !supabaseBrowserKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseBrowserKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          res.headers.set('Cache-Control', 'private, no-store')
          res.headers.set('Pragma', 'no-cache')
          res.headers.set('Expires', '0')
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() verifica el token con Supabase Auth (no decodifica localmente)
  const { data: { user } } = await supabase.auth.getUser()

  // ── Proteger rutas privadas ───────────────────────────────────
  if (!isPublicPath(req.nextUrl.pathname) && !user) {
    const url = req.nextUrl.clone()
    url.pathname = '/sign-in'
    return withCors(NextResponse.redirect(url), req)
  }

  // ── Proteger rutas de admin ───────────────────────────────────
  // is_admin se verifica en la capa de página/API con acceso a DB.
  // En el middleware solo bloqueamos si no hay sesión en absoluto;
  // el check de is_admin ocurre en admin/layout.tsx.
  if (isAdminPath(req.nextUrl.pathname) && !user) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return withCors(NextResponse.redirect(url), req)
  }

  return withCors(res, req)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
