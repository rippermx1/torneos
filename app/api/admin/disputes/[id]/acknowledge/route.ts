import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { sameOrigin, accountError } from '@/lib/account/requests'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOrigin(req); if (originError) return originError
  const auth = await requireAdminMfaForApi(); if (!auth.ok) return auth.response
  const result = await createAdminClient().rpc('acknowledge_support_case', { p_actor: auth.access.userId, p_id: (await params).id })
  return result.error ? accountError(result.error) : Response.json({ ok: true })
}
