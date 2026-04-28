import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

const CHILE_TIME_ZONE = 'America/Santiago'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatea centavos a pesos chilenos: 500000 → "$5.000"
export function formatCLP(cents: number | bigint): string {
  const pesos = Number(cents) / 100
  return '$' + pesos.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

// Formatea una fecha UTC a timezone Chile para mostrar en UI
export function formatDateCL(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(date).toLocaleString('es-CL', {
    timeZone: CHILE_TIME_ZONE,
    ...options,
  })
}

export function formatDateOnlyCL(date: string | Date): string {
  return formatDateCL(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateTimeCL(date: string | Date): string {
  return formatDateCL(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDateTimeParts(date: Date, timeZone = CHILE_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>
}

function getTimeZoneOffsetMs(date: Date, timeZone = CHILE_TIME_ZONE) {
  const parts = getDateTimeParts(date, timeZone)
  const utcEquivalent = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )

  return utcEquivalent - date.getTime()
}

export function formatDateTimeLocalInput(
  date: string | Date,
  timeZone = CHILE_TIME_ZONE
): string {
  const parts = getDateTimeParts(new Date(date), timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function parseDateTimeLocalToIso(
  value: string,
  timeZone = CHILE_TIME_ZONE
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(`Fecha inválida: ${value}`)
  }

  const [, year, month, day, hour, minute] = match
  const targetUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  )

  let candidateMs = targetUtcMs
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(candidateMs), timeZone)
    const nextCandidateMs = targetUtcMs - offsetMs

    if (nextCandidateMs === candidateMs) {
      break
    }

    candidateMs = nextCandidateMs
  }

  const iso = new Date(candidateMs).toISOString()
  if (formatDateTimeLocalInput(iso, timeZone) !== value) {
    throw new Error(`No se pudo convertir ${value} en la zona horaria ${timeZone}`)
  }

  return iso
}
