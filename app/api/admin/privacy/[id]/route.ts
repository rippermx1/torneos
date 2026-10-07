import { randomUUID } from 'node:crypto'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { sameOrigin, accountError } from '@/lib/account/requests'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOrigin(req); if (originError) return originError
  const auth = await requireAdminMfaForApi(); if (!auth.ok) return auth.response
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Solicitud inválida' }, { status: 400 })
  if (Number(req.headers.get('content-length')) > 4_400_000) return Response.json({ error: 'Archivo demasiado grande' }, { status: 413 })
  let form: FormData
  try { form = await req.formData() } catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  const status = form.get('status'), reason = form.get('reason'), file = form.get('response')
  if (typeof status !== 'string' || !['reviewing','blocked','completed','rejected'].includes(status) || typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 2000) return Response.json({ error: 'Estado y respuesta requeridos' }, { status: 400 })
  const admin = createAdminClient()
  const current = await admin.rpc('data_request_for_review', { p_actor: auth.access.userId, p_id: id })
  if (current.error || !current.data) return accountError(current.error ?? {})
  if (current.data.user_id === auth.access.userId) return Response.json({ error: 'Revisor independiente requerido' }, { status: 403 })
  if (['completed','rejected'].includes(current.data.status)) return Response.json({ error: 'Solicitud cerrada' }, { status: 409 })
  if (status === 'completed' && current.data.kind === 'erasure') return Response.json({ error: 'Eliminación pendiente de política legal y evidencia de borrado de archivos y copias.' }, { status: 423 })
  let responsePath: string | null = null
  if (status === 'completed') {
    const extensions: Record<string,string> = { 'application/json':'json','application/pdf':'pdf','application/zip':'zip' }
    if (!(file instanceof File) || file.size === 0 || file.size > 4_194_304 || !extensions[file.type]) return Response.json({ error: 'Adjunta la respuesta revisada en JSON, PDF o ZIP (máx. 4 MB).' }, { status: 400 })
    responsePath = `${id}/${randomUUID()}.${extensions[file.type]}`
    const uploaded = await admin.storage.from('data-responses').upload(responsePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (uploaded.error) return Response.json({ error: 'No se pudo guardar la respuesta privada' }, { status: 503 })
  }
  const result = await admin.rpc('review_data_request', { p_actor: auth.access.userId, p_id: id, p_status: status, p_reason: reason.trim(), p_response_path: responsePath })
  // An uncertain commit may reference the uploaded object: never delete it blindly.
  if (result.error) return accountError(result.error)
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
