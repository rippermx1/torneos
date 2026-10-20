import Link from 'next/link'
import type { Ticket2048Offer } from '@/lib/tournament/ticket-offer'

export function TicketOffer2048Banner({ offer }: { offer: Ticket2048Offer }) {
  return <section className="rounded-2xl border bg-muted/20 p-5 space-y-3" aria-labelledby="ticket-offer-heading">
    <h2 id="ticket-offer-heading" className="text-lg font-semibold">Torneos con ticket: todavía no disponibles</h2>
    <p className="text-sm text-muted-foreground">
      Conoce el formato propuesto de 2048: entrada total de {offer.entryFee.label} {offer.currency},
      una partida de {offer.durationMinutes} minutos y premios publicados antes de una futura inscripción.
    </p>
    <p className="text-sm text-muted-foreground">La práctica y el desafío diario siguen siendo gratuitos. Esta propuesta no abre inscripciones ni cobra entradas.</p>
    <Link href={offer.paths.self} className="inline-flex text-sm font-medium underline underline-offset-4">Consultar precio y condiciones propuestas</Link>
  </section>
}
