'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/admin/tournaments', label: 'Torneos' },
  { href: '/admin/users', label: 'Usuarios / KYC' },
  { href: '/admin/payouts', label: 'Retiros' },
  { href: '/admin/payments', label: 'Pagos Flow' },
  { href: '/admin/refunds', label: 'Reembolsos' },
  { href: '/admin/disputes', label: 'Disputas' },
  { href: '/admin/reports', label: 'Reportes' },
  { href: '/admin/audit', label: 'Bitácora' },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-1">
      {NAV_ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className="block text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors"
        >
          {label}
        </Link>
      ))}
      <div className="pt-2 border-t mt-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="block text-sm px-3 py-2 text-muted-foreground hover:text-foreground"
        >
          ← Volver al sitio
        </Link>
      </div>
    </div>
  )
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile: barra superior con hamburguesa */}
      <div className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b bg-background">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-md hover:bg-muted"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">Admin</span>
      </div>

      {/* Mobile: backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile: drawer lateral */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-background border-r p-4 transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <NavLinks onNavigate={() => setOpen(false)} />
      </div>

      {/* Desktop: sidebar fijo */}
      <aside className="hidden md:flex md:flex-col w-48 border-r bg-muted/30 p-4 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Admin</p>
        <NavLinks />
      </aside>
    </>
  )
}
