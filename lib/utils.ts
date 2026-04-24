import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
    timeZone: 'America/Santiago',
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
