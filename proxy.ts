import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAllowedOrigins, getSupabaseBrowserKey, getSupabaseUrl } from '@/lib/env'

// ── CORS ────────────────────────────────────────────────────
const ALLOWED_ORIGINS = getAllowedOrigins()

// ── Content Security Policy (A6) ─────────────────────────────
// Estrategia nonce-based segun docs/01-app/02-guides/content-security-policy.md.
// Cada request obtiene un nonce nuevo; Next inyecta el nonce automaticamente
// en los <script> de framework y en el cliente RSC. En dev requerimos
// 'unsafe-eval' porque React usa eval para reconstruir stacks server-side.
//
// connect-src: incluye Supabase (HTTPS y WSS para Realtime). Flow se accede
// solo desde el server (lib/flow/payments.ts), no desde el browser, por eso
// no esta listado.
// img-src: Supabase Storage emite URLs en *.supabase.co. data:/blob: para
// avatars, screenshots locales, capturas KYC.
// frame-ancestors 'none': impide que la app sea embebida (clickjacking).
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  const supabase = getSupabaseUrl() ?? ''
  const supabaseHttps = supabase ? supabase.replace(/^http/, 'http').replace(/^http:/, 'https:') : ''
  const supabaseWss = supabase ? supabase.replace(/^http/, 'ws') : ''

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Tailwind/Geist generan algunos estilos inline en runtime; en dev usamos
    // 'unsafe-inline' para no romper HMR. En prod confiamos en el nonce.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}' 'unsafe-inline'`}`,
    `img-src 'self' blob: data: ${supabaseHttps}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseHttps} ${supabaseWss}`.trim(),
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ]

  return csp.join('; ')
}

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
  '/play',
  '/tournaments',
  '/legal',
  '/sign-in',
  '/sign-up',
  '/auth/callback', // OAuth callback de Supabase (Google, etc.)
  '/auth/confirm', // Confirmación por email / magic link
  '/api/wallet/deposit/flow/return', // Flow vuelve con POST del browser sin cookies SameSite=Lax
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

  // ── CSP nonce ────────────────────────────────────────────────
  // Generado por request. Next.js lo extrae del header Content-Security-Policy
  // y lo aplica a sus scripts/styles internos. Tambien lo exponemos via
  // x-nonce para que componentes server-side puedan leerlo si necesitan
  // adjuntarlo a un <Script> de terceros.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)
  req.headers.set('x-nonce', nonce)

  // ── Supabase session refresh ─────────────────────────────────
  // El cliente de Supabase en el middleware refresca la cookie de sesión
  // y propaga los headers correctamente a la respuesta.
  let res = NextResponse.next({ request: req })
  res.headers.set('Cache-Control', 'private, no-store')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  res.headers.set('Content-Security-Policy', csp)

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
          res.headers.set('Content-Security-Policy', csp)
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
