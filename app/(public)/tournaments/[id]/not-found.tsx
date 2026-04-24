import Link from 'next/link'

export default function TournamentNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 space-y-4">
      <p className="text-5xl">🏆</p>
      <h1 className="text-2xl font-bold">Torneo no encontrado</h1>
      <p className="text-muted-foreground text-sm max-w-xs">
        Este torneo no existe o ya no está disponible.
      </p>
      <Link
        href="/tournaments"
        className="mt-2 bg-foreground text-background px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Ver torneos disponibles
      </Link>
    </div>
  )
}
