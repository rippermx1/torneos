'use client'
import { useEffect, useId, useRef } from 'react'
import type { RewardedSnapshot } from '@/lib/ads/rewarded'
import styles from './unity-2048.module.css'

function reasonLabel(reason: RewardedSnapshot['reason']): string {
  switch (reason) {
    case 'daily_cap': return 'Alcanzaste las dos continuaciones de demostración de hoy en este navegador. Puedes seguir jugando sin ayuda.'
    case 'already_applied': case 'duplicate': return 'Esta práctica ya utilizó su continuación. Puedes iniciar una nueva partida sin ayuda.'
    case 'storage_unavailable': return 'No pudimos acceder al almacenamiento del navegador para comprobar el límite. La práctica sin ayuda sigue disponible.'
    case 'storage_corrupt': case 'storage_uncertain': case 'storage_full': return 'No podemos confirmar el registro de demostraciones de este navegador. El entrenamiento está pausado; puedes seguir jugando sin ayuda.'
    case 'clock_invalid': case 'clock_rollback': return 'No pudimos confirmar la fecha para aplicar el límite diario de Chile. Puedes seguir jugando sin ayuda.'
    case 'locks_unavailable': return 'Este navegador no permite coordinar el límite entre pestañas. La práctica sin ayuda sigue disponible.'
    case 'cancelled': case 'closed': return 'Cancelaste la demostración. Tu resultado sigue intacto y no se consumió una continuación.'
    case 'ineligible': case 'invalidated': case 'request_mismatch': case 'late': case 'invalid_source': case 'destroyed': case 'grant_rejected':
      return 'Esa oportunidad ya no está disponible. Tu resultado se conserva; puedes iniciar una nueva partida sin ayuda.'
    case 'timeout': return 'La solicitud venció sin iniciar el entrenamiento. Puedes volver a intentarlo si la práctica sigue disponible.'
    case 'no_fill': case 'provider_unavailable': return 'El entrenamiento no está disponible en este momento. No se consumió una continuación; puedes volver a intentarlo.'
    case 'provider_error': case 'out_of_order': return 'No pudimos iniciar el entrenamiento. Puedes volver a intentarlo o comenzar una partida sin ayuda.'
    case 'off': case 'provider_not_configured': return 'La demostración no está disponible. No hay publicidad real activa; puedes seguir jugando sin ayuda.'
    case 'busy': return 'Ya hay una solicitud de entrenamiento en curso.'
    default: return ''
  }
}

/** Explicit consent for a local demo; this panel never displays or imitates an ad. */
export function Rewarded2048Demo({ snapshot, onContinue, onCancel }: {
  snapshot: RewardedSnapshot
  onContinue: (requestId: string) => void
  onCancel: (requestId: string) => void
}) {
  const headingId = useId(), panel = useRef<HTMLElement>(null)
  const waiting = snapshot.mode === 'demo' && (snapshot.status === 'pending' || snapshot.status === 'applying')
  const requestId = waiting ? snapshot.requestId : null
  useEffect(() => { if (requestId) panel.current?.focus({ preventScroll: true }) }, [requestId])
  const message = snapshot.reason === 'daily_cap' && snapshot.remainingToday !== 0 ? '' : reasonLabel(snapshot.reason)
  return <div className={styles.rewardedInformation}>
    <p>Límite de demostración: una continuación por práctica y dos al día de Chile, en este navegador.</p>
    {snapshot.usedToday !== null && snapshot.remainingToday !== null && <p>
      Continuaciones utilizadas hoy: {snapshot.usedToday} de 2 · disponibles: {snapshot.remainingToday}.
    </p>}
    {message && <p role="status" aria-atomic="true">{message}</p>}
    {requestId && <section ref={panel} tabIndex={-1} aria-labelledby={headingId} className={styles.rewardedPanel}>
      <h3 id={headingId}>Demostración de entrenamiento</h3>
      <p>Aquí no se mostrará ningún anuncio. «Continuar entrenamiento» inicia una continuación asistida de esta práctica.</p>
      <p>Tu resultado original se conserva. No cuenta para récords, desafío diario, retorno ni torneos. Cancelar no consume una continuación.</p>
      {snapshot.status === 'applying' && <p role="status">Preparando el entrenamiento…</p>}
      <div className={styles.rewardedActions}>
        <button type="button" className={styles.action} disabled={snapshot.status === 'applying'} onClick={() => onContinue(requestId)}>Continuar entrenamiento</button>
        <button type="button" className={styles.action} disabled={snapshot.status === 'applying'} onClick={() => onCancel(requestId)}>Cancelar</button>
      </div>
    </section>}
  </div>
}
