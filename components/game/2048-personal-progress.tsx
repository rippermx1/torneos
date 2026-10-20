'use client'
import type { Practice2048Snapshot } from '@/lib/game/practice-2048-experience'
import styles from './unity-2048.module.css'

const number = (value: number) => value.toLocaleString('es-CL')
export function Personal2048ProgressView({ progress, onExport }: {
  progress: Practice2048Snapshot | null; onExport: () => void
}) {
  return <details className={styles.personalProgress}>
    <summary>Mi progreso · marca {progress ? number(progress.bestScore) : '—'}</summary>
    <div>
      <p>Tu mejor puntaje: <strong>{progress ? number(progress.bestScore) : '—'}</strong> · Ficha máxima: <strong>{progress ? number(progress.bestTile) : '—'}</strong></p>
      <p>{progress?.bestScore ? `Tu próximo objetivo: superar ${number(progress.bestScore)} puntos.` : 'Tu primer objetivo: formar una ficha de 128.'}</p>
      <p>Se guarda en este navegador. Las prácticas no otorgan premios.</p>
      {progress && progress.storageStatus !== 'ready' && <p role="status">No pudimos guardar el progreso en este navegador. Puedes seguir jugando; las marcas de esta visita podrían perderse al salir.</p>}
      <h3>Últimas cinco partidas</h3>
      {!progress?.history.length ? <p>Inicia una partida para registrar tu progreso.</p> : <ol className={styles.practiceHistory}>
        {progress.history.map(entry => <li key={entry.practiceId}>
          <span>{new Date(entry.startedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <strong>{number(entry.score)} puntos · ficha {number(entry.highestTile)}</strong>
          <span>{number(entry.moves)} movimientos · {entry.status === 'completed' ? 'Terminada' : entry.status === 'interrupted' ? 'Reiniciada' : entry.practiceId === progress.currentPracticeId ? 'En curso' : 'Sin cierre registrado'}</span>
        </li>)}
      </ol>}
      <details>
        <summary>Registro local de uso</summary>
        <p>Puedes descargar las observaciones de este navegador para revisar inicios, movimientos y nuevas partidas. El registro no se envía automáticamente y no identifica personas ni mide la audiencia total.</p>
        <button type="button" className={styles.action} onClick={onExport} disabled={!progress}>Descargar registro local</button>
      </details>
    </div>
  </details>
}

export function Practice2048ResultProgress({ progress, score }: { progress: Practice2048Snapshot; score: number }) {
  const improved = score > progress.bestBefore && score >= progress.bestScore && score > 0
  return <div className={styles.resultProgress}>
    <p><strong>{improved ? '¡Nueva marca personal!' : 'Tu marca personal'} · {number(progress.bestScore)} puntos</strong></p>
    <p>{improved ? 'Vuelve a jugar y trata de superar tu nueva marca.' : progress.bestScore > score ? `Te faltaron ${number(progress.bestScore - score + 4)} puntos para superar tu marca personal.` : progress.bestScore > 0 ? 'Igualaste tu marca. Vuelve a jugar para superarla.' : 'Vuelve a jugar e intenta formar una ficha de 128.'}</p>
    <p>Ficha máxima personal: {number(progress.bestTile)} · {progress.storageStatus === 'ready' ? 'Guardado en este navegador.' : 'Disponible durante esta visita; no se pudo guardar.'}</p>
  </div>
}
