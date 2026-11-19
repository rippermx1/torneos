import type { AvailabilityKind } from '../domain/availability'

/** Lower sorts first in public listings. */
export const AVAILABILITY_PRIORITY: Record<AvailabilityKind, number> = {
  open: 0,
  upcoming: 1,
  full: 2,
  unknown: 3,
  live: 4,
  closed: 5,
  finalizing: 5,
  completed: 6,
  cancelled: 7,
}
