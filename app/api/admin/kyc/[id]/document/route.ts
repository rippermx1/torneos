import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { kycDocument } from '@/lib/account/documents'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi(); if (!auth.ok) return auth.response
  return kycDocument(auth.access.userId, (await params).id, new URL(req.url).searchParams.get('side'), false)
}
