import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <p className="text-muted-foreground text-sm max-w-xs">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="mt-2 bg-foreground text-background px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
