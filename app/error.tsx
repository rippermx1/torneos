'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
      <p className="text-5xl">⚠️</p>
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-muted-foreground text-sm max-w-xs">
        Ocurrió un error inesperado. Puedes intentar nuevamente o volver al inicio.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground font-mono">Ref: {error.digest}</p>
      )}
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="bg-foreground text-background px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="border px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  )
}
