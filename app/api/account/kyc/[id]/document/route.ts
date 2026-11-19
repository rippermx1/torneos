import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { kycDocument } from '@/lib/account/documents'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRoleForApi(['user'], { allowSuspended: true }); if (!auth.ok) return auth.response
  return kycDocument(auth.access.userId, (await params).id, new URL(req.url).searchParams.get('side'), true)
}
