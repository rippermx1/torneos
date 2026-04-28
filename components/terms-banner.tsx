'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Banner que se muestra cuando el usuario autenticado aún no ha aceptado
 * los Términos y Condiciones. Bloquea la interacción hasta que los acepta.
 *
 * Se muestra como barra fija en la parte superior; el resto de la página
 * queda visible pero deshabilitada visualmente para incentivar la acción.
 */
export function TermsBanner() {
  const [accepting, setAccepting] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const router = useRouter()

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/accept-terms', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al registrar la aceptación. Intenta de nuevo.')
        return
      }
      // Refrescar la página para que el server component re-renderice sin el banner
      router.refresh()
    } catch {
      setError('Error de red. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aceptación de Términos y Condiciones"
      className="fixed inset-x-0 bottom-0 z-50 bg-background border-t shadow-lg"
    >
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold">Acepta los Términos y Condiciones para participar</p>
          <p className="text-xs text-muted-foreground">
            Para inscribirte en torneos necesitas aceptar nuestras{' '}
            <Link href="/legal/terminos" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Bases Legales
            </Link>
            {' '}(competencia de habilidad, política antifraude, condiciones de pago y retiro).
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/legal/terminos"
            target="_blank"
            className="text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Leer términos
          </Link>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="text-xs bg-foreground text-background rounded-lg px-4 py-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {accepting ? 'Guardando...' : 'Acepto los Términos'}
          </button>
        </div>
      </div>
    </div>
  )
}
