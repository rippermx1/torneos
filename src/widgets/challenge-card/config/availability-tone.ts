import type { AvailabilityKind } from '@entities/challenge'
import type { BadgeTone } from '@shared/ui'

export const AVAILABILITY_TONE: Record<AvailabilityKind, BadgeTone> = {
  open: 'success',
  upcoming: 'neutral',
  full: 'neutral',
  live: 'warning',
  finalizing: 'neutral',
  closed: 'neutral',
  completed: 'neutral',
  cancelled: 'neutral',
  unknown: 'neutral',
}
