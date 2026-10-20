import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { readAccountingPackage, validAccountingPeriod } from '@/lib/accounting/operations'
import { getAppUrl } from '@/lib/env'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(req: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const query = new URL(req.url).searchParams
  const period = query.get('period')
  if (period && !validAccountingPeriod(period)) return Response.json({ error: 'Período inválido' }, { status: 400, headers })
  const admin = createAdminClient()
  const close = query.get('close')
  if (close && !/^[0-9a-f-]{36}$/i.test(close)) return Response.json({ error: 'Cierre inválido' }, { status: 400, headers })
  const result = close
    ? await admin.rpc('accounting_operate', { p_action: 'closed_package', p_payload: { id: close }, p_actor: auth.access.userId })
    : { data: await readAccountingPackage(admin, period ?? undefined), error: null }
  if (result.error) return Response.json({ error: result.error.message }, { status: 400, headers })
  return Response.json(result.data, { headers: { ...headers, 'Content-Disposition': `attachment; filename="contabilidad-${close ?? period ?? 'completa'}.json"` } })
}

export async function POST(req: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const origin = req.headers.get('origin')
  // A standalone/reverse-proxy request URL can use an internal hostname.
  // Trust the configured public origin, never an arbitrary forwarded Host.
  if (origin && origin !== new URL(getAppUrl(req.url)!).origin) return Response.json({ error: 'Origen inválido' }, { status: 403, headers })
  if (Number(req.headers.get('content-length') ?? 0) > 1_000_000) return Response.json({ error: 'Archivo demasiado grande' }, { status: 413, headers })
  const text = await req.text()
  if (text.length > 1_000_000) return Response.json({ error: 'Archivo demasiado grande' }, { status: 413, headers })
  let body: { action?: string; payload?: Record<string, unknown> }
  try { body = JSON.parse(text) } catch { return Response.json({ error: 'JSON inválido' }, { status: 400, headers }) }
  if (!body || !['document', 'bank_import', 'match', 'unmatch', 'reverse', 'close', 'reopen'].includes(body.action ?? '') || !body.payload || Array.isArray(body.payload) || typeof body.payload !== 'object') return Response.json({ error: 'Acción inválida' }, { status: 400, headers })
  const { data, error } = await createAdminClient().rpc('accounting_operate', { p_action: body.action!, p_payload: body.payload, p_actor: auth.access.userId })
  if (error) return Response.json({ error: error.message }, { status: 409, headers })
  return Response.json(data, { headers })
}
