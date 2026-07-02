import { formatCLP } from '@/lib/utils'
import { selectPrizeTier, type PrizeTier } from '@/lib/tournament/finance'

interface Props {
  tiers: PrizeTier[]
  currentPlayerCount: number
  /** true mientras las inscripciones siguen abiertas (la bolsa aún puede subir). */
  registrationOpen: boolean
}

// Muestra la "bolsa garantizada escalonada": premios fijos publicados por tramos
// que suben con la convocatoria. Resalta el tramo alcanzado y, si aún hay
// inscripciones abiertas, cuánto falta para subir al siguiente.
export function PrizeLadder({ tiers, currentPlayerCount, registrationOpen }: Props) {
  // Sin escalera real (freeroll o torneo de un solo tramo): no aporta nada.
  if (tiers.length <= 1) return null

  const current = selectPrizeTier(tiers, currentPlayerCount)
  const next = tiers.find((tier) => tier.thresholdPlayers > currentPlayerCount)

  return (
    <div className="border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        Bolsa garantizada escalonada
      </h2>
      <p className="text-xs text-muted-foreground">
        Los montos son fijos y están publicados. La bolsa sube con la convocatoria; al cerrar las
        inscripciones se garantiza la bolsa del tramo alcanzado.
      </p>

      <div className="space-y-1.5">
        {tiers.map((tier) => {
          const reached = currentPlayerCount >= tier.thresholdPlayers
          const isCurrent = tier.thresholdPlayers === current.thresholdPlayers
          return (
            <div
              key={tier.thresholdPlayers}
              className={`flex justify-between items-center gap-4 text-sm rounded-lg px-3 py-2 border ${
                isCurrent
                  ? 'border-amber-300 bg-amber-50'
                  : reached
                    ? 'border-transparent'
                    : 'border-transparent text-muted-foreground'
              }`}
            >
              <span className="flex items-center gap-2">
                {tier.thresholdPlayers}+ jugadores
                {isCurrent && (
                  <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                    actual
                  </span>
                )}
              </span>
              <span className={`font-semibold ${isCurrent ? 'text-amber-700' : ''}`}>
                {formatCLP(tier.fundCents)}
              </span>
            </div>
          )
        })}
      </div>

      {registrationOpen && next && (
        <p className="text-xs text-muted-foreground">
          Faltan <span className="font-medium text-foreground">{next.thresholdPlayers - currentPlayerCount}</span>{' '}
          {next.thresholdPlayers - currentPlayerCount === 1 ? 'inscrito' : 'inscritos'} para subir la bolsa a{' '}
          <span className="font-medium text-foreground">{formatCLP(next.fundCents)}</span>.
        </p>
      )}
    </div>
  )
}
