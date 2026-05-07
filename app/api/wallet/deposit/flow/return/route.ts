// ───────────────────────────────────────────────────────────────
// LEGACY: Endpoint de retorno de Flow para depósitos wallet.
// Los depósitos fueron eliminados en Ruta 1. Si Flow rebota a esta
// URL por un attempt antiguo, redirigimos a /wallet con flag.
// ───────────────────────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  return redirectDeprecated(req)
}

export async function GET(req: Request): Promise<Response> {
  return redirectDeprecated(req)
}

function redirectDeprecated(req: Request): Response {
  const redirectUrl = new URL('/wallet', req.url)
  redirectUrl.searchParams.set('deposit', 'deprecated')
  return Response.redirect(redirectUrl, 303)
}
