import Link from 'next/link'

// ───────────────────────────────────────────────────────────────
// Página obsoleta. En Ruta 1 ya no se aceptan cargas de saldo:
// cada inscripción a torneo es un cobro Flow individual.
// La cuenta sólo conserva saldo retirable.
// ───────────────────────────────────────────────────────────────
export default function DepositDeprecatedPage() {
  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Cargas de saldo no disponibles</h1>
      <p className="text-sm text-foreground/70">
        Ya no es necesario cargar saldo. Inscríbete directamente en cada torneo desde su
        página y paga con Flow al momento. Tu cuenta conserva saldo retirable solo para
        premios y reembolsos.
      </p>
      <div className="flex flex-col gap-2 pt-2">
        <Link
          href="/tournaments"
          className="rounded-xl bg-foreground px-4 py-3 text-center font-medium text-background"
        >
          Ver torneos
        </Link>
        <Link
          href="/wallet"
          className="rounded-xl border border-foreground/20 px-4 py-3 text-center font-medium"
        >
          Volver a mi saldo
        </Link>
      </div>
    </div>
  )
}
