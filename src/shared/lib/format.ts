import { APP_LOCALE, APP_TIME_ZONE } from '../config/locale'
import { CENTS_PER_UNIT, SECONDS_PER_MINUTE } from '../config/units'

const moneyFormat = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 })
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

/** Formats cents as Chilean pesos: 500000 → "$5.000". */
export function formatMoney(cents: number): string {
  return '$' + moneyFormat.format(cents / CENTS_PER_UNIT)
}

/**
 * Formats an instant in Santiago time, whatever the server zone. Like the
 * legacy helper, an unparseable value renders as "Invalid Date" instead of throwing.
 */
export function formatDateTime(value: string | number): string {
  return new Date(value).toLocaleString(APP_LOCALE, DATE_TIME_OPTIONS)
}

export function secondsToMinutes(seconds: number): number {
  return seconds / SECONDS_PER_MINUTE
}
