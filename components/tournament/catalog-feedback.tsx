import Link from 'next/link'

export function CatalogFeedback({ error, retryHref = '/tournaments' }: { error: boolean; retryHref?: string }) {
  return (
    <div role={error ? 'alert' : undefined} className="rounded-2xl border bg-muted/20 p-6 text-center sm:p-10">
      <h2 className="font-semibold">{error ? 'No pudimos cargar los torneos' : 'No hay torneos activos por ahora'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error ? 'Intenta nuevamente. También puedes practicar gratis mientras recuperamos la información.' : 'Puedes practicar 2048 gratis y volver a consultar los próximos torneos.'}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <a href={retryHref} className="rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">{error ? 'Reintentar' : 'Actualizar torneos'}</a>
        <Link href="/play" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Practicar gratis</Link>
      </div>
    </div>
  )
}
