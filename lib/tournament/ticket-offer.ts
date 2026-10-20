import 'server-only'

import { withAuthDestination } from '@/lib/auth/redirect'
import { getTournamentPreset, pesosToCents } from '@/lib/tournament/finance'
import { formatCLP } from '@/lib/utils'

export type Ticket2048OfferSource = 'direct' | 'practice' | 'result'
export interface Ticket2048OfferMoney {
  readonly cents: number
  readonly pesos: number
  readonly label: string
}
export interface Ticket2048Offer {
  readonly version: 1
  readonly kind: 'informational'
  readonly status: 'unavailable'
  readonly presetKey: 'commercial_v1'
  readonly source: Ticket2048OfferSource
  readonly currency: 'CLP'
  readonly entryFee: Ticket2048OfferMoney
  readonly prizes: {
    readonly first: Ticket2048OfferMoney
    readonly second: Ticket2048OfferMoney
    readonly third: Ticket2048OfferMoney
    readonly total: Ticket2048OfferMoney
  }
  readonly minPlayers: number
  readonly maxPlayers: number
  readonly durationMinutes: number
  readonly windowHours: number
  readonly paths: { readonly self: string; readonly login: string; readonly signup: string; readonly practice: '/play' }
}

function whole(value: number, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error('El formato comercial informativo no es válido.')
  return value
}
function money(pesos: number): Ticket2048OfferMoney {
  whole(pesos, 0)
  const cents = whole(pesosToCents(pesos), 0)
  return { cents, pesos, label: formatCLP(cents) }
}

/**
 * Public information from the governed server preset, never checkout authority.
 * Auth, rewards, practice scores and catalog state are deliberately not inputs.
 */
export function get2048TicketOffer(source?: unknown): Ticket2048Offer {
  const preset = getTournamentPreset('commercial_v1')
  if (!preset || preset.key !== 'commercial_v1' || preset.tournamentType !== 'standard' || preset.isTest) {
    throw new Error('El formato comercial informativo no está configurado.')
  }
  const normalizedSource: Ticket2048OfferSource = source === 'practice' || source === 'result' ? source : 'direct'
  const self = normalizedSource === 'direct' ? '/play/2048/ticket' : `/play/2048/ticket?from=${normalizedSource}`
  const entryFee = money(whole(preset.entryFeePesos, 1))
  const first = money(preset.prize1Pesos), second = money(preset.prize2Pesos), third = money(preset.prize3Pesos)
  const total = money(whole(first.pesos + second.pesos + third.pesos, 0))
  const minPlayers = whole(preset.minPlayers, 2), maxPlayers = whole(preset.maxPlayers, minPlayers)
  return {
    version: 1, kind: 'informational', status: 'unavailable', presetKey: 'commercial_v1', source: normalizedSource,
    currency: 'CLP', entryFee, prizes: { first, second, third, total }, minPlayers, maxPlayers,
    durationMinutes: whole(preset.durationMinutes, 1), windowHours: whole(preset.windowHours, 1),
    paths: { self, login: withAuthDestination('/sign-in', self), signup: withAuthDestination('/sign-up', self), practice: '/play' },
  }
}
