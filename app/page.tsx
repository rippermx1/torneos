import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCLP } from '@/lib/utils'
import type { Tournament } from '@/types/database'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSignedIn = !!user

  // Torneos destacados: próximos abiertos o programados
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .in('status', ['live', 'open', 'scheduled'])
    .eq('is_test', false)
    .order('play_window_start', { ascending: true })
    .limit(3)

  const tournaments = (data ?? []) as Pick<
    Tournament,
    'id' | 'name' | 'entry_fee_cents' | 'prize_1st_cents' | 'prize_2nd_cents' | 'prize_3rd_cents' | 'prize_model' | 'status' | 'play_window_start'
  >[]

  const STATUS_BADGE: Record<string, string> = {
    live:      'En curso',
    open:      'Inscripciones abiertas',
    scheduled: 'Próximamente',
  }
  const STATUS_COLOR: Record<string, string> = {
    live:      'bg-amber-100 text-amber-700',
    open:      'bg-green-100 text-green-700',
    scheduled: 'bg-yellow-100 text-yellow-700',
  }

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

            {tournaments.length === 0 ? (
              <div className="border rounded-2xl p-10 text-center text-muted-foreground">
                <p className="text-4xl mb-3">🏆</p>
                <p className="font-medium">No hay torneos activos por ahora.</p>
                <p className="text-sm mt-1">Vuelve pronto o practica mientras tanto.</p>
                <Link
                  href="/play"
                  className="mt-4 inline-block bg-foreground text-background px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Modo práctica
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {tournaments.map((t) => {
                  const totalPrize = t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
                  return (
                    <Link
                      key={t.id}
                      href={`/tournaments/${t.id}`}
                      className="flex items-center justify-between border rounded-2xl p-5 hover:bg-muted/50 transition-colors gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-semibold truncate">{t.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status]}`}>
                            {STATUS_BADGE[t.status]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Inscripción {formatCLP(t.entry_fee_cents)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-lg">{formatCLP(totalPrize)}</p>
                        <p className="text-xs text-muted-foreground">
                          premio fijo
                        </p>
                      </div>
                    </Link>
                  )
                })}
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
