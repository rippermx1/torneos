'use client'
import type { Daily2048Challenge } from '@/lib/game/daily-2048'
import type { Free2048Snapshot } from '@/lib/game/free-2048-experience'
import styles from './unity-2048.module.css'

const number = (value: number) => value.toLocaleString('es-CL')
const date = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long' })

export function Daily2048View({ challenge, free, error, onRefresh }: {
  challenge: Daily2048Challenge | null; free: Free2048Snapshot | null; error: string; onRefresh: () => void
}) {
  const record = free?.daily.record
  const currentRecord = record?.day === challenge?.day ? record : null
  const previous = free?.mode === 'daily' && free.challenge?.id !== challenge?.id
  return <section className={styles.dailyChallenge} aria-label="Desafío diario gratuito">
    <h2>Desafío diario{challenge ? ` · ${date(challenge.day)}` : ''}</h2>
    <p>Forma una ficha de <strong>128</strong>. Todos parten del mismo tablero del día, con reintentos gratuitos. Cambia cada día según la hora de Chile.</p>
    <p>Sin premios. Cambiar de modo comienza otra partida.</p>
    {!challenge && !error && <p>Preparando el desafío de hoy…</p>}
    {challenge && free && !free.dailyTimeConfirmed && <p>Confirmando el día del desafío. La práctica libre sigue disponible.</p>}
    {error && <div><p>{error}</p><button type="button" className={styles.action} onClick={onRefresh}>Actualizar desafío</button></div>}
    {previous && <p role="status">Tu partida corresponde a un desafío anterior. Usa «Jugar desafío de hoy» para comenzar el nuevo tablero.</p>}
    {currentRecord && <>
      <p><strong>{currentRecord.goalReached ? '¡Meta de hoy cumplida!' : 'Meta de hoy pendiente'}</strong> · {number(currentRecord.attempts)} {currentRecord.attempts === 1 ? 'intento' : 'intentos'}</p>
      <p>Mejor puntaje de hoy: {number(currentRecord.score)} · Ficha máxima: {number(currentRecord.highestTile)}</p>
      {currentRecord.goalReached && <p>Puedes seguir jugando. Mañana habrá otro tablero para superar.</p>}
    </>}
    {free && free.daily.storageStatus !== 'ready' && <p>No pudimos guardar el desafío en este navegador. Tu progreso de esta visita podría perderse al salir.</p>}
  </section>
}

export function Daily2048ResultProgress({ daily }: { daily: Free2048Snapshot['daily'] }) {
  return <div className={styles.resultProgress}>
    <p><strong>{daily.record?.goalReached ? '¡Meta diaria cumplida!' : daily.record?.status === 'expired' ? 'El desafío del día ya cerró.' : 'La meta diaria sigue pendiente.'}</strong></p>
    <p>{daily.record?.goalReached ? 'Vuelve mañana para descubrir el nuevo tablero.' : 'Prueba otra estrategia: conserva tu ficha mayor en una esquina.'}</p>
    <p>Mejor puntaje del desafío: {number(daily.record?.score ?? 0)} · {daily.storageStatus === 'ready' ? 'Guardado en este navegador.' : 'No se pudo guardar.'}</p>
  </div>
}

export function Return2048View({ free, measureAccountActivity }: { free: Free2048Snapshot | null; measureAccountActivity: boolean }) {
  const days = free?.retention.daysPlayedCount ?? 0
  return <details className={styles.personalProgress}>
    <summary>Mis días de juego{free ? ` · ${free.retention.daysPlayedCount}` : ''}</summary>
    <div>
      <p>Has jugado {number(days)} {days === 1 ? 'día' : 'días'} en este navegador. Cuenta un día cuando haces al menos un movimiento válido, en práctica o en el desafío.</p>
      <p>Vuelve mañana: habrá un nuevo tablero diario. Este historial es local y puede perderse si borras los datos del navegador.</p>
      {measureAccountActivity ? <>
        <p>Con tu sesión iniciada registramos los días que juegas para medir el regreso a 2048, sin guardar tu tablero ni tu puntuación.</p>
        {free?.accountStatus === 'recorded' && <p>Actividad de hoy registrada en tu cuenta.</p>}
        {free?.accountStatus === 'anonymous' && <p>Tu sesión ya no está activa. Esta visita queda registrada sólo en este navegador.</p>}
        {free?.accountStatus === 'unavailable' && <p>No pudimos registrar la actividad en tu cuenta. Puedes seguir jugando.</p>}
      </> : <p>Puedes jugar sin cuenta. Si inicias sesión, podremos reconocer los días que vuelves también desde otros dispositivos.</p>}
      {free && free.retention.quality.storageStatus !== 'ready' && <p>No pudimos conservar el historial de días en este navegador.</p>}
    </div>
  </details>
}
