import Link from 'next/link'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          {/* Brand */}
          <div className="space-y-1.5">
            <p className="font-bold text-base">Torneos 2048</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              Plataforma de competencias de habilidad con premios reales en pesos chilenos.
              No es un juego de azar.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
            <FooterCol title="Plataforma">
              <FooterLink href="/tournaments">Torneos</FooterLink>
              <FooterLink href="/sign-up">Crear cuenta</FooterLink>
              <FooterLink href="/sign-in">Iniciar sesión</FooterLink>
            </FooterCol>
            <FooterCol title="Legal">
              <FooterLink href="/legal/terminos">Términos y Condiciones</FooterLink>
              <FooterLink href="/legal/privacidad">Política de Privacidad</FooterLink>
              <FooterLink href="/legal/reembolso">Política de Reembolso</FooterLink>
            </FooterCol>
            <FooterCol title="Ayuda">
              <FooterLink href="/support/dispute">Disputas</FooterLink>
              <FooterLink href="mailto:contacto@torneos2048.cl">Contacto</FooterLink>
            </FooterCol>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {year} Torneos 2048. Todos los derechos reservados.</p>
          <p className="italic">
            Competencia de habilidad — No constituye juego de azar según la Ley N.º 19.995.
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </Link>
  )
}
