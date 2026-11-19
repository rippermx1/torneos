'use client'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { gameResultLabel } from '@/lib/game/game-snapshot'
import { read2048Results, type Game2048Results } from '@/lib/game/2048-results'
import type { TournamentUnityConfig, Unity2048State } from '@/lib/game/unity-2048-session'
import { formatCLP } from '@/lib/utils'
import styles from './unity-2048.module.css'

export function Game2048ResultsTable({ results }: { results: Game2048Results }) {
  const official = results.phase === 'official'
  return <>
    <p>{official ? 'Resultados oficiales' : 'Clasificación provisional · puede cambiar mientras el torneo sigue abierto o en revisión.'}</p>
    {results.rows.length === 0 ? <p>Aún no hay resultados visibles.</p> : <div className={styles.resultTable}>
      <table>
        <caption>Tabla de resultados · primeros 50 puestos</caption>
        <thead><tr><th scope="col">Puesto</th><th scope="col">Jugador</th><th scope="col">Puntaje</th><th scope="col">{official ? 'Premio' : 'Ficha'}</th></tr></thead>
        <tbody>{results.rows.map(row => <tr key={row.position} data-mine={row.isMe || undefined}>
          <td>{row.position}</td><th scope="row">{row.name}{row.isMe ? ' (tú)' : ''}</th>
          <td>{row.score.toLocaleString('es-CL')}</td><td>{official ? formatCLP(row.prizeCents ?? 0) : row.highestTile.toLocaleString('es-CL')}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>
}

function TournamentResults({ url }: { url: string }) {
  const [results, setResults] = useState<Game2048Results | null>(null)
  const [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    async function load() {
      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
        if (!response.ok) throw new Error('No se pudo cargar la tabla de resultados. Reintenta.')
        const data = read2048Results(await response.json())
        if (url !== `/api/tournaments/${data.tournamentId}/leaderboard`) throw new Error('La tabla no corresponde a este torneo.')
        if (alive) setResults(data)
      } catch {
        if (alive) setError('No se pudo cargar la tabla de resultados. Tu partida terminó; puedes reintentar o ver el ranking completo.')
      } finally { if (alive) setLoading(false) }
    }
    void load()
    return () => { alive = false; controller.abort() }
  }, [url, refresh])
  return <div aria-busy={loading}>
    {loading && <p role="status">Cargando tabla de resultados…</p>}
    {error && <p role="alert">{error}</p>}
    {results && <Game2048ResultsTable results={results} />}
    {!loading && <button type="button" className={styles.action} onClick={() => {
      setError(''); setLoading(true); setRefresh(value => value + 1)
    }}>{error ? 'Reintentar resultados' : 'Actualizar resultados'}</button>}
  </div>
}

export function Game2048Result({ state, tournament, onRestart }: {
  state: Unity2048State; tournament?: TournamentUnityConfig; onRestart: () => void
}) {
  const headingId = useId(), panel = useRef<HTMLElement>(null)
  useEffect(() => { panel.current?.focus({ preventScroll: true }) }, [])
  const practice = !tournament
  return <section ref={panel} className={styles.endPanel} tabIndex={-1} aria-labelledby={headingId}>
    <h2 id={headingId}>{practice ? 'Práctica terminada' : state.result_status === 'abandoned' ? 'Partida abandonada' : 'Partida terminada'}</h2>
    <p>{practice ? 'No quedan movimientos disponibles.' : gameResultLabel(state.result_status, state.end_reason)}</p>
    <p className={styles.finalScore}>Puntaje final: {state.score.toLocaleString('es-CL')}</p>
    {practice ? <button type="button" className={styles.action} onClick={onRestart}>Nueva partida</button> : <>
      <p>Resultado confirmado por el servidor.</p>
      {tournament.resultsUrl && <TournamentResults url={tournament.resultsUrl} />}
      {tournament.leaderboardUrl && <Link className={styles.action} href={tournament.leaderboardUrl}>Ver ranking completo</Link>}
    </>}
  </section>
}
