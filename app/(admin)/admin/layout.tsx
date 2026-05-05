import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const adminSupabase = createAdminClient()
  const { data } = await adminSupabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!data?.is_admin) redirect('/')

  return (
    <div className="min-h-screen flex">
      {/* Sidebar admin */}
      <aside className="w-48 border-r bg-muted/30 p-4 space-y-1 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Admin
        </p>
        {[
          { href: '/admin/tournaments', label: 'Torneos' },
          { href: '/admin/users', label: 'Usuarios / KYC' },
          { href: '/admin/payouts', label: 'Retiros' },
          { href: '/admin/payments', label: 'Pagos Flow' },
          { href: '/admin/disputes', label: 'Disputas' },
          { href: '/admin/reports', label: 'Reportes' },
          { href: '/admin/audit', label: 'Bitácora' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="block text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            {label}
          </Link>
        ))}
        <div className="pt-2 border-t mt-2">
          <Link href="/" className="block text-sm px-3 py-2 text-muted-foreground hover:text-foreground">
            ← Volver al sitio
          </Link>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
