import { requireAnyRole } from '@/lib/supabase/auth'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(['admin', 'owner'])

  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar />
      <main className="flex-1 p-4 md:p-8 min-w-0">{children}</main>
    </div>
  )
}
