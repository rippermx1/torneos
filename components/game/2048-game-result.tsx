'use client'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { gameResultLabel } from '@/lib/game/game-snapshot'
import { read2048Results, type Game2048Results } from '@/lib/game/2048-results'
import type { TournamentUnityConfig, Unity2048State } from '@/lib/game/unity-2048-session'
import { formatCLP } from '@/lib/utils'
import styles from './unity-2048.module.css'
import type { Practice2048Snapshot } from '@/lib/game/practice-2048-experience'
import { Practice2048ResultProgress } from './2048-personal-progress'
import type { Free2048Snapshot } from '@/lib/game/free-2048-experience'
import type { Daily2048Challenge } from '@/lib/game/daily-2048'
import { Daily2048ResultProgress } from './2048-daily-progress'
import { isCommunityFreePresetKey } from '@/lib/tournament/community-free'
import type { TournamentPresetKey } from '@/types/database'
import type { Training2048State } from '@/lib/game/2048-training'
import type { Direction } from '@/lib/game/engine'
import type { RewardedSnapshot } from '@/lib/ads/rewarded'
import { Rewarded2048Demo } from './2048-rewarded-demo'

const DIRECTION_LABEL: Record<Direction, string> = { up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha' }

function OriginalPracticeResult({ training }: { training: Training2048State }) {
  return <div className={styles.trainingOriginal}>
    <p><strong>Resultado original conservado:</strong> {training.originalScore.toLocaleString('es-CL')} puntos · ficha máxima {training.originalHighestTile.toLocaleString('es-CL')} · {training.originalMoves.toLocaleString('es-CL')} movimientos.</p>
    <p>Última jugada original: {DIRECTION_LABEL[training.originalDirection]}.</p>
  </div>
}

export function Training2048View({ training, onAlternative, disabled = false }: {
  training: Training2048State; onAlternative: (direction: Direction) => void; disabled?: boolean
}) {
  if (training.phase !== 'active') return null
  return <section className={styles.trainingPanel} aria-label="Explorar una jugada en entrenamiento">
    <h2>Explora otra jugada</h2>
    <OriginalPracticeResult training={training} />
    <p>Esta continuación no actualiza tus marcas, desafío diario, clasificación ni premios.</p>
    {training.awaitingAlternative && <>
      <p>Elige una alternativa que permite continuar:</p>
      <div className={styles.trainingDirections} role="group" aria-label="Direcciones alternativas de entrenamiento">
        {training.alternativeDirections.map(direction => <button key={direction} type="button" className={styles.action}
          disabled={disabled} onClick={() => onAlternative(direction)} aria-label={`Probar dirección ${DIRECTION_LABEL[direction].toLowerCase()} en entrenamiento`}>
          {DIRECTION_LABEL[direction]}
        </button>)}
      </div>
      <p>También puedes usar una de estas direcciones con el teclado o deslizando sobre el tablero.</p>
    </>}
  </section>
}

export function Game2048ResultsTable({ results, presetKey }: { results: Game2048Results; presetKey?: TournamentPresetKey }) {
  const official = results.phase === 'official'
  const community = isCommunityFreePresetKey(results.presetKey ?? presetKey)
  const showPrize = official && !community
  return <>
    <p>{official ? 'Resultados oficiales' : 'Clasificación provisional · puede cambiar mientras el torneo sigue abierto o en revisión.'}</p>
    {results.rows.length === 0 ? <p>Aún no hay resultados visibles.</p> : <div className={styles.resultTable}>
      <table>
        <caption>Tabla de resultados · primeros 50 puestos</caption>
        <thead><tr><th scope="col">Puesto</th><th scope="col">Jugador</th><th scope="col">Puntaje</th><th scope="col">{showPrize ? 'Premio' : 'Ficha máxima'}</th></tr></thead>
        <tbody>{results.rows.map(row => <tr key={row.position} data-mine={row.isMe || undefined}>
          <td>{row.position}</td><th scope="row">{row.name}{row.isMe ? ' (tú)' : ''}</th>
          <td>{row.score.toLocaleString('es-CL')}</td><td>{showPrize ? formatCLP(row.prizeCents ?? 0) : row.highestTile.toLocaleString('es-CL')}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>
}

function TournamentResults({ url, presetKey }: { url: string; presetKey?: TournamentPresetKey }) {
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
    {results && <Game2048ResultsTable results={results} presetKey={presetKey} />}
    {!loading && <button type="button" className={styles.action} onClick={() => {
      setError(''); setLoading(true); setRefresh(value => value + 1)
    }}>{error ? 'Reintentar resultados' : 'Actualizar resultados'}</button>}
  </div>
}

export function Game2048Result({ state, tournament, onRestart, personal, daily, dailyChallenge, restartDisabled = false, freeMode, onBeginTraining, rewarded, onContinueRewarded, onCancelRewarded }: {
  state: Unity2048State; tournament?: TournamentUnityConfig; onRestart: () => void; personal?: Practice2048Snapshot | null
  daily?: Free2048Snapshot['daily']; dailyChallenge?: Daily2048Challenge | null; restartDisabled?: boolean
  freeMode?: 'practice' | 'daily'; onBeginTraining?: (sourceId: string) => void
  rewarded?: RewardedSnapshot | null; onContinueRewarded?: (requestId: string) => void; onCancelRewarded?: (requestId: string) => void
}) {
  const headingId = useId(), panel = useRef<HTMLElement>(null), offerControl = useRef<HTMLButtonElement>(null)
  const pendingOffer = useRef<{ requestId: string; sourceId: string } | null>(null)
  useEffect(() => { panel.current?.focus({ preventScroll: true }) }, [])
  const practice = !tournament
  const training = state.training
  const assisted = practice && !!training && (training.phase === 'active' || training.phase === 'ended')
  const offeredTraining = practice && state.mode === 'practice' && freeMode === 'practice' && !dailyChallenge && state.game_over
    && training?.phase === 'offered' && training.alternativeDirections.length > 0 && onBeginTraining ? training : null
  const offeredSourceId = offeredTraining?.sourceId
  const currentRewarded = rewarded && (rewarded.sourceId === null || rewarded.sourceId === offeredSourceId) ? rewarded : null
  const rewardPending = currentRewarded?.status === 'pending' || currentRewarded?.status === 'applying'
  const rewardUnavailable = !!currentRewarded && !currentRewarded.available
  const rewardRequestId = currentRewarded?.requestId, rewardStatus = currentRewarded?.status
  useEffect(() => {
    const previous = pendingOffer.current
    pendingOffer.current = rewardPending && rewardRequestId && offeredSourceId ? { requestId: rewardRequestId, sourceId: offeredSourceId } : null
    if (previous && !rewardPending && previous.sourceId === offeredSourceId && rewardStatus !== 'cancelled') {
      requestAnimationFrame(() => {
        if (offerControl.current && !offerControl.current.disabled) offerControl.current.focus({ preventScroll: true })
        else panel.current?.focus({ preventScroll: true })
      })
    }
  }, [rewardPending, rewardRequestId, offeredSourceId, rewardStatus])
  return <section ref={panel} className={styles.endPanel} tabIndex={-1} aria-labelledby={headingId}>
    <h2 id={headingId}>{assisted ? 'Entrenamiento terminado' : practice ? dailyChallenge ? 'Partida del desafío terminada' : 'Práctica terminada' : state.result_status === 'abandoned' ? 'Partida abandonada' : 'Partida terminada'}</h2>
    <p>{assisted ? 'La continuación asistida terminó. Tu práctica original conserva su resultado.' : practice ? 'No quedan movimientos disponibles.' : gameResultLabel(state.result_status, state.end_reason)}</p>
    <p className={styles.finalScore}>{assisted ? 'Puntaje del entrenamiento' : 'Puntaje final'}: {state.score.toLocaleString('es-CL')}</p>
    {assisted && training && <>
      <span className={styles.trainingBadge}>Entrenamiento · partida asistida</span>
      <p>Demostración sin anuncios</p>
      <OriginalPracticeResult training={training} />
      <p>No cuenta para marcas, desafíos ni clasificaciones.</p>
    </>}
    {practice && !assisted && personal && <Practice2048ResultProgress progress={personal} score={state.score} />}
    {practice && !assisted && daily && <Daily2048ResultProgress daily={daily} />}
    {practice ? <>
      <button type="button" className={styles.action} onClick={onRestart} disabled={restartDisabled}>{assisted ? 'Nueva partida sin ayuda' : dailyChallenge ? 'Jugar desafío de hoy' : 'Nueva partida'}</button>
      <Link className={styles.action} href="/play/2048/ticket?from=result">Torneos con ticket · todavía no disponibles</Link>
    </> : <>
      <p>Resultado confirmado por el servidor.</p>
      {tournament.resultsUrl && <TournamentResults url={tournament.resultsUrl} presetKey={tournament.presetKey} />}
      {tournament.leaderboardUrl && <Link className={styles.action} href={tournament.leaderboardUrl}>Ver ranking completo</Link>}
      {isCommunityFreePresetKey(tournament.presetKey) && <Link className={styles.action} href="/play">Practicar y consultar el próximo reto</Link>}
    </>}
    {offeredTraining && <div className={styles.trainingOffer}>
      <p>Demostración sin anuncio real: vuelve una vez al estado previo a tu último movimiento válido y explora otra dirección.</p>
      <p>Tu resultado original se conserva. La continuación es asistida y no cuenta para récords, desafíos o torneos.</p>
      <button ref={offerControl} type="button" className={styles.action} disabled={restartDisabled || rewardPending || rewardUnavailable || currentRewarded?.remainingToday === 0} onClick={() => { if (offeredSourceId) onBeginTraining?.(offeredSourceId) }}>
        Probar otra jugada · demostración
      </button>
      {currentRewarded && onContinueRewarded && onCancelRewarded && <Rewarded2048Demo snapshot={currentRewarded}
        onContinue={onContinueRewarded} onCancel={requestId => {
          onCancelRewarded(requestId)
          requestAnimationFrame(() => {
            if (offerControl.current && !offerControl.current.disabled) offerControl.current.focus({ preventScroll: true })
            else panel.current?.focus({ preventScroll: true })
          })
        }} />}
    </div>}
  </section>
}
