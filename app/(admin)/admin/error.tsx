'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4">
      <p className="text-4xl">⚠️</p>
      <h2 className="text-xl font-bold">Error en el panel de administración</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Ocurrió un error al cargar esta sección. Puedes reintentar o volver al listado de torneos.
      </p>
      {error.digest && (
        <p className="text-xs font-mono text-muted-foreground">Ref: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          Reintentar
        </button>
        <Link
          href="/admin/tournaments"
          className="border px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted"
        >
          Ir a torneos
        </Link>
      </div>
    </div>
  )
}
