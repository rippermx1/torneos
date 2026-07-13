import { requireAdminMfa } from '@/lib/supabase/admin-mfa'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminMfa()

  return (
    <div className="min-h-screen bg-background md:flex">
      <AdminSidebar />
      <main className="min-w-0 flex-1 bg-muted/10 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  )
}
