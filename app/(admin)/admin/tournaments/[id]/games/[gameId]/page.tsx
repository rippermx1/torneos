import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTimeCL } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Game, GameMove } from '@/types/database'

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string; gameId: string }>
}) {
  const { id: tournamentId, gameId } = await params
  const supabase = createAdminClient()

  const [{ data: gameData }, { data: movesData }] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).single(),
    supabase
      .from('game_moves')
      .select('*')
      .eq('game_id', gameId)
      .order('move_number', { ascending: true })
      .limit(500),
  ])

  if (!gameData) notFound()
  const game = gameData as Game
  const moves = (movesData ?? []) as GameMove[]

  // Análisis anti-cheat básico
  const timestamps = moves.map((m) => m.client_timestamp)
  const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]!)
  const avgInterval = intervals.length > 0
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : 0
  const suspiciouslyFast = intervals.filter((i) => i < 50).length // < 50ms entre moves
  const suspiciouslyFastPct = intervals.length > 0
    ? ((suspiciouslyFast / intervals.length) * 100).toFixed(1)
    : '0'

  const isSuspicious = suspiciouslyFast > 5 || avgInterval < 100

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/tournaments/${tournamentId}/games`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Partidas
        </Link>
        <h1 className="text-xl font-bold">Revisión de partida</h1>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Score final', value: Number(game.final_score).toLocaleString('es-CL') },
          { label: 'Tile más alto', value: game.highest_tile || '—' },
          { label: 'Movimientos', value: game.move_count },
          { label: 'Estado', value: game.status },
        ].map(({ label, value }) => (
          <div key={label} className="border rounded-xl p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-semibold">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Análisis anti-cheat */}
      <div className={`border rounded-xl p-4 space-y-2 ${isSuspicious ? 'border-red-300 bg-red-50' : 'bg-muted/20'}`}>
        <h2 className={`text-sm font-semibold ${isSuspicious ? 'text-red-700' : ''}`}>
          {isSuspicious ? '⚠ Análisis de timing — Posible anomalía' : 'Análisis de timing — Normal'}
        </h2>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Intervalo promedio</p>
            <p className="font-semibold">{Math.round(avgInterval)} ms</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moves &lt; 50ms</p>
            <p className={`font-semibold ${suspiciouslyFast > 5 ? 'text-red-600' : ''}`}>
              {suspiciouslyFast} ({suspiciouslyFastPct}%)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Total moves</p>
            <p className="font-semibold">{moves.length}</p>
          </div>
        </div>
      </div>

      {/* Tablero final */}
      {game.current_board && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Tablero final</h2>
          <div className="inline-block bg-[#bbada0] rounded-xl p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {(game.current_board as number[][]).map((row, r) =>
                row.map((v, c) => (
                  <div
                    key={`${r}-${c}`}
                    className="w-14 h-14 rounded flex items-center justify-center text-sm font-bold bg-[#cdc1b4] text-[#776e65]"
                    style={{ background: v ? undefined : '#cdc1b4' }}
                  >
                    {v || ''}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log de movimientos */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Log de movimientos ({moves.length})</h2>
        <div className="border rounded-xl divide-y overflow-hidden max-h-96 overflow-y-auto">
          <div className="grid grid-cols-[3rem_6rem_auto_auto] gap-3 px-3 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40 sticky top-0">
            <span>#</span>
            <span>Dirección</span>
            <span>Score +</span>
            <span>Timestamp</span>
          </div>
          {moves.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[3rem_6rem_auto_auto] gap-3 px-3 py-2 text-xs"
            >
              <span className="font-mono text-muted-foreground">{m.move_number}</span>
              <span className="font-medium">{m.direction}</span>
              <span className={m.score_gained > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>
                {m.score_gained > 0 ? `+${m.score_gained}` : '—'}
              </span>
              <span className="text-muted-foreground">{formatDateTimeCL(m.server_timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
