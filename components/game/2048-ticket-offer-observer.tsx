'use client'

import { useEffect, useRef } from 'react'
import { TicketOfferObservations, type TicketOfferCategory, type TicketOfferSource } from '@/lib/games/2048/ticket-offer-observations'

/** One local informational view per mount, including Strict Mode effect replay. */
export function TicketOffer2048Observer({ source, category }: {
  source: TicketOfferSource
  category: TicketOfferCategory
}) {
  const observed = useRef(false)
  useEffect(() => {
    if (observed.current) return
    observed.current = true
    new TicketOfferObservations({ getStorage: () => window.localStorage, category }).recordView(source)
  }, [source, category])
  return null
}
