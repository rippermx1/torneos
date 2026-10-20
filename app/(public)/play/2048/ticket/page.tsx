import type { Metadata } from 'next'
import Link from 'next/link'
import { getUser } from '@/lib/supabase/auth'
import { get2048TicketOffer } from '@/lib/tournament/ticket-offer'
import { TicketOffer2048Observer } from '@/components/game/2048-ticket-offer-observer'

export const metadata: Metadata = {
  title: '2048 con ticket — condiciones propuestas',
  description: 'Consulta el precio y las condiciones propuestas de los torneos de 2048 con ticket. Todavía no disponibles; sin inscripciones ni cobros.',
}

export default async function Ticket2048OfferPage({ searchParams }: {
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const [params, user] = await Promise.all([searchParams, getUser()])
  const offer = get2048TicketOffer(params.from)
  const signedIn = !!user && !user.is_anonymous
  const qaRun = user?.app_metadata?.qa_2048_training_development?.runId
  const synthetic = process.env.TORNEOS_ENV === 'cloud-development' && typeof qaRun === 'string'
    && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(qaRun)
  return <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
    <header className="space-y-3">
      <p className="text-sm text-muted-foreground">2048 · condiciones propuestas</p>
      <h1 className="text-2xl font-bold">Torneos con ticket: todavía no disponibles</h1>
      <p>Esta ficha explica un formato propuesto. No corresponde a un torneo abierto: no hay fecha publicada, cupos ofrecidos ni inscripción o pago habilitados.</p>
      <p className="text-sm text-muted-foreground">Puedes consultarla sin cuenta. La práctica libre, el desafío diario y los retos comunitarios gratuitos conservan sus propias reglas.</p>
    </header>

    <section className="rounded-2xl border p-5 space-y-4" aria-labelledby="ticket-conditions-heading">
      <h2 id="ticket-conditions-heading" className="text-xl font-semibold">Formato propuesto</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Precio total por entrada</dt><dd className="font-semibold">{offer.entryFee.label} {offer.currency}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Duración de la partida</dt><dd className="font-semibold">{offer.durationMinutes} minutos</dd></div>
        <div><dt className="text-sm text-muted-foreground">Participantes del formato</dt><dd className="font-semibold">Mínimo {offer.minPlayers} · máximo {offer.maxPlayers}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Ventana de juego</dt><dd className="font-semibold">{offer.windowHours} horas desde el inicio que se publique</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Los mínimos y máximos describen el formato; no indican inscritos ni plazas disponibles. Cada participación tendría un intento, con resultado calculado por el servidor a partir de las jugadas.</p>
    </section>

    <section className="rounded-2xl border p-5 space-y-4" aria-labelledby="ticket-prizes-heading">
      <h2 id="ticket-prizes-heading" className="text-xl font-semibold">Premios fijos propuestos</h2>
      <p>Premio total del formato: <strong>{offer.prizes.total.label} {offer.currency}</strong>.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Primer puesto</dt><dd className="font-semibold">{offer.prizes.first.label} {offer.currency}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Segundo puesto</dt><dd className="font-semibold">{offer.prizes.second.label} {offer.currency}</dd></div>
        {offer.prizes.third.cents > 0 && <div><dt className="text-sm text-muted-foreground">Tercer puesto</dt><dd className="font-semibold">{offer.prizes.third.label} {offer.currency}</dd></div>}
      </dl>
      <p className="text-sm text-muted-foreground">Estos premios sólo serían pagaderos si un torneo futuro se habilita y celebra conforme a sus reglas. La ficha no adjudica un premio ni garantiza ingresos por participar.</p>
    </section>

    <section className="space-y-3" aria-labelledby="ticket-rules-heading">
      <h2 id="ticket-rules-heading" className="text-xl font-semibold">Antes de habilitar un torneo</h2>
      <p>Deberán publicarse sus fechas, plazo de inscripción, requisitos de participación y reglas de puntuación, desempate y revisión de resultados.</p>
      <p>También deberán quedar confirmadas las condiciones de cancelación y devolución, incluido qué ocurre si no se alcanza el mínimo, junto con el procedimiento y sus plazos. Esta propuesta todavía no permite cobrar una entrada.</p>
      <p>El puntaje de práctica y el entrenamiento asistido no son resultados competitivos. Un anuncio o su concesión no entregan entradas, saldo ni ventajas en un torneo.</p>
    </section>

    <section className="rounded-2xl border bg-muted/20 p-5 space-y-3" aria-labelledby="ticket-free-heading">
      <h2 id="ticket-free-heading" className="text-lg font-semibold">Puedes seguir jugando gratis</h2>
      <p>El desafío diario y los retos comunitarios gratuitos no requieren comprar este ticket. El entrenamiento de demostración es opcional, no muestra anuncios y continúa fuera de récords, desafíos y clasificaciones.</p>
      <Link href={offer.paths.practice} className="inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Volver a practicar gratis</Link>
    </section>

    {signedIn ? <p className="text-sm text-muted-foreground">Tu sesión está iniciada. Consultar esta ficha no te inscribe en un torneo.</p>
      : <p className="text-sm text-muted-foreground">No necesitas iniciar sesión para leer estas condiciones. Si lo prefieres, puedes <Link href={offer.paths.login} className="underline underline-offset-4">iniciar sesión y volver a esta ficha</Link>.</p>}

    <p className="text-sm text-muted-foreground">Esta consulta se registra sólo en este navegador. Puedes exportar el registro desde «Mi progreso» en la práctica. No es una suscripción, reserva ni compra, y no se envía como seguimiento central de ventas.</p>
    <TicketOffer2048Observer key={`${synthetic ? 'synthetic' : 'observed_browser'}:${offer.source}`}
      source={offer.source} category={synthetic ? 'synthetic' : 'observed_browser'} />
  </div>
}
