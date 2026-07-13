'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChartNoAxesCombined,
  CircleHelp,
  CreditCard,
  ExternalLink,
  Landmark,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  ScrollText,
  Trophy,
  Undo2,
  UserRoundCheck,
  X,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Inicio',
    items: [
      {
        href: '/admin',
        label: 'Qué requiere atención',
        description: 'Prioridades y estado general',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Operación diaria',
    items: [
      {
        href: '/admin/tournaments',
        label: 'Torneos',
        description: 'Programa y supervisa competencias',
        icon: Trophy,
      },
      {
        href: '/admin/users',
        label: 'Jugadores e identidad',
        description: 'Cuentas, KYC y saldos',
        icon: UserRoundCheck,
      },
      {
        href: '/admin/payouts',
        label: 'Retiros de premios',
        description: 'Aprueba pagos a jugadores',
        icon: Landmark,
      },
      {
        href: '/admin/disputes',
        label: 'Casos de soporte',
        description: 'Resuelve reclamos y disputas',
        icon: MessagesSquare,
      },
    ],
  },
  {
    label: 'Dinero y control',
    items: [
      {
        href: '/admin/payments',
        label: 'Cobros',
        description: 'Pagos recibidos mediante Flow',
        icon: CreditCard,
      },
      {
        href: '/admin/refunds',
        label: 'Devoluciones',
        description: 'Reembolsos y reintentos',
        icon: Undo2,
      },
      {
        href: '/admin/reports',
        label: 'Finanzas y reportes',
        description: 'Conciliación y documentos tributarios',
        icon: ChartNoAxesCombined,
      },
    ],
  },
  {
    label: 'Trazabilidad',
    items: [
      {
        href: '/admin/audit',
        label: 'Historial de acciones',
        description: 'Quién hizo qué y cuándo',
        icon: ScrollText,
      },
    ],
  },
]

function isCurrentPath(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}

function AdminNavigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegación administrativa" className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map(({ href, label, description, icon: Icon }) => {
              const isActive = isCurrentPath(pathname, href)

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                    isActive
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">{label}</span>
                    <span className={`mt-0.5 block text-[11px] leading-snug ${
                      isActive ? 'text-background/70' : 'text-muted-foreground'
                    }`}>
                      {description}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-3 border-t pt-4">
      <Link
        href="/admin#guia-inicial"
        onClick={onNavigate}
        className="flex items-start gap-2 rounded-xl bg-muted px-3 py-3 text-xs transition-colors hover:bg-muted/80"
      >
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="block font-semibold">¿Nuevo en el producto?</span>
          <span className="mt-0.5 block text-muted-foreground">Abre la guía de tu rutina diaria.</span>
        </span>
      </Link>
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Ver el sitio como jugador
      </Link>
    </div>
  )
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border p-2 hover:bg-muted"
          aria-label="Abrir menú administrativo"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div>
          <p className="text-sm font-semibold leading-tight">Centro de operaciones</p>
          <p className="text-[11px] text-muted-foreground">TorneosPlay</p>
        </div>
      </header>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú administrativo"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú administrativo"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,19rem)] flex-col border-r bg-background p-4 shadow-xl md:hidden"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">Centro de operaciones</p>
                <p className="text-xs text-muted-foreground">TorneosPlay</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border p-2 hover:bg-muted"
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <AdminNavigation pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter onNavigate={() => setOpen(false)} />
          </aside>
        </>
      )}

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r bg-muted/20 p-5 md:flex">
        <div className="mb-6 px-2">
          <p className="font-semibold tracking-tight">Centro de operaciones</p>
          <p className="mt-0.5 text-xs text-muted-foreground">TorneosPlay · Administración</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AdminNavigation pathname={pathname} />
        </div>
        <SidebarFooter />
      </aside>
    </>
  )
}
