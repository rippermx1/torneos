'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { AppRole } from '@/types/database'

const navLinks = [
  { href: '/tournaments', label: 'Torneos' },
  { href: '/play', label: 'Practicar' },
]
const userLinks = [
  { href: '/wallet', label: 'Mi billetera' },
  { href: '/profile', label: 'Mi perfil' },
  { href: '/support/dispute', label: 'Soporte' },
]
const adminLinks = [
  { href: '/admin', label: 'Admin' },
]

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function loadRoles(currentUser: User | null) {
      if (!currentUser) {
        setRoles([])
        return
      }

      const { data, error } = await supabase
        .from('profile_roles')
        .select('role')
        .eq('profile_id', currentUser.id)

      if (!error) {
        setRoles(
          (data ?? [])
            .map((row) => row.role)
            .filter((role): role is AppRole =>
              role === 'user' || role === 'admin' || role === 'owner'
            )
        )
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUser.id)
        .single()

      setRoles(profile?.is_admin ? ['user', 'admin'] : ['user'])
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      void loadRoles(data.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      void loadRoles(nextUser)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setRoles([])
    router.push('/')
    router.refresh()
  }

  const isSignedIn = !!user
  const hasUserRole = roles.includes('user')
  const hasAdminRole = roles.includes('admin') || roles.includes('owner')
  const allMobileLinks = [
    ...navLinks,
    ...(isSignedIn && hasUserRole ? userLinks : []),
    ...(isSignedIn && hasAdminRole ? adminLinks : []),
  ]
  const closeMenu = () => setOpen(false)

  return (
    <>
      <header className="border-b bg-white sticky top-0 z-40">
        <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Skip to content */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-1 focus:rounded focus:text-sm focus:font-medium focus:ring-2 focus:ring-foreground"
          >
            Ir al contenido
          </a>

          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-lg tracking-tight">
              TorneosPlay
            </Link>
            <div className="hidden sm:flex items-center gap-4">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMenu}
                  className={cn(
                    'text-sm text-muted-foreground hover:text-foreground transition-colors',
                    pathname.startsWith(href) && 'text-foreground font-medium'
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Desktop */}
            {isSignedIn ? (
              <>
                <div className="hidden sm:flex items-center gap-4">
                  {hasUserRole && userLinks.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeMenu}
                      className={cn(
                        'text-sm text-muted-foreground hover:text-foreground transition-colors',
                        pathname.startsWith(href) && 'text-foreground font-medium'
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                  {hasAdminRole && adminLinks.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeMenu}
                      className={cn(
                        'text-sm text-muted-foreground hover:text-foreground transition-colors',
                        pathname.startsWith(href) && 'text-foreground font-medium'
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
                <button
                  onClick={handleSignOut}
                  className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Salir
                </button>
              </>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/sign-in"
                  onClick={closeMenu}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/sign-up"
                  onClick={closeMenu}
                  className="text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                >
                  Inscribirme
                </Link>
              </div>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="sm:hidden flex flex-col justify-center items-center w-9 h-9 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <span className={cn('block w-5 h-0.5 bg-foreground rounded transition-transform duration-200', open ? 'translate-y-1.5 rotate-45' : '')} />
              <span className={cn('block w-5 h-0.5 bg-foreground rounded my-1 transition-opacity duration-200', open ? 'opacity-0' : '')} />
              <span className={cn('block w-5 h-0.5 bg-foreground rounded transition-transform duration-200', open ? '-translate-y-1.5 -rotate-45' : '')} />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile overlay */}
      {open && (
        <div className="sm:hidden fixed inset-0 z-30 bg-black/40" aria-hidden="true" onClick={() => setOpen(false)} />
      )}

      <div
        id="mobile-menu"
        role="dialog"
        aria-label="Menú de navegación"
        className={cn(
          'sm:hidden fixed top-14 left-0 right-0 z-30 bg-white border-b shadow-lg transition-transform duration-200',
          open ? 'translate-y-0' : '-translate-y-full pointer-events-none'
        )}
      >
        <nav className="max-w-5xl mx-auto px-4 py-4 space-y-1">
          {allMobileLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={closeMenu}
              className={cn(
                'block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-muted',
                pathname.startsWith(href) ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
            >
              {label}
            </Link>
          ))}

          {isSignedIn ? (
            <button
              onClick={() => { closeMenu(); handleSignOut() }}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cerrar sesión
            </button>
          ) : (
            <div className="pt-3 border-t mt-3 flex flex-col gap-2">
              <Link
                href="/sign-in"
                onClick={closeMenu}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/sign-up"
                onClick={closeMenu}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity text-center"
              >
                Inscribirme
              </Link>
            </div>
          )}
        </nav>
      </div>
    </>
  )
}
