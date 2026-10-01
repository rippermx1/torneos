import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { getPublicTournaments } from '@/lib/tournament/public-catalog'
import { TournamentCard } from '@/components/tournament/tournament-card'
import { CatalogFeedback } from '@/components/tournament/catalog-feedback'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSignedIn = !!user

  const catalog = await getPublicTournaments()
  const tournaments = catalog.tournaments.slice(0, 3)

  return (
    <>
      <Navbar initialIsSignedIn={isSignedIn} initialHasUserRole={isSignedIn} />
      <main id="main-content" className="flex-1">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="bg-foreground text-background py-20 px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <p className="text-sm font-medium tracking-widest uppercase opacity-60">
              Competencia de habilidad · Chile
            </p>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight">
              Demuestra tu habilidad.<br />Ve por el primer lugar.
            </h1>
            <p className="text-lg opacity-70 max-w-lg mx-auto">
              Cada movimiento cuenta. Premios fijos publicados antes de pagar,
              ranking auditado por servidor y práctica gratis sin cuenta.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                href="/tournaments"
                className="bg-background text-foreground px-7 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
              >
                Ver torneos
              </Link>
              <Link
                href="/play"
                className="border border-background/30 text-background px-7 py-3 rounded-xl font-semibold hover:bg-background/10 transition-colors"
              >
                Practicar gratis
              </Link>
            </div>
          </div>
        </section>

        {/* ── Cómo funciona ────────────────────────────────── */}
        <section className="py-16 px-4 bg-muted/40">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-10">¿Cómo funciona?</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { n: '1', title: 'Elige un torneo', desc: 'Revisa entrada, premios, cupos y ventana de juego antes de participar.' },
                { n: '2', title: 'Paga la inscripción', desc: 'Flow confirma el pago y tu inscripción queda registrada en el torneo.' },
                { n: '3', title: 'Juega y compite', desc: 'Tienes una sola partida. El puntaje más alto al cierre gana el premio publicado.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="bg-white rounded-2xl p-6 border space-y-3">
                  <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center font-bold text-sm">
                    {n}
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Torneos destacados ───────────────────────────── */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xl font-bold">Torneos disponibles</h2>
              <Link href="/tournaments" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Ver todos →
              </Link>
            </div>

            <p className="text-xs text-muted-foreground">Horarios de Chile (Santiago). Los cupos se confirman al inscribirte.</p>
            {catalog.error || tournaments.length === 0 ? (
              <CatalogFeedback error={catalog.error} retryHref="/" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {tournaments.map((t) => <TournamentCard key={t.id} tournament={t} now={catalog.asOf} />)}
              </div>
            )}
          </div>
        </section>

        {/* ── CTA final ────────────────────────────────────── */}
        {isSignedIn ? (
          <section className="py-16 px-4 bg-muted/40 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <p className="text-2xl font-bold">¿Listo para competir?</p>
              <p className="text-muted-foreground text-sm">
                Elige un torneo, paga la inscripción y demuestra tu habilidad.
              </p>
              <Link
                href="/tournaments"
                className="inline-block bg-foreground text-background px-7 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
              >
                Ver torneos
              </Link>
            </div>
          </section>
        ) : (
          <section className="py-16 px-4 bg-muted/40 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <p className="text-2xl font-bold">¿Listo para competir?</p>
              <p className="text-muted-foreground text-sm">
                Crea tu cuenta gratis, elige un torneo y paga la inscripción con Flow.
              </p>
              <Link
                href="/sign-up"
                className="inline-block bg-foreground text-background px-7 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
              >
                Crear cuenta
              </Link>
            </div>
          </section>
        )}
      </main>
      <Footer isSignedIn={isSignedIn} />
    </>
  )
}
